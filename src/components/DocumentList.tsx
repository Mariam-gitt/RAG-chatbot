"use client";

export interface DocumentSummary {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: "PROCESSING" | "READY" | "FAILED";
  pageCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  _count: { chunks: number };
}

interface DocumentListProps {
  documents: DocumentSummary[];
  onDeleted: () => void;
}

const STATUS_STYLES: Record<DocumentSummary["status"], string> = {
  PROCESSING: "bg-amber-100 text-amber-700",
  READY: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/** Read-only list of uploaded documents with status badges and delete. */
export default function DocumentList({ documents, onDeleted }: DocumentListProps) {
  async function handleDelete(id: string) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    onDeleted();
  }

  if (documents.length === 0) {
    return <p className="text-sm text-slate-400">No documents uploaded yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-white p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800" title={doc.fileName}>
              {doc.fileName}
            </p>
            <p className="text-xs text-slate-400">
              {formatSize(doc.fileSize)}
              {doc.pageCount ? ` · ${doc.pageCount} pages` : ""} · {doc._count.chunks} chunks
            </p>
            {doc.status === "FAILED" && doc.errorMessage && (
              <p className="mt-1 text-xs text-red-600">{doc.errorMessage}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[doc.status]}`}>
              {doc.status}
            </span>
            <button
              onClick={() => handleDelete(doc.id)}
              className="text-xs text-slate-400 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
