import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mammoth", "officeparser", "pdf-parse"],
};

export default nextConfig;
