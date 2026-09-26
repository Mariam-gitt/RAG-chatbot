import SourceCard from "@/components/SourceCard";
import type { SourceReference } from "@/lib/types";

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sources?: SourceReference[];
}

/** A single chat bubble, with source cards under grounded assistant answers. */
export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "USER";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] space-y-2 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
            isUser ? "bg-brand-500 text-white" : "bg-white text-slate-800 border border-slate-200"
          }`}
        >
          {message.content}
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="space-y-1">
            {message.sources.map((source, i) => (
              <SourceCard key={`${source.documentId}-${source.chunkIndex}`} source={source} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
