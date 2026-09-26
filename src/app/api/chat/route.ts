import { NextResponse } from "next/server";
import { chatRequestSchema } from "@/lib/validation";
import { answerQuestion } from "@/lib/chat/answerQuestion";
import { checkRateLimit, getClientKey } from "@/lib/security/rateLimit";

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(getClientKey(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const result = await answerQuestion(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate an answer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
