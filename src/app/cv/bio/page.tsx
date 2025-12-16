'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { AuthGuard } from '@/components/AuthGuard';

interface UserProfile {
    id: string;
    email: string;
    name: string | null;
}

export default function BioPage() {
    return (
        <AuthGuard>
            {(user) => <BioContent user={user as UserProfile} />}
        </AuthGuard>
    );
}

function BioContent({ user }: { user: UserProfile }) {
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
    const [highlights, setHighlights] = useState('');

    const navUser = { name: user.name || 'User', email: user.email };

    // Fetch existing bio on load
    useEffect(() => {
        const fetchBio = async () => {
            try {
                const res = await fetch('/api/cv/bio', { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    setBio(data.bio || '');
                }
            } catch (error) {
                console.error('Failed to fetch bio:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchBio();
    }, []);

    const handleGenerate = async () => {
        setGenerating(true);
        setMessage('');
        setError('');

        try {
            const res = await fetch('/api/cv/bio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ length, highlights }),
            });

            const data = await res.json();
            if (res.ok) {
                setBio(data.bio);
                setMessage('Bio generated! Feel free to edit before saving.');
            } else {
                setError(data.error || 'Failed to generate bio');
            }
        } catch {
            setError('Failed to connect to server');
        } finally {
            setGenerating(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage('');
        setError('');

        try {
            const res = await fetch('/api/cv/bio', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ bio }),
            });

            if (res.ok) {
                setMessage('Bio saved successfully!');
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to save bio');
            }
        } catch {
            setError('Failed to connect to server');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar user={navUser} />

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold">Professional Bio</h1>
                        <p className="text-muted-foreground mt-1">
                            Generate and edit your professional biography using AI
                        </p>
                    </div>
                    <a href="/cv" className="btn-secondary">
                        ← Back to CV
                    </a>
                </div>

                <div className="card mb-6">
                    <h2 className="text-xl font-semibold mb-4">Generate with AI</h2>
                    <p className="text-muted-foreground mb-4">
                        AI will analyze your CV entries to create a professional biography.
                    </p>

                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">
                            Key highlights to emphasize (optional)
                        </label>
                        <textarea
                            value={highlights}
                            onChange={(e) => setHighlights(e.target.value)}
                            placeholder="E.g., Focus on my surgical innovations, mention my NIH funding, highlight my teaching awards..."
                            className="input w-full h-20 resize-none text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Tell AI what to prioritize from your CV
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mb-4">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium">Length:</label>
                            <select
                                value={length}
                                onChange={(e) => setLength(e.target.value as 'short' | 'medium' | 'long')}
                                className="input py-1 px-2 text-sm"
                            >
                                <option value="short">Short (2-3 sentences)</option>
                                <option value="medium">Medium (100-150 words)</option>
                                <option value="long">Long (200-250 words)</option>
                            </select>
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="btn-primary flex items-center gap-2"
                        >
                            {generating ? (
                                <>
                                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    Generate Bio
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="card">
                    <h2 className="text-xl font-semibold mb-4">Your Bio</h2>

                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Loading...
                        </div>
                    ) : (
                        <>
                            <textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Your professional bio will appear here. Click 'Generate Bio' to create one, or type your own."
                                className="input w-full h-48 resize-none mb-4"
                            />

                            <div className="flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                    {bio.split(/\s+/).filter(Boolean).length} words
                                </div>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="btn-primary"
                                >
                                    {saving ? 'Saving...' : 'Save Bio'}
                                </button>
                            </div>
                        </>
                    )}

                    {message && (
                        <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/30 text-success">
                            {message}
                        </div>
                    )}
                    {error && (
                        <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
                            {error}
                        </div>
                    )}
                </div>

                <div className="mt-6 p-4 rounded-lg bg-muted/30">
                    <h3 className="font-medium mb-2">💡 Tips</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• The AI uses your CV entries to generate the bio</li>
                        <li>• Feel free to edit the generated text before saving</li>
                        <li>• Your bio will be included in CV exports</li>
                        <li>• Re-generate anytime if you add new entries</li>
                    </ul>
                </div>
            </main>
        </div>
    );
}
