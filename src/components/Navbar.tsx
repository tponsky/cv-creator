'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

interface NavbarProps {
    user: {
        name?: string | null;
        email?: string | null;
    };
}

export function Navbar({ user }: NavbarProps) {
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);

    const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/');

    const navLinks = [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/cv', label: 'My CV' },
        { href: '/cv/review', label: 'Review' },
        { href: '/settings', label: 'Settings' },
    ];

    return (
        <nav className="sticky top-0 z-50 glass border-b border-border">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link href="/dashboard" className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <span className="font-bold text-lg hidden sm:block">CV Creator</span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-1">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive(link.href)
                                        ? 'bg-primary-500/20 text-primary-400'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                                    }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>

                    {/* User Menu */}
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:block text-right">
                            <p className="text-sm font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                        <div className="relative">
                            <button
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-medium"
                            >
                                {user.name?.charAt(0).toUpperCase() || 'U'}
                            </button>

                            {menuOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setMenuOpen(false)}
                                    />
                                    <div className="absolute right-0 mt-2 w-48 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden">
                                        <div className="p-3 border-b border-border sm:hidden">
                                            <p className="font-medium">{user.name}</p>
                                            <p className="text-sm text-muted-foreground">{user.email}</p>
                                        </div>
                                        <div className="p-1 md:hidden">
                                            {navLinks.map((link) => (
                                                <Link
                                                    key={link.href}
                                                    href={link.href}
                                                    onClick={() => setMenuOpen(false)}
                                                    className={`block px-3 py-2 rounded-lg text-sm transition-colors ${isActive(link.href)
                                                            ? 'bg-primary-500/20 text-primary-400'
                                                            : 'text-foreground hover:bg-secondary'
                                                        }`}
                                                >
                                                    {link.label}
                                                </Link>
                                            ))}
                                            <hr className="my-1 border-border" />
                                        </div>
                                        <div className="p-1">
                                            <button
                                                onClick={() => signOut({ callbackUrl: '/login' })}
                                                className="w-full text-left px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
                                            >
                                                Sign out
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
