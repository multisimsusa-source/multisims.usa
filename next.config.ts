import type { NextConfig } from "next"

const supabaseUrl = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"
)
const isLocalSupabase = ["127.0.0.1", "localhost"].includes(
  supabaseUrl.hostname
)

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
        hostname: supabaseUrl.hostname,
        port: supabaseUrl.port,
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Local Supabase serves logos from 127.0.0.1, which next/image blocks by default.
    dangerouslyAllowLocalIP: isLocalSupabase && process.env.NODE_ENV !== "production",
  },
  experimental: {
    serverActions: {
      // Carrier logos are capped at 1 MB in storage; leave room for form overhead.
      bodySizeLimit: "2mb",
    },
  },
}

export default nextConfig
