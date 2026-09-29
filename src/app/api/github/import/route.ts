import { NextResponse } from "next/server";
import { z } from "zod";
import { importRepo } from "@/lib/github/importRepo";
import { checkRateLimit, getClientKey } from "@/lib/security/rateLimit";

export const maxDuration = 300;

const importRequestSchema = z.object({ repoUrl: z.string().trim().url() });

export async function POST(request: Request) {
  if (!checkRateLimit(getClientKey(request)).allowed) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const body = importRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Enter a GitHub repo URL like https://github.com/owner/repo" },
      { status: 400 }
    );
  }

  try {
    const result = await importRepo(body.data.repoUrl);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
