"use client";

import { useRef, useState } from "react";

interface DocumentUploadProps {
  onUploaded: () => void;
}

/** File picker + upload button. Talks to POST /api/documents. */
export default function DocumentUpload({ onUploaded }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Upload failed.");
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Upload a document</span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full cursor-pointer rounded-md border border-slate-300 bg-white text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-white hover:file:bg-brand-600 disabled:opacity-50"
        />
      </label>
      {uploading && <p className="text-sm text-slate-500">Uploading and processing…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">PDF, TXT or Markdown, up to 10MB.</p>
    </div>
  );
}
