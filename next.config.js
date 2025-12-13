/** @type {import('next').NextConfig} */
const nextConfig = {
    // Remove standalone for now to debug - using full node_modules copy in Docker
    // output: 'standalone',
    experimental: {
        serverActions: {
            bodySizeLimit: '2mb',
        },
    },
};

module.exports = nextConfig;
