const nextConfig = {
  output: process.env.IS_ELECTRON === 'true' ? 'export' : undefined,
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
  // Disable trailing slash for better file system compatibility
  trailingSlash: false,
};

module.exports = nextConfig;
