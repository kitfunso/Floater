import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @cursor/sdk has dynamic requires that webpack can't statically analyse; mark
  // it external so it's loaded by Node at runtime, not bundled.
  serverExternalPackages: ["@cursor/sdk"],
  // Cloudflare Workers can't run @cursor/sdk (it spawns local processes) and the
  // bundler trips on the SDK's dynamic require patterns. Exclude it from output
  // tracing entirely; the lazy loadCursorSdk() handles its absence at runtime.
  outputFileTracingExcludes: {
    "*": ["node_modules/@cursor/**", "node_modules/@anysphere/**"],
  },
};

export default nextConfig;
