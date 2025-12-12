import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret-change-in-production'
);

const JWT_EXPIRES_IN = '7d'; // 7 days

export interface JWTPayload {
    id: string;
    email: string;
    name?: string;
    iat?: number;
    exp?: number;
}

// Create a JWT token
export async function createToken(payload: { id: string; email: string; name?: string }): Promise<string> {
    const token = await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRES_IN)
        .sign(JWT_SECRET);

    return token;
}

// Verify and decode a JWT token
export async function verifyToken(token: string): Promise<JWTPayload | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload as unknown as JWTPayload;
    } catch {
        return null;
    }
}

// Get token from cookies or Authorization header
export async function getTokenFromRequest(request: Request): Promise<string | null> {
    // Check Authorization header first
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // Check cookies
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('auth-token');
    return tokenCookie?.value || null;
}

// Get current user from request
export async function getCurrentUser(request: Request): Promise<JWTPayload | null> {
    const token = await getTokenFromRequest(request);
    if (!token) return null;
    return verifyToken(token);
}

// Set auth cookie
export function setAuthCookie(token: string): void {
    // This will be called from API routes
    // Cookie is set via response headers
}

// Cookie options for auth token
export const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
};
