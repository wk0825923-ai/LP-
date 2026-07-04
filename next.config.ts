import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ホームディレクトリに別のpackage-lock.jsonがあるためルートを明示
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
