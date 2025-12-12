/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    experimental: {
        serverActions: {
            bodySizeLimit: '2mb',
        },
        serverComponentsExternalPackages: [
            'next-auth',
            '@prisma/client',
            'bcryptjs',
        ],
    },
};

module.exports = nextConfig;
