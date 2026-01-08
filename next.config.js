const nextConfig = {
  // output: 'export',  // DISABLED: Causes issues with dynamic imports on Vercel
  // Disable trailing slash for Electron (files not dirs), enable for Vercel/Web
  // trailingSlash: false,

  // Use relative paths for Electron build, otherwise default to absolute
  assetPrefix: process.env.IS_ELECTRON ? './' : undefined,
  // trailingSlash: true, // Disabled to simplify routing

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
