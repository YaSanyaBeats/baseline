import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['exceljs'],
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  async rewrites() {
    return {
      // В production Next отдаёт public/ по снимку на старте процесса.
      // Файлы, загруженные после старта, иначе отвечают 404.
      beforeFiles: [
        {
          source: '/uploads/:path*',
          destination: '/api/uploads/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
