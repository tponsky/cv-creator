'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { PubMedSettings } from '@/components/PubMedSettings';
import { AuthGuard } from '@/components/AuthGuard';

interface Publication {
    title: string;
    description: string;
    date: string | null;
    url: string;
    sourceType: string;
    isNew?: boolean;
    sourceData?: string;
}

interface CVImportResult {
    success: boolean;
    message: string;
    categoriesFound?: number;
    entriesCreated?: number;
    categories?: { name: string; entryCount: number }[];
}

interface UserProfile {
    id: string;
    email: string;
    name: string | null;
    institution: string | null;
    phone: string | null;
    address: string | null;
    website: string | null;
}

export default function SettingsPage() {
    return (
        <AuthGuard>
            {(user) => <SettingsContent initialUser={user as UserProfile} />}
        </AuthGuard>
    );
}

function SettingsContent({ initialUser }: { initialUser: UserProfile }) {
    // Profile state
    const [profile, setProfile] = useState<UserProfile>(initialUser);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMessage, setProfileMessage] = useState('');
    const [profileError, setProfileError] = useState('');

    // PubMed state
    const [authorName, setAuthorName] = useState('');
    const [publications, setPublications] = useState<Publication[]>([]);
    const [allPublications, setAllPublications] = useState<Publication[]>([]);
    const [showOnlyNew, setShowOnlyNew] = useState(true);
    const [selectedPubs, setSelectedPubs] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    // CV Upload state
    const [cvUploading, setCvUploading] = useState(false);
    const [cvMessage, setCvMessage] = useState('');
    const [cvError, setCvError] = useState('');
    const [cvResult, setCvResult] = useState<CVImportResult | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Deduplication state
    interface DuplicateEntry {
        id: string;
        title: string;
        description: string | null;
        categoryName: string;
        sourceType: string | null;
        hasPMID: boolean;
        hasDOI: boolean;
    }
    interface DuplicateGroup {
        normalizedTitle: string;
        entries: DuplicateEntry[];
        keepId: string;
    }
    const [dedupeScanning, setDedupeScanning] = useState(false);
    const [dedupeRemoving, setDedupeRemoving] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
    const [dedupeStats, setDedupeStats] = useState<{ total: number; duplicates: number; after: number } | null>(null);
    const [dedupeMessage, setDedupeMessage] = useState('');
    const [dedupeError, setDedupeError] = useState('');

    const navUser = { name: profile.name || 'User', email: profile.email };

    // Save profile handler
    const handleSaveProfile = useCallback(async () => {
        setProfileSaving(true);
        setProfileMessage('');
        setProfileError('');

        try {
            const response = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: profile.name,
                    institution: profile.institution,
                    phone: profile.phone,
                    address: profile.address,
                    website: profile.website,
                }),
            });

            const data = await response.json();
            if (response.ok) {
                setProfileMessage('Profile saved successfully!');
                if (data.user) setProfile(data.user);
            } else {
                setProfileError(data.error || 'Failed to save profile');
            }
        } catch {
            setProfileError('An error occurred while saving');
        } finally {
            setProfileSaving(false);
        }
    }, [profile]);

    // Fetch profile on mount
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await fetch('/api/user/profile');
                if (response.ok) {
                    const data = await response.json();
                    if (data.user) setProfile(data.user);
                }
            } catch (e) {
                console.error('Failed to fetch profile:', e);
            }
        };
        fetchProfile();
    }, []);

    // CV Upload handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            uploadCV(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            uploadCV(e.target.files[0]);
        }
    };

    const uploadCV = async (file: File) => {
        setCvUploading(true);
        setCvError('');
        setCvMessage('');
        setCvResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/import/cv', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            setCvMessage(data.message);
            setCvResult(data);
        } catch (err) {
            setCvError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setCvUploading(false);
        }
    };

    // Deduplication handlers
    const scanForDuplicates = async () => {
        setDedupeScanning(true);
        setDedupeError('');
        setDedupeMessage('');
        setDuplicateGroups([]);
        setDedupeStats(null);

        try {
            const response = await fetch('/api/cv/deduplicate');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Scan failed');
            }

            setDuplicateGroups(data.duplicateGroups || []);
            setDedupeStats({
                total: data.totalEntries,
                duplicates: data.duplicateCount,
                after: data.afterCleanup,
            });

            if (data.duplicateCount === 0) {
                setDedupeMessage('No duplicates found! Your CV is clean.');
            } else {
                setDedupeMessage(`Found ${data.duplicateCount} duplicate entries in ${data.duplicateGroups?.length || 0} groups.`);
            }
        } catch (err) {
            setDedupeError(err instanceof Error ? err.message : 'Scan failed');
        } finally {
            setDedupeScanning(false);
        }
    };

    const removeDuplicates = async () => {
        if (duplicateGroups.length === 0) return;

        // Collect IDs to delete (all except the keepId in each group)
        const idsToDelete: string[] = [];
        for (const group of duplicateGroups) {
            for (const entry of group.entries) {
                if (entry.id !== group.keepId) {
                    idsToDelete.push(entry.id);
                }
            }
        }

        if (idsToDelete.length === 0) {
            setDedupeError('No duplicates to remove');
            return;
        }

        setDedupeRemoving(true);
        setDedupeError('');

        try {
            const response = await fetch('/api/cv/deduplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entriesToDelete: idsToDelete }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Removal failed');
            }

            setDedupeMessage(`Successfully removed ${data.deletedCount} duplicate entries!`);
            setDuplicateGroups([]);
            setDedupeStats(null);
        } catch (err) {
            setDedupeError(err instanceof Error ? err.message : 'Removal failed');
        } finally {
            setDedupeRemoving(false);
        }
    };

    const searchPubMed = async () => {
        if (!authorName.trim()) {
            setError('Please enter an author name');
            return;
        }

        setLoading(true);
        setError('');
        setMessage('');
        setPublications([]);
        setAllPublications([]);
        setSelectedPubs(new Set());

        try {
            const response = await fetch(`/api/import/pubmed?author=${encodeURIComponent(authorName)}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Search failed');
            }

            // Store all publications
            const allPubs = data.entries || [];
            setAllPublications(allPubs);

            // Filter based on showOnlyNew setting
            const displayPubs = showOnlyNew
                ? allPubs.filter((e: Publication) => e.isNew !== false)
                : allPubs;
            setPublications(displayPubs);

            // Pre-select all displayed publications
            setSelectedPubs(new Set(displayPubs.map((_: Publication, i: number) => i)));

            const totalFound = data.totalFound || data.count || 0;
            const newCount = allPubs.filter((e: Publication) => e.isNew !== false).length;

            if (newCount === 0) {
                setMessage(`Found ${totalFound} publications - all already in your CV!`);
            } else if (newCount === totalFound) {
                setMessage(`Found ${newCount} new publications`);
            } else {
                setMessage(`Found ${newCount} new publications (${totalFound - newCount} already in CV)`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    // Effect to filter publications when toggle changes
    useEffect(() => {
        if (allPublications.length > 0) {
            const displayPubs = showOnlyNew
                ? allPublications.filter((e: Publication) => e.isNew !== false)
                : allPublications;
            setPublications(displayPubs);
            // Reset selection to all displayed publications
            setSelectedPubs(new Set(displayPubs.map((_: Publication, i: number) => i)));
        }
    }, [showOnlyNew, allPublications]);

    // Toggle individual publication selection
    const toggleSelection = (index: number) => {
        const newSelected = new Set(selectedPubs);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedPubs(newSelected);
    };

    // Select/deselect all
    const toggleSelectAll = () => {
        if (selectedPubs.size === publications.length) {
            setSelectedPubs(new Set());
        } else {
            setSelectedPubs(new Set(publications.map((_, i) => i)));
        }
    };

    const importSelectedPublications = async () => {
        if (selectedPubs.size === 0) {
            setError('Please select at least one publication to import');
            return;
        }

        setImporting(true);
        setError('');
        setMessage('');

        try {
            // Get selected publications
            const selectedEntries = publications.filter((_, i) => selectedPubs.has(i));

            const response = await fetch('/api/import/pubmed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    authorName,
                    entries: selectedEntries
                }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Import failed');
            }

            setMessage(`Successfully imported ${selectedPubs.size} publication(s) to pending review`);
            setPublications([]);
            setSelectedPubs(new Set());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar user={navUser} />

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <h1 className="text-3xl font-bold mb-8">Settings</h1>

                {/* Profile Information Section */}
                <div className="card mb-8">
                    <h2 className="text-xl font-semibold mb-4">Profile Information</h2>
                    <p className="text-muted-foreground mb-4">
                        This information appears at the top of your exported CV.
                    </p>

                    {profileMessage && (
                        <div className="p-3 rounded-lg bg-green-500/10 text-green-400 mb-4 text-sm">
                            {profileMessage}
                        </div>
                    )}
                    {profileError && (
                        <div className="p-3 rounded-lg bg-destructive/10 text-destructive mb-4 text-sm">
                            {profileError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="label">Full Name</label>
                            <input
                                type="text"
                                className="input"
                                value={profile.name || ''}
                                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                placeholder="Dr. Jane Smith"
                            />
                        </div>
                        <div>
                            <label className="label">Email</label>
                            <input
                                type="email"
                                className="input bg-muted/30"
                                value={profile.email}
                                disabled
                            />
                            <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
                        </div>
                        <div>
                            <label className="label">Institution/University</label>
                            <input
                                type="text"
                                className="input"
                                value={profile.institution || ''}
                                onChange={(e) => setProfile({ ...profile, institution: e.target.value })}
                                placeholder="Harvard Medical School"
                            />
                        </div>
                        <div>
                            <label className="label">Phone</label>
                            <input
                                type="tel"
                                className="input"
                                value={profile.phone || ''}
                                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                placeholder="+1 (555) 123-4567"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="label">Address</label>
                            <input
                                type="text"
                                className="input"
                                value={profile.address || ''}
                                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                                placeholder="123 University Ave, Boston, MA 02115"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="label">Website/Portfolio URL</label>
                            <input
                                type="url"
                                className="input"
                                value={profile.website || ''}
                                onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                                placeholder="https://yourwebsite.com"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSaveProfile}
                        disabled={profileSaving}
                        className="btn-primary"
                    >
                        {profileSaving ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>

                {/* CV Upload Section */}
                <div className="card mb-8">
                    <h2 className="text-xl font-semibold mb-4">Import Existing CV</h2>
                    <p className="text-muted-foreground mb-4">
                        Upload your existing CV (PDF or Word) and AI will automatically extract sections and entries.
                    </p>

                    <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-border hover:border-primary-500/50'
                            }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={handleFileSelect}
                            className="hidden"
                        />

                        {cvUploading ? (
                            <div className="flex flex-col items-center py-4">
                                <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500/30 border-t-primary-500 mb-4"></div>
                                <h3 className="text-lg font-semibold mb-2">Processing Your CV...</h3>
                                <p className="text-muted-foreground text-center max-w-md">
                                    Our AI is extracting your experiences, publications, and achievements.
                                </p>
                                <div className="mt-4 p-3 rounded-lg bg-primary-500/10 border border-primary-500/20 text-sm">
                                    <p className="text-primary-400 font-medium">⏱️ This typically takes 2-3 minutes for large CVs</p>
                                    <p className="text-muted-foreground mt-1">Please don&apos;t close this page. We&apos;re working on it!</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <p className="text-lg font-medium mb-1">Drop your CV here</p>
                                <p className="text-muted-foreground text-sm mb-4">or click to browse</p>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="btn-secondary"
                                >
                                    Select File
                                </button>
                                <p className="text-xs text-muted-foreground mt-3">
                                    Supports PDF and Word (.doc, .docx)
                                </p>
                            </>
                        )}
                    </div>

                    {cvError && (
                        <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                            {cvError}
                        </div>
                    )}

                    {cvMessage && (
                        <div className="mt-4 p-3 rounded-lg bg-success/10 text-success text-sm">
                            {cvMessage}
                        </div>
                    )}

                    {cvResult && cvResult.categories && cvResult.categories.length > 0 && (
                        <div className="mt-4 space-y-2">
                            <p className="text-sm font-medium">Imported Categories:</p>
                            <div className="grid grid-cols-2 gap-2">
                                {cvResult.categories.map((cat, index) => (
                                    <div key={index} className="p-2 rounded bg-secondary/50 text-sm">
                                        <span className="font-medium">{cat.name}</span>
                                        <span className="text-muted-foreground ml-2">({cat.entryCount} entries)</span>
                                    </div>
                                ))}
                            </div>
                            <a href="/cv/review" className="btn-primary inline-flex mt-4">
                                Review Imported Entries →
                            </a>
                        </div>
                    )}
                </div>

                {/* PubMed Auto-Updates Section */}
                <PubMedSettings />

                {/* PubMed Manual Import Section */}
                <div className="card mb-8 mt-8">
                    <h2 className="text-xl font-semibold mb-4">PubMed Manual Search</h2>
                    <p className="text-muted-foreground mb-4">
                        Search for your publications on PubMed and import them to your CV.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Author Name
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={authorName}
                                    onChange={(e) => setAuthorName(e.target.value)}
                                    placeholder="e.g., Ponsky T or Ponsky Todd"
                                    className="input flex-1"
                                />
                                <button
                                    onClick={searchPubMed}
                                    disabled={loading}
                                    className="btn-secondary"
                                >
                                    {loading ? 'Searching...' : 'Search'}
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Use format: Last First or Last FM (e.g., &quot;Smith John&quot; or &quot;Smith JD&quot;)
                            </p>
                        </div>

                        {allPublications.length > 0 && (
                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={showOnlyNew}
                                        onChange={(e) => setShowOnlyNew(e.target.checked)}
                                        className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
                                    />
                                    <span className="text-sm">Show only new (not already in CV)</span>
                                </label>
                                <span className="text-xs text-muted-foreground">
                                    ({allPublications.filter(p => p.isNew !== false).length} new / {allPublications.length} total)
                                </span>
                            </div>
                        )}

                        {error && (
                            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                                {error}
                            </div>
                        )}

                        {message && (
                            <div className="p-3 rounded-lg bg-success/10 text-success text-sm">
                                {message}
                            </div>
                        )}

                        {publications.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedPubs.size === publications.length && publications.length > 0}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
                                            />
                                            <span className="text-sm font-medium">Select All</span>
                                        </label>
                                        <span className="text-sm text-muted-foreground">
                                            ({selectedPubs.size} of {publications.length} selected)
                                        </span>
                                    </div>
                                    <button
                                        onClick={importSelectedPublications}
                                        disabled={importing || selectedPubs.size === 0}
                                        className="btn-primary"
                                    >
                                        {importing ? 'Importing...' : `Import Selected (${selectedPubs.size})`}
                                    </button>
                                </div>

                                <div className="max-h-96 overflow-y-auto space-y-2">
                                    {publications.map((pub, index) => (
                                        <label
                                            key={index}
                                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${selectedPubs.has(index)
                                                ? 'bg-primary-500/10 border border-primary-500/30'
                                                : 'bg-secondary/50 hover:bg-secondary/70'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedPubs.has(index)}
                                                onChange={() => toggleSelection(index)}
                                                className="w-4 h-4 mt-0.5 rounded border-border text-primary-500 focus:ring-primary-500"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm line-clamp-2">{pub.title}</p>
                                                <p className="text-muted-foreground text-xs mt-1 line-clamp-1">
                                                    {pub.description}
                                                </p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Email Forwarding Section */}
                <div className="card mb-8">
                    <h2 className="text-xl font-semibold mb-4">Email Forwarding</h2>
                    <p className="text-muted-foreground mb-4">
                        Forward emails containing awards, conference invitations, or other CV-worthy content.
                        AI will automatically extract relevant information.
                    </p>
                    <div className="p-4 rounded-lg bg-success/10 border border-success/30">
                        <p className="font-medium text-success">Email forwarding is active!</p>
                        <p className="text-sm text-muted-foreground mt-2">
                            Forward any email to:
                        </p>
                        <code className="block mt-2 px-3 py-2 rounded bg-secondary text-lg font-mono">
                            add@ieonteuwil.resend.app
                        </code>
                        <p className="text-xs text-muted-foreground mt-3">
                            AI will extract CV-worthy content like publications, awards, and presentations.
                            Check the Review Queue to approve extracted entries.
                        </p>
                    </div>
                </div>

                {/* Clean Up Duplicates Section */}
                <div className="card mb-8">
                    <h2 className="text-xl font-semibold mb-4">Clean Up Duplicates</h2>
                    <p className="text-muted-foreground mb-4">
                        Scan your CV for duplicate entries (same publication imported from different sources).
                    </p>

                    <div className="flex gap-3 mb-4">
                        <button
                            onClick={scanForDuplicates}
                            disabled={dedupeScanning}
                            className="btn-secondary"
                        >
                            {dedupeScanning ? 'Scanning...' : 'Scan for Duplicates'}
                        </button>
                        {duplicateGroups.length > 0 && (
                            <button
                                onClick={removeDuplicates}
                                disabled={dedupeRemoving}
                                className="btn-primary"
                            >
                                {dedupeRemoving ? 'Removing...' : `Remove ${dedupeStats?.duplicates || 0} Duplicates`}
                            </button>
                        )}
                    </div>

                    {dedupeError && (
                        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
                            {dedupeError}
                        </div>
                    )}

                    {dedupeMessage && (
                        <div className="p-3 rounded-lg bg-success/10 text-success text-sm mb-4">
                            {dedupeMessage}
                        </div>
                    )}

                    {dedupeStats && (
                        <div className="text-sm text-muted-foreground mb-4">
                            <p>Current entries: <span className="font-medium text-foreground">{dedupeStats.total}</span></p>
                            <p>After cleanup: <span className="font-medium text-foreground">{dedupeStats.after}</span></p>
                        </div>
                    )}

                    {duplicateGroups.length > 0 && (
                        <div className="max-h-96 overflow-y-auto space-y-3">
                            {duplicateGroups.slice(0, 10).map((group, gi) => (
                                <div key={gi} className="p-3 rounded-lg bg-secondary/50">
                                    <p className="font-medium text-sm mb-2 line-clamp-1">{group.entries[0]?.title}</p>
                                    <div className="space-y-1">
                                        {group.entries.map((entry, ei) => (
                                            <div
                                                key={entry.id}
                                                className={`text-xs p-2 rounded ${entry.id === group.keepId ? 'bg-success/10 border border-success/30' : 'bg-destructive/10 border border-destructive/30'}`}
                                            >
                                                <span className="font-medium">
                                                    {entry.id === group.keepId ? '✓ Keep: ' : '✗ Remove: '}
                                                </span>
                                                {entry.categoryName}
                                                {entry.hasPMID && <span className="ml-2 text-primary-400">[PMID]</span>}
                                                {entry.hasDOI && <span className="ml-1 text-primary-400">[DOI]</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {duplicateGroups.length > 10 && (
                                <p className="text-sm text-muted-foreground text-center">
                                    ... and {duplicateGroups.length - 10} more groups
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Review Queue Link */}
                <div className="card">
                    <h2 className="text-xl font-semibold mb-4">Pending Entries</h2>
                    <p className="text-muted-foreground mb-4">
                        Review and approve entries imported from PubMed or forwarded emails.
                    </p>
                    <a href="/cv/review" className="btn-secondary inline-flex">
                        Go to Review Queue →
                    </a>
                </div>
            </main>
        </div>
    );
}
