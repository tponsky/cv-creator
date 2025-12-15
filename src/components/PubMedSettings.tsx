'use client';

import { useEffect, useState } from 'react';

interface PubMedSettings {
    enabled: boolean;
    authorName: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    notifyEmail: boolean;
    lastChecked: string | null;
}

export function PubMedSettings() {
    const [settings, setSettings] = useState<PubMedSettings>({
        enabled: false,
        authorName: '',
        frequency: 'weekly',
        notifyEmail: true,
        lastChecked: null,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings/pubmed');
            const data = await res.json();
            setSettings({
                enabled: data.enabled || false,
                authorName: data.authorName || '',
                frequency: data.frequency || 'weekly',
                notifyEmail: data.notifyEmail !== false,
                lastChecked: data.lastChecked || null,
            });
        } catch (error) {
            console.error('Failed to fetch PubMed settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch('/api/settings/pubmed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });

            if (res.ok) {
                setMessage({ type: 'success', text: 'Settings saved successfully!' });
            } else {
                throw new Error('Failed to save');
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to save settings' });
        } finally {
            setSaving(false);
        }
    };

    const formatLastChecked = (dateStr: string | null) => {
        if (!dateStr) return 'Never';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="card p-6 animate-pulse">
                <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-muted rounded w-2/3 mb-4"></div>
                <div className="h-10 bg-muted rounded w-full"></div>
            </div>
        );
    }

    return (
        <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        📚 PubMed Auto-Updates
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Automatically find new publications and add them to your CV
                    </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                        className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted-foreground/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                </label>
            </div>

            {settings.enabled && (
                <div className="space-y-4 mt-6 pt-6 border-t border-border">
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Author Name to Monitor
                        </label>
                        <input
                            type="text"
                            value={settings.authorName}
                            onChange={(e) => setSettings({ ...settings, authorName: e.target.value })}
                            placeholder="e.g., Smith JA or John Smith"
                            className="input w-full"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Enter your name as it appears on publications
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Check Frequency
                        </label>
                        <select
                            value={settings.frequency}
                            onChange={(e) => setSettings({ ...settings, frequency: e.target.value as PubMedSettings['frequency'] })}
                            className="input w-full"
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="notifyEmail"
                            checked={settings.notifyEmail}
                            onChange={(e) => setSettings({ ...settings, notifyEmail: e.target.checked })}
                            className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
                        />
                        <label htmlFor="notifyEmail" className="text-sm">
                            Email me when new publications are found
                        </label>
                    </div>

                    {settings.lastChecked && (
                        <p className="text-sm text-muted-foreground">
                            Last checked: {formatLastChecked(settings.lastChecked)}
                        </p>
                    )}
                </div>
            )}

            {message && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${message.type === 'success'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
                    }`}>
                    {message.text}
                </div>
            )}

            <div className="mt-6 flex justify-end">
                <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="btn-primary"
                >
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}
