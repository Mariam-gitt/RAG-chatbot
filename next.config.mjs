/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse relies on Node APIs; keep document/RAG code on the server only.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
