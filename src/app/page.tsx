"use client";

import { useCallback, useEffect, useState } from "react";
import DocumentUpload from "@/components/DocumentUpload";
import DocumentList, { type DocumentSummary } from "@/components/DocumentList";
import ChatWindow from "@/components/ChatWindow";
import GitHubImport from "@/components/GitHubImport";

export default function HomePage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);

  const refreshDocuments = useCallback(async () => {
    const response = await fetch("/api/documents");
    const data = await response.json();
    setDocuments(data.documents ?? []);
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  return (
    <main className="mx-auto flex h-screen max-w-6xl gap-4 p-4">
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">RAG Document Chatbot</h1>
          <p className="text-xs text-slate-400">Ask questions grounded in your own documents.</p>
        </div>
        <DocumentUpload onUploaded={refreshDocuments} />
        <GitHubImport onImported={refreshDocuments} />
        <div className="flex-1">
          <h2 className="mb-2 text-sm font-medium text-slate-600">Documents</h2>
          <DocumentList documents={documents} onDeleted={refreshDocuments} />
        </div>
      </aside>

      <section className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        <ChatWindow hasDocuments={documents.some((d) => d.status === "READY")} />
      </section>
    </main>
  );
}
