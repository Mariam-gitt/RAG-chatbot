import type { SourceReference } from "@/lib/types";

/** One small card showing where a piece of an answer came from. */
export default function SourceCard({ source, index }: { source: SourceReference; index: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
      <p className="font-medium text-slate-600">
        [{index + 1}] {source.documentName}
        {source.pageNumber ? ` · page ${source.pageNumber}` : ""}
      </p>
      <p className="mt-1 line-clamp-2 text-slate-500">{source.snippet}</p>
    </div>
  );
}
