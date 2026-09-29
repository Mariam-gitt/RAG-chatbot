import { prisma } from "@/lib/prisma";
import { ingestDocument } from "@/lib/documents/ingestDocument";

const API = "https://api.github.com";
const MAX_FILES = 25; // per import; ingestion runs inside the request
const MAX_FILE_BYTES = 100 * 1024;
const CODE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "cs", "go", "rs",
  "html", "css", "md", "sql",
]);
const SKIP_DIRS = ["node_modules/", "dist/", "build/", ".next/", "vendor/", ".git/", "coverage/"];

export interface ImportRepoResult {
  repo: string;
  imported: number;
  failed: { path: string; error: string }[];
  skippedOverLimit: number;
}

function githubHeaders(raw = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/?#]|$)/);
  const owner = match?.[1];
  const repo = match?.[2];
  return owner && repo ? { owner, repo } : null;
}

export function isWantedFile(path: string, size: number): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (!CODE_EXTENSIONS.has(ext)) return false;
  if (path.includes(".min.")) return false;
  if (SKIP_DIRS.some((dir) => path.startsWith(dir) || path.includes(`/${dir}`))) return false;
  return size > 0 && size <= MAX_FILE_BYTES;
}

/**
 * Imports the code/markdown files of a GitHub repo as separate Documents
 * (source = "github"). Reuses the normal ingestDocument pipeline, so
 * embedding, storage and search work exactly like uploaded files.
 * Re-importing a file replaces its old copy instead of duplicating it.
 */
export async function importRepo(repoUrl: string): Promise<ImportRepoResult> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new Error("That doesn't look like a GitHub repo URL.");
  const { owner, repo } = parsed;

  const treeResponse = await fetch(
    `${API}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    { headers: githubHeaders() }
  );
  if (!treeResponse.ok) {
    throw new Error(
      treeResponse.status === 404
        ? "Repo not found. If it's private, set GITHUB_TOKEN in .env."
        : `GitHub returned an error (${treeResponse.status}). You may have hit the rate limit.`
    );
  }
  const { tree } = (await treeResponse.json()) as {
    tree: { path: string; type: string; size?: number }[];
  };

  const candidates = tree.filter((t) => t.type === "blob" && isWantedFile(t.path, t.size ?? 0));
  const files = candidates.slice(0, MAX_FILES);

  let imported = 0;
  const failed: ImportRepoResult["failed"] = [];

  for (const file of files) {
    const sourceUrl = `https://github.com/${owner}/${repo}/blob/HEAD/${file.path}`;
    try {
      const response = await fetch(
        `${API}/repos/${owner}/${repo}/contents/${encodeURI(file.path)}`,
        { headers: githubHeaders(true) }
      );
      if (!response.ok) throw new Error(`GitHub error ${response.status}`);
      const buffer = Buffer.from(await response.text(), "utf-8");

      await prisma.document.deleteMany({ where: { source: "github", sourceUrl } });

      await ingestDocument({
        fileName: `${repo}/${file.path}`,
        fileType: "txt",
        fileSize: buffer.length,
        buffer,
        source: "github",
        sourceUrl,
      });
      imported++;
    } catch (err) {
      // ingestDocument leaves a FAILED row behind; drop it so the list stays clean.
      await prisma.document.deleteMany({ where: { source: "github", sourceUrl, status: "FAILED" } });
      failed.push({ path: file.path, error: err instanceof Error ? err.message : "failed" });
    }
  }

  return {
    repo: `${owner}/${repo}`,
    imported,
    failed,
    skippedOverLimit: Math.max(0, candidates.length - MAX_FILES),
  };
}
