import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude native modules from client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
      
      // Ignore node-datachannel native binding on client
      config.externals = config.externals || [];
      config.externals.push({
        'node-datachannel': 'commonjs node-datachannel',
      });
    }
    
    return config;
  },
};

export default nextConfig;
