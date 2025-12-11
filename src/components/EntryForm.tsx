'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Category {
    id: string;
    name: string;
}

interface Entry {
    id: string;
    categoryId: string;
    title: string;
    description: string | null;
    date: string | null;
    endDate: string | null;
    location: string | null;
    url: string | null;
}

interface EntryFormProps {
    categories: Category[];
    defaultCategoryId?: string;
    entry?: Entry;
}

export function EntryForm({ categories, defaultCategoryId, entry }: EntryFormProps) {
    const router = useRouter();
    const isEditing = !!entry;

    const [formData, setFormData] = useState({
        categoryId: entry?.categoryId || defaultCategoryId || categories[0]?.id || '',
        title: entry?.title || '',
        description: entry?.description || '',
        date: entry?.date ? new Date(entry.date).toISOString().split('T')[0] : '',
        endDate: entry?.endDate ? new Date(entry.endDate).toISOString().split('T')[0] : '',
        location: entry?.location || '',
        url: entry?.url || '',
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const url = isEditing ? `/api/cv/entries/${entry.id}` : '/api/cv/entries';
            const method = isEditing ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    date: formData.date || null,
                    endDate: formData.endDate || null,
                    description: formData.description || null,
                    location: formData.location || null,
                    url: formData.url || null,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save entry');
            }

            router.push('/cv');
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    {error}
                </div>
            )}

            {/* Category */}
            <div>
                <label htmlFor="categoryId" className="label">
                    Category <span className="text-destructive">*</span>
                </label>
                <select
                    id="categoryId"
                    name="categoryId"
                    value={formData.categoryId}
                    onChange={handleChange}
                    className="input"
                    required
                >
                    {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* Title */}
            <div>
                <label htmlFor="title" className="label">
                    Title <span className="text-destructive">*</span>
                </label>
                <input
                    id="title"
                    name="title"
                    type="text"
                    value={formData.title}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g., Publication title, Award name, Position..."
                    required
                />
            </div>

            {/* Description */}
            <div>
                <label htmlFor="description" className="label">
                    Description
                </label>
                <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    className="input min-h-[120px] resize-y"
                    placeholder="Additional details, authors, journal, etc..."
                    rows={4}
                />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="date" className="label">
                        Start Date
                    </label>
                    <input
                        id="date"
                        name="date"
                        type="date"
                        value={formData.date}
                        onChange={handleChange}
                        className="input"
                    />
                </div>
                <div>
                    <label htmlFor="endDate" className="label">
                        End Date <span className="text-muted-foreground text-xs">(leave blank if current)</span>
                    </label>
                    <input
                        id="endDate"
                        name="endDate"
                        type="date"
                        value={formData.endDate}
                        onChange={handleChange}
                        className="input"
                    />
                </div>
            </div>

            {/* Location */}
            <div>
                <label htmlFor="location" className="label">
                    Location
                </label>
                <input
                    id="location"
                    name="location"
                    type="text"
                    value={formData.location}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g., Boston, MA or Journal of Medicine"
                />
            </div>

            {/* URL */}
            <div>
                <label htmlFor="url" className="label">
                    URL / Link
                </label>
                <input
                    id="url"
                    name="url"
                    type="url"
                    value={formData.url}
                    onChange={handleChange}
                    className="input"
                    placeholder="https://..."
                />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
                <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex-1"
                >
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Saving...
                        </span>
                    ) : (
                        isEditing ? 'Update Entry' : 'Add Entry'
                    )}
                </button>
                <a href="/cv" className="btn-secondary">
                    Cancel
                </a>
            </div>
        </form>
    );
}
