/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a self-contained server in .next/standalone for slim Docker images.
  // Required for ModelScope / HuggingFace Spaces Docker mode and any container deploy.
  output: 'standalone',
}
export default nextConfig
