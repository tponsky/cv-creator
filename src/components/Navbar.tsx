'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { PendingBadge } from './PendingBadge';

interface NavbarProps {
    user: {
        name?: string | null;
        email?: string | null;
    };
}

interface RecentEntry {
    id: string;
    title: string;
    categoryName: string;
    createdAt: string;
}

export function Navbar({ user }: NavbarProps) {
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);
    const [recentOpen, setRecentOpen] = useState(false);
    const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
    const [pendingCount, setPendingCount] = useState(0);

    const isActive = (path: string) => pathname === path || pathname?.startsWith(path + '/');

    // Fetch recent entries and pending count
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch recent entries
                const entriesRes = await fetch('/api/entries/recent', { credentials: 'include' });
                if (entriesRes.ok) {
                    const data = await entriesRes.json();
                    setRecentEntries(data.entries || []);
                }

                // Fetch pending count
                const pendingRes = await fetch('/api/pending', { credentials: 'include' });
                if (pendingRes.ok) {
                    const data = await pendingRes.json();
                    setPendingCount(data.entries?.length || 0);
                }
            } catch (error) {
                console.error('Failed to fetch navbar data:', error);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const navLinks = [
        { href: '/cv', label: 'My CV' },
        { href: '/settings', label: 'Settings' },
    ];

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days > 0) return `${days}d ago`;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours > 0) return `${hours}h ago`;
        const minutes = Math.floor(diff / (1000 * 60));
        return `${minutes}m ago`;
    };

    return (
        <nav className="sticky top-0 z-50 glass border-b border-border">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo - now links to /cv */}
                    <Link href="/cv" className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <span className="font-bold text-lg hidden sm:block">CV Creator</span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-2">
                        {/* Recent Entries Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setRecentOpen(!recentOpen)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${recentOpen ? 'bg-primary-500/20 text-primary-400' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                                    }`}
                            >
                                Recent Entries
                                <svg className={`w-4 h-4 transition-transform ${recentOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {recentOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setRecentOpen(false)} />
                                    <div className="absolute left-0 mt-2 w-80 rounded-xl bg-neutral-900 border border-border shadow-xl z-50 overflow-hidden">
                                        <div className="p-3 border-b border-border">
                                            <h3 className="font-semibold">Recent Entries</h3>
                                        </div>
                                        <div className="max-h-80 overflow-y-auto">
                                            {recentEntries.length > 0 ? (
                                                recentEntries.slice(0, 8).map((entry) => (
                                                    <div key={entry.id} className="p-3 border-b border-border last:border-b-0 hover:bg-muted/30">
                                                        <p className="font-medium text-sm truncate">{entry.title}</p>
                                                        <div className="flex justify-between items-center mt-1">
                                                            <span className="text-xs text-muted-foreground">{entry.categoryName}</span>
                                                            <span className="text-xs text-muted-foreground">{formatTimeAgo(entry.createdAt)}</span>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-4 text-center text-muted-foreground">
                                                    No recent entries
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-2 border-t border-border">
                                            <Link
                                                href="/cv"
                                                className="block text-center text-sm text-primary-400 hover:text-primary-300 py-1"
                                                onClick={() => setRecentOpen(false)}
                                            >
                                                View All →
                                            </Link>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Pending Review Button */}
                        {pendingCount > 0 && (
                            <Link
                                href="/cv/review"
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Pending Review
                                <span className="bg-amber-500 text-black text-xs font-bold rounded-full px-2 py-0.5">
                                    {pendingCount > 99 ? '99+' : pendingCount}
                                </span>
                            </Link>
                        )}

                        {/* Regular Nav Links */}
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
                        <PendingBadge />
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
                                    <div className="absolute right-0 mt-2 w-48 rounded-xl bg-neutral-900 border border-border shadow-xl z-50 overflow-hidden">
                                        <div className="p-3 border-b border-border sm:hidden">
                                            <p className="font-medium">{user.name}</p>
                                            <p className="text-sm text-muted-foreground">{user.email}</p>
                                        </div>
                                        <div className="p-1">
                                            {pendingCount > 0 && (
                                                <Link
                                                    href="/cv/review"
                                                    onClick={() => setMenuOpen(false)}
                                                    className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-amber-400 hover:bg-amber-500/20"
                                                >
                                                    Pending Review
                                                    <span className="bg-amber-500 text-black text-xs font-bold rounded-full px-2 py-0.5">
                                                        {pendingCount}
                                                    </span>
                                                </Link>
                                            )}
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
