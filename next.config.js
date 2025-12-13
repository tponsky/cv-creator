/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {
        serverActions: {
            bodySizeLimit: '2mb',
        },
        // Keep Prisma external (not bundled) for server components
        serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
    },
};

module.exports = nextConfig;
