const nextConfig = {
  output: process.env.IS_ELECTRON === 'true' ? 'export' : undefined,
  // assetPrefix: './', // No longer needed with app:// protocol
  trailingSlash: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
