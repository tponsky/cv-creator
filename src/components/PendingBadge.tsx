'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ActivityData {
    pendingCount: number;
    activities: Array<{
        id: string;
        type: string;
        title: string;
        description: string | null;
        read: boolean;
        createdAt: string;
    }>;
}

export function PendingBadge() {
    const [data, setData] = useState<ActivityData | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        fetchActivity();
        // Refresh every 30 seconds
        const interval = setInterval(fetchActivity, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchActivity = async () => {
        try {
            const res = await fetch('/api/activity');
            const json = await res.json();
            setData(json);
        } catch (error) {
            console.error('Failed to fetch activity:', error);
        }
    };

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'email_import':
                return '📧';
            case 'pubmed_import':
                return '📚';
            case 'cv_import':
                return '📄';
            default:
                return '📌';
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {data && data.pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                        {data.pendingCount > 9 ? '9+' : data.pendingCount}
                    </span>
                )}
            </button>

            {showDropdown && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowDropdown(false)}
                    />
                    <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-20">
                        <div className="p-3 border-b border-border flex items-center justify-between">
                            <h3 className="font-semibold">Activity</h3>
                            {data && data.pendingCount > 0 && (
                                <Link
                                    href="/cv/review"
                                    className="text-sm text-primary-500 hover:text-primary-600"
                                    onClick={() => setShowDropdown(false)}
                                >
                                    Review ({data.pendingCount})
                                </Link>
                            )}
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            {data && data.activities.length > 0 ? (
                                data.activities.slice(0, 10).map((activity) => (
                                    <div
                                        key={activity.id}
                                        className={`p-3 border-b border-border last:border-b-0 hover:bg-muted/30 ${!activity.read ? 'bg-primary-500/5' : ''}`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span className="text-lg">{getIcon(activity.type)}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm">{activity.title}</p>
                                                {activity.description && (
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {activity.description}
                                                    </p>
                                                )}
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {formatTimeAgo(activity.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-6 text-center text-muted-foreground">
                                    <p>No recent activity</p>
                                    <p className="text-xs mt-1">
                                        Forward emails to add@cv.staycurrentai.com
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
