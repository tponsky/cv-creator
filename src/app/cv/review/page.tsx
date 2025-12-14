'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { ReviewQueue } from '@/components/ReviewQueue';

interface PendingEntry {
    id: string;
    title: string;
    description: string | null;
    date: string | null;
    url: string | null;
    sourceType: string;
    suggestedCategory: string | null;
}

interface Category {
    id: string;
    name: string;
}

export default function ReviewPage() {
    const [entries, setEntries] = useState<PendingEntry[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const navUser = { name: 'Demo User', email: 'demo@cvbuilder.com' };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            // Fetch pending entries
            const entriesRes = await fetch('/api/pending');
            if (!entriesRes.ok) throw new Error('Failed to fetch entries');
            const entriesData = await entriesRes.json();
            setEntries(entriesData.entries || []);

            // Fetch categories
            const categoriesRes = await fetch('/api/cv/categories');
            if (!categoriesRes.ok) throw new Error('Failed to fetch categories');
            const categoriesData = await categoriesRes.json();
            setCategories(categoriesData.categories || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = () => {
        setLoading(true);
        fetchData();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <Navbar user={navUser} />
                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                        <span className="ml-3 text-muted-foreground">Loading...</span>
                    </div>
                </main>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-background">
                <Navbar user={navUser} />
                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="card text-center py-12">
                        <p className="text-destructive mb-4">{error}</p>
                        <button onClick={handleRefresh} className="btn-secondary">
                            Try Again
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar user={navUser} />

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <a href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Dashboard
                    </a>
                    <h1 className="text-3xl font-bold">Review Queue</h1>
                    <p className="text-muted-foreground">
                        Review and approve entries imported from PubMed or forwarded emails.
                    </p>
                </div>

                {entries.length === 0 ? (
                    <div className="card text-center py-12">
                        <svg className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h3 className="text-lg font-medium mb-2">All caught up!</h3>
                        <p className="text-muted-foreground mb-4">
                            No pending entries to review.
                        </p>
                        <a href="/settings" className="btn-secondary inline-flex">
                            Import from PubMed →
                        </a>
                    </div>
                ) : (
                    <ReviewQueue
                        entries={entries}
                        categories={categories}
                        onRefresh={handleRefresh}
                    />
                )}
            </main>
        </div>
    );
}
