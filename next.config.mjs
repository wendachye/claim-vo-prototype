/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel uses the normal Next.js build. The optional export retains the
  // existing static Sites handoff without changing the Vercel deployment.
  ...(process.env.NEXT_BUILD_TARGET === 'sites' ? {
    output: 'export',
    distDir: '.next-sites',
  } : {}),
  devIndicators: false,
  agentRules: false,
};

export default nextConfig;
