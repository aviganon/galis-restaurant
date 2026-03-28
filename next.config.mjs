/** @type {import('next').NextConfig} */
// ב-Vercel: ללא export כדי שה-API routes יעבדו. ב-Firebase/מקומי: export לקבצים סטטיים.
const nextConfig = {
  ...(process.env.VERCEL === "1" ? {} : { output: "export" }),
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    qualities: [75, 95],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "videos.pexels.com" },
    ],
  },
}

export default nextConfig
