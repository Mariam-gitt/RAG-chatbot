"use client";

import { useState } from "react";

interface GitHubImportProps {
  onImported: () => void;
}

/** Paste a GitHub repo URL and import its code files. Talks to POST /api/github/import. */
export default function GitHubImport({ onImported }: GitHubImportProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!repoUrl.trim()) return;
    setImporting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import failed.");

      let text = `Imported ${data.imported} file(s) from ${data.repo}.`;
      if (data.skippedOverLimit > 0) {
        text += ` ${data.skippedOverLimit} more were skipped (25 files per import).`;
      }
      if (data.failed?.length > 0) text += ` ${data.failed.length} failed.`;
      setMessage(text);
      setRepoUrl("");
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Import a GitHub repo</span>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleImport()}
          placeholder="https://github.com/owner/repo"
          disabled={importing}
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
        />
      </label>
      <button
        onClick={handleImport}
        disabled={importing || !repoUrl.trim()}
        className="rounded-md bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-600 disabled:opacity-50"
      >
        Import repo
      </button>
      {importing && <p className="text-sm text-slate-500">Importing files, this can take a minute…</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">Code and Markdown files, up to 25 per import.</p>
    </div>
  );
}
