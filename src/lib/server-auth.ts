/**
 * Server-side authentication utilities
 * For use in Server Components and API routes
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret-change-in-production'
);

interface JWTPayload {
    id: string;
    email: string;
    name?: string;
}

/**
 * Get the current authenticated user from cookies
 * Returns null if not authenticated
 */
export async function getServerUser(): Promise<{
    id: string;
    email: string;
    name: string | null;
    institution: string | null;
    phone: string | null;
    address: string | null;
    website: string | null;
} | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth-token')?.value;

        if (!token) {
            return null;
        }

        const { payload } = await jwtVerify(token, JWT_SECRET);
        const jwtPayload = payload as unknown as JWTPayload;

        // Get full user data from database
        const user = await prisma.user.findUnique({
            where: { id: jwtPayload.id },
            select: {
                id: true,
                email: true,
                name: true,
                institution: true,
                phone: true,
                address: true,
                website: true,
            },
        });

        return user;
    } catch (error) {
        console.error('Auth error:', error);
        return null;
    }
}

/**
 * Require authentication - redirects to login if not authenticated
 * Use in Server Components that require auth
 */
export async function requireAuth() {
    const user = await getServerUser();

    if (!user) {
        redirect('/login');
    }

    return user;
}

/**
 * Get user from request for API routes (works with Route Handlers)
 */
export async function getUserFromRequest(request: Request): Promise<{
    id: string;
    email: string;
    name: string | null;
} | null> {
    try {
        // Check Authorization header
        const authHeader = request.headers.get('Authorization');
        let token: string | null = null;

        if (authHeader?.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }

        // Check cookie header
        if (!token) {
            const cookieHeader = request.headers.get('Cookie');
            if (cookieHeader) {
                const match = cookieHeader.match(/auth-token=([^;]+)/);
                if (match) {
                    token = match[1];
                }
            }
        }

        if (!token) {
            return null;
        }

        const { payload } = await jwtVerify(token, JWT_SECRET);
        const jwtPayload = payload as unknown as JWTPayload;

        // Get user from database
        const user = await prisma.user.findUnique({
            where: { id: jwtPayload.id },
            select: {
                id: true,
                email: true,
                name: true,
            },
        });

        return user;
    } catch (error) {
        console.error('API auth error:', error);
        return null;
    }
}
