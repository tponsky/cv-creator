'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PendingEntry {
    id: string;
    title: string;
    description: string | null;
    date: Date | null;
    url: string | null;
    sourceType: string;
    suggestedCategory: string | null;
}

interface Category {
    id: string;
    name: string;
}

interface ReviewQueueProps {
    entries: PendingEntry[];
    categories: Category[];
}

export function ReviewQueue({ entries, categories }: ReviewQueueProps) {
    const router = useRouter();
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
    const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>(() => {
        // Initialize with suggested categories where available
        const initial: Record<string, string> = {};
        entries.forEach(entry => {
            // Find Publications category or use first one
            const pubCategory = categories.find(c => c.name.toLowerCase().includes('publication'));
            const defaultCategory = pubCategory || categories[0];
            if (defaultCategory) {
                initial[entry.id] = defaultCategory.id;
            }
        });
        return initial;
    });

    const handleApprove = async (entryId: string) => {
        const categoryId = selectedCategories[entryId];
        if (!categoryId) {
            alert('Please select a category');
            return;
        }

        setProcessingIds(prev => new Set(prev).add(entryId));

        try {
            const response = await fetch(`/api/pending/${entryId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId }),
            });

            if (!response.ok) {
                throw new Error('Failed to approve entry');
            }

            router.refresh();
        } catch (error) {
            console.error('Approve error:', error);
            alert('Failed to approve entry');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(entryId);
                return next;
            });
        }
    };

    const handleReject = async (entryId: string) => {
        setProcessingIds(prev => new Set(prev).add(entryId));

        try {
            const response = await fetch(`/api/pending/${entryId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Failed to reject entry');
            }

            router.refresh();
        } catch (error) {
            console.error('Reject error:', error);
            alert('Failed to reject entry');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(entryId);
                return next;
            });
        }
    };

    const handleApproveAll = async () => {
        for (const entry of entries) {
            await handleApprove(entry.id);
        }
    };

    const formatDate = (date: Date | null) => {
        if (!date) return '';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-muted-foreground">
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'} pending review
                </p>
                {entries.length > 1 && (
                    <button
                        onClick={handleApproveAll}
                        className="btn-primary"
                        disabled={processingIds.size > 0}
                    >
                        Approve All
                    </button>
                )}
            </div>

            <div className="space-y-4">
                {entries.map((entry) => (
                    <div
                        key={entry.id}
                        className="card"
                    >
                        <div className="flex items-start gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`badge ${entry.sourceType === 'pubmed' ? 'badge-success' : 'badge-primary'
                                        }`}>
                                        {entry.sourceType}
                                    </span>
                                    {entry.date && (
                                        <span className="text-xs text-muted-foreground">
                                            {formatDate(entry.date)}
                                        </span>
                                    )}
                                </div>
                                <h3 className="font-medium mb-1">{entry.title}</h3>
                                {entry.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                        {entry.description}
                                    </p>
                                )}
                                {entry.url && (
                                    <a
                                        href={entry.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-primary-400 hover:underline mt-2 inline-block"
                                    >
                                        View source →
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
                            <select
                                value={selectedCategories[entry.id] || ''}
                                onChange={(e) => setSelectedCategories(prev => ({
                                    ...prev,
                                    [entry.id]: e.target.value,
                                }))}
                                className="input flex-1"
                            >
                                <option value="">Select category...</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => handleApprove(entry.id)}
                                disabled={processingIds.has(entry.id) || !selectedCategories[entry.id]}
                                className="btn-primary"
                            >
                                {processingIds.has(entry.id) ? 'Processing...' : 'Approve'}
                            </button>
                            <button
                                onClick={() => handleReject(entry.id)}
                                disabled={processingIds.has(entry.id)}
                                className="btn-secondary text-destructive hover:bg-destructive/10"
                            >
                                Reject
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
