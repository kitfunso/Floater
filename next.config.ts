import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @cursor/sdk has dynamic requires that webpack can't statically analyse; mark
  // it external so it's loaded by Node at runtime, not bundled.
  serverExternalPackages: ["@cursor/sdk"],
};

export default nextConfig;
