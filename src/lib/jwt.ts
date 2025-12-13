import { SignJWT, jwtVerify } from 'jose';

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

// Get token from Authorization header or cookies
export function getTokenFromRequest(request: Request): string | null {
    // Check Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // Check cookie header manually (avoid next/headers import)
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
        const match = cookieHeader.match(/auth-token=([^;]+)/);
        if (match) {
            return match[1];
        }
    }

    return null;
}

// Get current user from request
export async function getCurrentUser(request: Request): Promise<JWTPayload | null> {
    const token = getTokenFromRequest(request);
    if (!token) return null;
    return verifyToken(token);
}

// Cookie options for auth token
export const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
};
