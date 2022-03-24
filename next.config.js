const path = require('path');

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve.alias,
        babylonjs: path.resolve(
          __dirname,
          'node_modules/babylonjs/babylon.max.js'
        ),
        'babylonjs-loaders': path.resolve(
          __dirname,
          'node_modules/babylonjs-loaders/babylonjs.loaders.js'
        ),
      },
    };
    // Important: return the modified config
    return config;
  },
};
