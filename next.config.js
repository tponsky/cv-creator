/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {
        serverActions: {
            bodySizeLimit: '2mb',
        },
    },
    // Tell Next.js to keep these packages external (not bundled) for server components
    serverExternalPackages: ['@prisma/client', 'prisma'],
};

module.exports = nextConfig;
