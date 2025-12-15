'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Entry {
    id: string;
    title: string;
    description: string | null;
    date: Date | null;
    location: string | null;
    url: string | null;
    sourceType: string;
}

interface Category {
    id: string;
    name: string;
    displayOrder: number;
    entries: Entry[];
}

interface CV {
    id: string;
    title: string;
    categories: Category[];
}

interface CVEditorProps {
    cv: CV;
}

export function CVEditor({ cv }: CVEditorProps) {
    const router = useRouter();
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
        new Set() // Start collapsed by default
    );
    const [loading, setLoading] = useState(false);

    const toggleCategory = (categoryId: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryId)) {
            newExpanded.delete(categoryId);
        } else {
            newExpanded.add(categoryId);
        }
        setExpandedCategories(newExpanded);
    };

    const handleDeleteEntry = async (entryId: string) => {
        if (!confirm('Are you sure you want to delete this entry?')) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/cv/entries/${entryId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                router.refresh();
            }
        } catch (error) {
            console.error('Error deleting entry:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddCategory = async () => {
        const name = prompt('Enter category name:');
        if (!name) return;

        setLoading(true);
        try {
            const res = await fetch('/api/cv/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, cvId: cv.id }),
            });
            if (res.ok) {
                router.refresh();
            }
        } catch (error) {
            console.error('Error adding category:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRenameCategory = async (categoryId: string, currentName: string) => {
        const name = prompt('Enter new category name:', currentName);
        if (!name || name === currentName) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/cv/categories/${categoryId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (res.ok) {
                router.refresh();
            }
        } catch (error) {
            console.error('Error renaming category:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCategory = async (categoryId: string, entryCount: number) => {
        if (entryCount > 0) {
            if (!confirm(`This category has ${entryCount} entries. Are you sure you want to delete it and all its entries?`)) return;
        } else {
            if (!confirm('Are you sure you want to delete this category?')) return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/cv/categories/${categoryId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                router.refresh();
            }
        } catch (error) {
            console.error('Error deleting category:', error);
        } finally {
            setLoading(false);
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
        <div className="space-y-4">
            {cv.categories.map((category) => (
                <div key={category.id} className="card">
                    {/* Category Header */}
                    <div
                        className="flex items-center justify-between cursor-pointer group"
                        onClick={() => toggleCategory(category.id)}
                    >
                        <div className="flex items-center gap-3">
                            <svg
                                className={`w-5 h-5 text-muted-foreground transition-transform ${expandedCategories.has(category.id) ? 'rotate-90' : ''
                                    }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <h2 className="text-lg font-semibold">{category.name}</h2>
                            <span className="badge badge-primary">{category.entries.length}</span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRenameCategory(category.id, category.name);
                                }}
                                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
                                title="Rename category"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCategory(category.id, category.entries.length);
                                }}
                                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                title="Delete category"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Category Entries */}
                    {expandedCategories.has(category.id) && (
                        <div className="mt-4 space-y-3">
                            {category.entries.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <p>No entries in this category</p>
                                    <a
                                        href={`/cv/add?category=${category.id}`}
                                        className="text-primary-400 hover:text-primary-300 text-sm"
                                    >
                                        Add an entry →
                                    </a>
                                </div>
                            ) : (
                                category.entries.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-medium">{entry.title}</h3>
                                                    {entry.url && (
                                                        <a
                                                            href={entry.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-primary-400 hover:text-primary-300"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                            </svg>
                                                        </a>
                                                    )}
                                                </div>
                                                {entry.description && (
                                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                                        {entry.description}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                                    {entry.date && <span>{formatDate(entry.date)}</span>}
                                                    {entry.location && <span>• {entry.location}</span>}
                                                    <span
                                                        className={`badge text-xs ${entry.sourceType === 'manual' ? 'badge-primary' :
                                                            entry.sourceType === 'pubmed' ? 'badge-success' :
                                                                'badge-warning'
                                                            }`}
                                                    >
                                                        {entry.sourceType}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <a
                                                    href={`/cv/edit/${entry.id}`}
                                                    className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
                                                    title="Edit entry"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </a>
                                                <button
                                                    onClick={() => handleDeleteEntry(entry.id)}
                                                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                                    title="Delete entry"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            ))}

            {/* Add Category Button */}
            <button
                onClick={handleAddCategory}
                disabled={loading}
                className="w-full py-4 rounded-xl border-2 border-dashed border-border hover:border-primary-500/50 hover:bg-primary-500/5 text-muted-foreground hover:text-primary-400 transition-all flex items-center justify-center gap-2"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Category
            </button>
        </div>
    );
}
