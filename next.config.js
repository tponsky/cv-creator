/** @type {import('next').NextConfig} */
const nextConfig = {
    // Remove standalone for now to debug - using full node_modules copy in Docker
    // output: 'standalone',
    experimental: {
        serverActions: {
            bodySizeLimit: '2mb',
        },
    },
    // Ensure proper headers for RSC
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block',
                    },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
