'use client';

import { useState, useEffect } from 'react';

interface RecentEntry {
    id: string;
    title: string;
    categoryName: string;
    createdAt: string;
}

export function RecentDropdown() {
    const [open, setOpen] = useState(false);
    const [entries, setEntries] = useState<RecentEntry[]>([]);

    useEffect(() => {
        const fetchRecent = async () => {
            try {
                const res = await fetch('/api/entries/recent', { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    setEntries(data.entries || []);
                }
            } catch (error) {
                console.error('Failed to fetch recent entries:', error);
            }
        };

        fetchRecent();
    }, []);

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
        <div className="relative inline-block">
            <button
                onClick={() => setOpen(!open)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${open ? 'bg-primary-500/20 text-primary-400' : 'text-primary-400 hover:bg-primary-500/10'
                    }`}
            >
                Recent
                <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 mt-2 w-80 rounded-xl bg-neutral-900 border border-border shadow-xl z-50 overflow-hidden">
                        <div className="p-3 border-b border-border">
                            <h3 className="font-semibold text-sm">Recent Entries</h3>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            {entries.length > 0 ? (
                                entries.slice(0, 8).map((entry) => (
                                    <div key={entry.id} className="p-3 border-b border-border last:border-b-0 hover:bg-muted/30">
                                        <p className="font-medium text-sm truncate">{entry.title}</p>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-xs text-muted-foreground">{entry.categoryName}</span>
                                            <span className="text-xs text-muted-foreground">{formatTimeAgo(entry.createdAt)}</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 text-center text-muted-foreground text-sm">
                                    No recent entries
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
