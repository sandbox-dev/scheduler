import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The build this code came from, baked into the page, so an open page can
  // tell when a newer version has gone live (UpdateAvailableBanner).
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  },
};

export default nextConfig;
