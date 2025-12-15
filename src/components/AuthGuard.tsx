'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
    id: string;
    email: string;
    name: string | null;
    institution?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
}

interface AuthGuardProps {
    children: ReactNode | ((user: User) => ReactNode);
}

/**
 * Client-side auth guard component
 * Wraps pages that require authentication
 * Redirects to /login if not authenticated
 */
export function AuthGuard({ children }: AuthGuardProps) {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const response = await fetch('/api/auth/me');
                if (response.ok) {
                    const data = await response.json();
                    setUser(data.user);
                } else {
                    // Not authenticated, redirect to login
                    router.push('/login');
                }
            } catch (error) {
                console.error('Auth check failed:', error);
                router.push('/login');
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, [router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex items-center gap-3">
                    <svg className="animate-spin h-8 w-8 text-primary-500" viewBox="0 0 24 24">
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                    </svg>
                    <span className="text-lg text-muted-foreground">Loading...</span>
                </div>
            </div>
        );
    }

    if (!user) {
        return null; // Will redirect
    }

    // If children is a function, pass the user to it
    if (typeof children === 'function') {
        return <>{children(user)}</>;
    }

    return <>{children}</>;
}

/**
 * Hook to get the current authenticated user
 * USE ONLY WITHIN AuthGuard or after auth is confirmed
 */
export function useAuthUser() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await fetch('/api/auth/me');
                if (response.ok) {
                    const data = await response.json();
                    setUser(data.user);
                }
            } catch (error) {
                console.error('Failed to fetch user:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, []);

    return { user, loading };
}
