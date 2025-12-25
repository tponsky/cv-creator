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
    const [cvChunkProgress, setCvChunkProgress] = useState<{ current: number; total: number } | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [cvUploadExpanded, setCvUploadExpanded] = useState(false);
    const [hasExistingEntries, setHasExistingEntries] = useState(false);
    const [cvResetting, setCvResetting] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [wizardStep, setWizardStep] = useState(0); // 0 = normal settings, 1-6 = onboarding wizard
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pasteMode, setPasteMode] = useState(false);
    const [pasteText, setPasteText] = useState('');

    // Deduplication state
    interface DuplicateEntry {
        id: string;
        title: string;
        description: string | null;
        date: string | null;
        location: string | null;
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
    const [selectedToRemove, setSelectedToRemove] = useState<Set<string>>(new Set());

    // Missing dates state
    interface MissingDateEntry {
        id: string;
        title: string;
        description: string | null;
        categoryId: string;
        categoryName: string;
    }
    const [missingDatesEntries, setMissingDatesEntries] = useState<MissingDateEntry[]>([]);
    const [missingDatesLoading, setMissingDatesLoading] = useState(false);
    const [dateEdits, setDateEdits] = useState<Record<string, string>>({});
    const [autoFixingDates, setAutoFixingDates] = useState(false);
    const [autoFixResult, setAutoFixResult] = useState<{ updated: number; skipped: number } | null>(null);

    // PMID enrichment state
    interface PmidEntry {
        id: string;
        title: string;
        description: string | null;
        categoryName: string;
        hasPMID: boolean;
    }
    const [pmidEntries, setPmidEntries] = useState<PmidEntry[]>([]);
    const [pmidStats, setPmidStats] = useState<{ total: number; withPmid: number; withoutPmid: number } | null>(null);
    const [pmidLoading, setPmidLoading] = useState(false);
    const [pmidEnrichMessage, setPmidEnrichMessage] = useState('');
    const [selectedPmidEntries, setSelectedPmidEntries] = useState<Set<string>>(new Set());
    const [batchEnriching, setBatchEnriching] = useState(false);

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
                // Silently fail - profile fetch is optional on settings page
                if (e instanceof TypeError && e.message.includes('Load failed')) {
                    console.warn('Network error fetching profile (this is normal if offline)');
                } else {
                    console.error('Failed to fetch profile:', e);
                }
            }
        };
        fetchProfile();

        // Check if user has existing CV entries OR pending entries
        const checkExistingEntries = async () => {
            try {
                const [entriesRes, pendingRes] = await Promise.all([
                    fetch('/api/cv/entries'),
                    fetch('/api/pending')
                ]);

                let hasEntries = false;
                let hasPending = false;

                if (entriesRes.ok) {
                    const entries = await entriesRes.json();
                    hasEntries = Array.isArray(entries) && entries.length > 0;
                }

                if (pendingRes.ok) {
                    const pendingData = await pendingRes.json();
                    hasPending = Array.isArray(pendingData.entries) && pendingData.entries.length > 0;
                }

                // Consider existing if either entries or pending items exist
                const exists = hasEntries || hasPending;
                setHasExistingEntries(exists);

                // Start wizard ONLY for completely new users (no confirmed OR pending entries)
                if (!exists) {
                    setWizardStep(1);
                }
            } catch (e) {
                // Silently fail - these are optional checks
                // Don't log as error to avoid console spam
                if (e instanceof TypeError && e.message.includes('Load failed')) {
                    console.warn('Network error checking entries (this is normal if offline)');
                } else {
                    console.error('Failed to check entries:', e);
                }
            }
        };
        checkExistingEntries();
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

    // Warn user before leaving page during upload
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (cvUploading) {
                e.preventDefault();
                e.returnValue = 'CV processing is in progress. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [cvUploading]);

    // Extract text from PDF using pdf.js
    const extractTextFromPDF = async (file: File): Promise<string> => {
        const pdfjsLib = await import('pdfjs-dist');
        
        // Set worker source - use unpkg which is more reliable
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ');
            fullText += pageText + '\n\n';
        }
        
        return fullText;
    };

    // Split text into chunks by section headers
    const splitTextIntoChunks = (text: string, maxChunkSize: number = 10000): string[] => {
        const sectionPattern = /\n(?=(?:PUBLICATIONS?|PEER[- ]?REVIEWED|PRESENTATIONS?|ABSTRACTS?|GRANTS?|FUNDING|AWARDS?|HONORS?|EDUCATION|EXPERIENCE|TEACHING|MENTORING|SERVICE|LEADERSHIP|PROFESSIONAL|EDITORIAL|COMMITTEE|TRAINING|RESEARCH|CLINICAL|ACADEMIC|PATENTS?|BOOKS?|CHAPTERS?|INVITED|CONFERENCES?|APPOINTMENTS?|POSITIONS?)\s*[:\n])/gi;
        
        const sections = text.split(sectionPattern);
        const chunks: string[] = [];
        let currentChunk = '';
        
        for (const section of sections) {
            if (currentChunk.length + section.length < maxChunkSize) {
                currentChunk += section;
            } else {
                if (currentChunk.trim()) chunks.push(currentChunk.trim());
                if (section.length > maxChunkSize) {
                    // Split large sections by paragraphs
                    const paragraphs = section.split(/\n\n+/);
                    let subChunk = '';
                    for (const para of paragraphs) {
                        if (subChunk.length + para.length < maxChunkSize) {
                            subChunk += (subChunk ? '\n\n' : '') + para;
                        } else {
                            if (subChunk) chunks.push(subChunk);
                            subChunk = para.length > maxChunkSize ? para.substring(0, maxChunkSize) : para;
                        }
                    }
                    if (subChunk) chunks.push(subChunk);
                    currentChunk = '';
                } else {
                    currentChunk = section;
                }
            }
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        
        return chunks.length > 0 ? chunks : [text];
    };

    const uploadCV = async (file: File) => {
        console.log('[Upload] Starting client-side processing for:', file.name, file.size, 'bytes');
        setCvUploading(true);
        setCvError('');
        setCvMessage('');
        setCvResult(null);
        setCvChunkProgress({ current: 0, total: 100 });

        try {
            // Validate file
            if (file.size === 0) {
                throw new Error('File is empty. Please select a valid CV file.');
            }
            if (file.size > 15 * 1024 * 1024) {
                throw new Error('File is too large. Maximum size is 15MB.');
            }

            // Step 1: Extract text from PDF (client-side)
            // Estimate processing time: ~1 min per page of CV
            const estimatedPages = Math.ceil(file.size / 50000); // Rough estimate
            const estimatedMinutes = Math.max(1, Math.ceil(estimatedPages * 0.8));
            setCvMessage(`⚠️ Stay on this page - Extracting text (~${estimatedMinutes} min total for ${estimatedPages} pages)...`);
            setCvChunkProgress({ current: 5, total: 100 });
            
            let text: string;
            if (file.type === 'application/pdf') {
                text = await extractTextFromPDF(file);
            } else {
                throw new Error('Please upload a PDF file. Word documents are not supported for client-side processing.');
            }
            
            console.log('[Upload] Extracted', text.length, 'characters');
            setCvChunkProgress({ current: 10, total: 100 });

            // Step 2: Split into chunks
            const chunks = splitTextIntoChunks(text, 10000);
            console.log('[Upload] Split into', chunks.length, 'chunks');
            
            let totalEntriesCreated = 0;
            let totalDuplicatesSkipped = 0;
            const allCategories: string[] = [];

            // Step 3: Process each chunk
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const isFirstChunk = i === 0;
                const isLastChunk = i === chunks.length - 1;
                
                // Calculate progress: 10% for extraction, 85% for chunks, 5% for finalization
                const chunkProgress = 10 + Math.floor(((i + 1) / chunks.length) * 85);
                setCvChunkProgress({ current: chunkProgress, total: 100 });
                // Estimate ~30 seconds per chunk
            const estimatedMinutes = Math.ceil((chunks.length - i) * 0.5);
            setCvMessage(`⚠️ Stay on this page - Processing section ${i + 1} of ${chunks.length} (~${estimatedMinutes} min remaining)`);
                
                console.log(`[Upload] Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
                
                try {
                    const response = await fetch('/api/import/cv/chunk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: chunk,
                            chunkIndex: i,
                            totalChunks: chunks.length,
                            isFirstChunk,
                            isLastChunk,
                        }),
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        console.error(`[Upload] Chunk ${i + 1} failed:`, errorData);
                        // Continue with other chunks even if one fails
                        continue;
                    }
                    
                    const result = await response.json();
                    totalEntriesCreated += result.entriesCreated || 0;
                    totalDuplicatesSkipped += result.duplicatesSkipped || 0;
                    if (result.categoriesProcessed) {
                        allCategories.push(...result.categoriesProcessed);
                    }
                    
                    console.log(`[Upload] Chunk ${i + 1} complete:`, result.entriesCreated, 'entries');
                    
                } catch (chunkError) {
                    console.error(`[Upload] Chunk ${i + 1} error:`, chunkError);
                    // Continue with other chunks
                }
            }

            // Step 4: Complete
            setCvChunkProgress({ current: 100, total: 100 });
            setCvUploading(false);
            
            const uniqueCategories = Array.from(new Set(allCategories));
            
            if (totalEntriesCreated > 0) {
                setCvMessage(`✅ Successfully imported ${totalEntriesCreated} entries from ${uniqueCategories.length} categories!${totalDuplicatesSkipped > 0 ? ` (${totalDuplicatesSkipped} duplicates skipped)` : ''}`);
                setHasExistingEntries(true);
                setCvResult({
                    success: true,
                    message: `Imported ${totalEntriesCreated} entries`,
                    entriesCreated: totalEntriesCreated,
                    categoriesFound: uniqueCategories.length,
                    categories: uniqueCategories.map(name => ({ name, entryCount: 0 })),
                });
                
                // Auto-advance if in wizard mode
                if (wizardStep === 2) {
                    setWizardStep(3);
                    setCvMessage('CV ADDED SUCCESSFULLY!');
                }
            } else if (totalDuplicatesSkipped > 0) {
                setCvMessage(`CV processed. ${totalDuplicatesSkipped} entries were already imported (duplicates skipped).`);
            } else {
                setCvMessage('CV processed, but no entries were found. The file format may not be supported.');
            }
            
            setCvChunkProgress(null);

        } catch (err) {
            console.error('[Upload] Error:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            setCvError(errorMessage || 'Upload failed. Please try again.');
            setCvUploading(false);
            setCvChunkProgress(null);
        }
    };

    // Upload pasted text (for specific sections)
    const uploadPastedText = async () => {
        if (!pasteText.trim() || pasteText.length < 50) {
            setCvError('Please paste at least 50 characters of CV text.');
            return;
        }

        setCvUploading(true);
        setCvError('');
        setCvMessage('Processing pasted text...');
        setCvChunkProgress({ current: 10, total: 100 });

        try {
            const text = pasteText.trim();
            
            // Split into chunks if needed
            const chunkSize = 10000;
            const chunks: string[] = [];
            for (let i = 0; i < text.length; i += chunkSize) {
                chunks.push(text.slice(i, i + chunkSize));
            }

            let totalEntriesCreated = 0;
            let totalEntriesUpdated = 0;
            let totalDuplicatesSkipped = 0;
            const allCategories: string[] = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                setCvMessage(`Processing section ${i + 1} of ${chunks.length}...`);
                setCvChunkProgress({ current: 10 + Math.floor(((i + 1) / chunks.length) * 85), total: 100 });

                const response = await fetch('/api/import/cv/chunk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: chunk,
                        chunkIndex: i,
                        totalChunks: chunks.length,
                        isFirstChunk: i === 0,
                        isLastChunk: i === chunks.length - 1,
                    }),
                });

                if (response.ok) {
                    const result = await response.json();
                    totalEntriesCreated += result.entriesCreated || 0;
                    totalEntriesUpdated += result.entriesUpdated || 0;
                    totalDuplicatesSkipped += result.duplicatesSkipped || 0;
                    if (result.categoriesProcessed) {
                        allCategories.push(...result.categoriesProcessed);
                    }
                }
            }

            setCvChunkProgress({ current: 100, total: 100 });
            setCvUploading(false);
            setPasteText('');
            setPasteMode(false);

            const uniqueCategories = Array.from(new Set(allCategories));

            if (totalEntriesCreated > 0 || totalEntriesUpdated > 0) {
                let msg = '✅ ';
                if (totalEntriesCreated > 0) msg += `Created ${totalEntriesCreated} new entries`;
                if (totalEntriesUpdated > 0) msg += `${totalEntriesCreated > 0 ? ', ' : ''}Updated ${totalEntriesUpdated} entries with dates`;
                if (totalDuplicatesSkipped > 0) msg += ` (${totalDuplicatesSkipped} duplicates skipped)`;
                setCvMessage(msg);
                setCvResult({
                    success: true,
                    message: msg,
                    entriesCreated: totalEntriesCreated + totalEntriesUpdated,
                    categoriesFound: uniqueCategories.length,
                    categories: uniqueCategories.map(name => ({ name, entryCount: 0 })),
                });
            } else if (totalDuplicatesSkipped > 0) {
                setCvMessage(`Text processed. ${totalDuplicatesSkipped} entries were already imported with dates.`);
            } else {
                setCvMessage('No new entries found in the pasted text.');
            }

            setCvChunkProgress(null);

        } catch (err) {
            console.error('[Paste Upload] Error:', err);
            setCvError(err instanceof Error ? err.message : 'Failed to process pasted text.');
            setCvUploading(false);
            setCvChunkProgress(null);
        }
    };

    // Reset/delete all CV data
    const resetCV = async () => {
        setCvResetting(true);
        try {
            const response = await fetch('/api/cv/reset', { method: 'DELETE' });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Reset failed');
            }

            // Clear local state
            setCvResult(null);
            setCvMessage(`CV data deleted: ${data.deleted.categories} categories, ${data.deleted.entries} entries`);
            setHasExistingEntries(false);
            setShowResetConfirm(false);

            // Refresh the page after a moment to show fresh state
            setTimeout(() => window.location.reload(), 2000);
        } catch (err) {
            setCvError(err instanceof Error ? err.message : 'Reset failed');
        } finally {
            setCvResetting(false);
        }
    };

    // Deduplication handlers
    const scanForDuplicates = async () => {
        setDedupeScanning(true);
        setDedupeError('');
        setDedupeMessage('');
        setDuplicateGroups([]);
        setDedupeStats(null);
        setSelectedToRemove(new Set());

        try {
            const response = await fetch('/api/cv/deduplicate');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Scan failed');
            }

            const groups = data.duplicateGroups || [];
            setDuplicateGroups(groups);
            setDedupeStats({
                total: data.totalEntries,
                duplicates: data.duplicateCount,
                after: data.afterCleanup,
            });

            // Pre-select suggested removals (user can uncheck any)
            const suggestedRemovals = new Set<string>();
            for (const group of groups) {
                for (const entry of group.entries) {
                    if (entry.id !== group.keepId) {
                        suggestedRemovals.add(entry.id);
                    }
                }
            }
            setSelectedToRemove(suggestedRemovals);

            if (data.duplicateCount === 0) {
                setDedupeMessage('No duplicates found! Your CV is clean.');
            } else {
                setDedupeMessage(`Found ${data.duplicateCount} potential duplicates. Review and uncheck any you want to keep.`);
            }
        } catch (err) {
            setDedupeError(err instanceof Error ? err.message : 'Scan failed');
        } finally {
            setDedupeScanning(false);
        }
    };

    const removeDuplicates = async () => {
        if (selectedToRemove.size === 0) {
            setDedupeError('No entries selected for removal. Check the boxes next to entries you want to remove.');
            return;
        }

        const idsToDelete = Array.from(selectedToRemove);

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
            setSelectedToRemove(new Set());
        } catch (err) {
            setDedupeError(err instanceof Error ? err.message : 'Removal failed');
        } finally {
            setDedupeRemoving(false);
        }
    };

    // Missing dates handlers
    const fetchMissingDates = async () => {
        setMissingDatesLoading(true);
        try {
            const res = await fetch('/api/cv/missing-dates');
            const data = await res.json();
            if (res.ok) {
                setMissingDatesEntries(data.entries || []);
            }
        } catch (err) {
            console.error('Failed to fetch missing dates:', err);
        } finally {
            setMissingDatesLoading(false);
        }
    };

    const updateEntryDate = async (entryId: string) => {
        const dateValue = dateEdits[entryId];
        if (!dateValue) return;

        try {
            const res = await fetch('/api/cv/missing-dates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entryId, date: dateValue }),
            });
            if (res.ok) {
                // Remove from list after successful update
                setMissingDatesEntries(prev => prev.filter(e => e.id !== entryId));
                setDateEdits(prev => {
                    const next = { ...prev };
                    delete next[entryId];
                    return next;
                });
            }
        } catch (err) {
            console.error('Failed to update date:', err);
        }
    };

    // Auto-fix dates by extracting from titles/descriptions
    const autoFixDates = async () => {
        setAutoFixingDates(true);
        setAutoFixResult(null);
        try {
            const res = await fetch('/api/cv/fix-dates', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setAutoFixResult({ updated: data.updatedCount, skipped: data.skippedCount });
                // Refresh the missing dates list
                fetchMissingDates();
            } else {
                console.error('Auto-fix failed:', data.error);
            }
        } catch (err) {
            console.error('Auto-fix dates error:', err);
        } finally {
            setAutoFixingDates(false);
        }
    };

    // PMID enrichment handlers
    const fetchPmidEntries = useCallback(async () => {
        setPmidLoading(true);
        setPmidEnrichMessage('');
        try {
            const res = await fetch('/api/cv/enrich-pmid');
            const data = await res.json();
            if (res.ok) {
                const entries = data.entries || [];
                setPmidEntries(entries);
                // Auto-select all entries for batch processing
                setSelectedPmidEntries(new Set(entries.map((e: PmidEntry) => e.id)));
                setPmidStats({
                    total: data.total,
                    withPmid: data.withPmid,
                    withoutPmid: data.withoutPmid,
                });
            }
        } catch (err) {
            console.error('Failed to fetch PMID entries:', err);
        } finally {
            setPmidLoading(false);
        }
    }, [setPmidLoading, setPmidEnrichMessage, setPmidEntries, setSelectedPmidEntries, setPmidStats]);

    // Auto-trigger scan if we just entered Step 3 of the wizard
    useEffect(() => {
        if (wizardStep === 3 && !pmidStats && !pmidLoading) {
            fetchPmidEntries();
        }
    }, [wizardStep, pmidStats, pmidLoading, fetchPmidEntries]);

    // Batch enrich selected entries
    const batchEnrichPmids = async () => {
        if (selectedPmidEntries.size === 0) return;

        setBatchEnriching(true);
        setPmidEnrichMessage('Starting batch processing...');

        const entriesToProcess = pmidEntries.filter(e => selectedPmidEntries.has(e.id));
        let successCount = 0;
        let failCount = 0;

        // Process ONE at a time to respect PubMed rate limits (3 req/sec max)
        // Each entry requires 2 requests (search + save), so 1 entry per 1.5 seconds
        for (let i = 0; i < entriesToProcess.length; i++) {
            const entry = entriesToProcess[i];
            const remaining = entriesToProcess.length - i;
            const estimatedMins = Math.ceil(remaining * 1.5 / 60);
            setPmidEnrichMessage(`Processing ${i + 1} of ${entriesToProcess.length} (~${estimatedMins} min remaining)...`);

            try {
                // Search PubMed for this title
                const searchRes = await fetch('/api/cv/enrich-pmid', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: entry.title }),
                });
                
                // Wait 600ms after search to respect rate limits
                await new Promise(r => setTimeout(r, 600));
                
                const searchData = await searchRes.json();

                if (searchRes.ok && searchData.results && searchData.results.length > 0) {
                    // Apply the best match (first result)
                    const bestMatch = searchData.results[0];
                    const applyRes = await fetch('/api/cv/enrich-pmid', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            entryId: entry.id,
                            pmid: bestMatch.pmid,
                            doi: bestMatch.doi
                        }),
                    });

                    // Wait 600ms after save
                    await new Promise(r => setTimeout(r, 600));

                    if (applyRes.ok) {
                        successCount++;
                        // Update UI immediately for this entry
                        setPmidEntries(prev => prev.filter(e => e.id !== entry.id));
                        setSelectedPmidEntries(prev => {
                            const next = new Set(prev);
                            next.delete(entry.id);
                            return next;
                        });
                        setPmidStats(prev => prev ? ({
                            ...prev,
                            withPmid: prev.withPmid + 1,
                            withoutPmid: prev.withoutPmid - 1,
                        }) : null);
                    } else {
                        failCount++;
                    }
                } else {
                    failCount++;
                    // Still wait to not hammer the API
                    await new Promise(r => setTimeout(r, 400));
                }
            } catch (err) {
                console.error('Batch enrich error for', entry.id, err);
                failCount++;
                // Wait on error too
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        setPmidEnrichMessage(`Finished: ${successCount} enriched, ${failCount} not found/failed`);
        setBatchEnriching(false);
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

    // WIZARD RENDERER
    const renderWizardStep = () => {
        const steps = ['Welcome', 'Upload CV', 'Enrich PMIDs', 'Find Articles', 'Profile', 'Automation'];
        const currentStepName = steps[wizardStep - 1] || '';
        const progress = (wizardStep / steps.length) * 100;

        return (
            <div className="space-y-6">
                {/* Progress Header */}
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-muted-foreground">Step {wizardStep} of {steps.length}: {currentStepName}</span>
                        <div className="flex gap-2">
                            <button onClick={() => setWizardStep(0)} className="text-sm text-red-500 hover:text-red-700 font-medium">Exit Setup</button>
                            {wizardStep > 1 && (
                                <button onClick={() => setWizardStep(s => s - 1)} className="text-sm text-muted-foreground hover:text-foreground">Back</button>
                            )}

                        </div>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
                    </div>
                </div>

                {/* Step Content */}
                <div className="card p-8 min-h-[400px]">
                    {wizardStep === 1 && (
                        <div className="text-center space-y-6 py-8">
                            <h2 className="text-3xl font-bold">Welcome to CV Creator!</h2>
                            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                                We&apos;ll walk you through a quick setup to optimize your CV management, prevent duplicates, and keep your profile up to date.
                            </p>
                            <button onClick={() => setWizardStep(2)} className="btn-primary text-lg px-8 py-3">Let&apos;s Get Started</button>
                        </div>
                    )}

                    {wizardStep === 2 && (
                        <div className="space-y-6">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold">Step 2: Upload Your CV</h2>
                                <p className="text-muted-foreground">If you have an existing CV (PDF or Word), upload it now so we can import your work.</p>
                            </div>

                            <div className={`rounded-lg p-8 text-center transition-colors
                                ${!hasExistingEntries ? 'border-2 border-dashed' : ''}
                                ${dragActive ? 'border-primary bg-primary/5' : 'border-border'}
                                ${cvResult ? 'bg-green-50/10' : ''}`}
                                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>

                                {cvUploading ? (
                                    <div className="py-12 text-foreground">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                                        <p className="text-xl font-medium mb-1 text-foreground">{cvMessage}</p>
                                        {cvChunkProgress && (
                                            <div className="max-w-xs mx-auto mt-4">
                                                <div className="flex justify-between text-sm mb-1 text-foreground">
                                                    <span>Processing...</span>
                                                    <span>{cvChunkProgress.current}%</span>
                                                </div>
                                                <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${cvChunkProgress.current}%` }} />
                                                </div>
                                            </div>
                                        )}
                                        <p className="text-sm text-muted-foreground mt-4 italic">Large CVs may take 15-20 minutes. Please stay on this page.</p>
                                    </div>
                                ) : hasExistingEntries ? (
                                    <div className="py-8">
                                        <div className="text-green-500 text-5xl mb-4">✓</div>
                                        <h3 className="text-xl font-bold mb-2">CV Uploaded Successfully!</h3>
                                        <p className="text-muted-foreground mb-6">We extracted your entries.</p>
                                        <div className="flex justify-center gap-4">
                                            <button onClick={() => setHasExistingEntries(false)} className="btn-secondary">Re-upload</button>
                                            <button onClick={() => setWizardStep(3)} className="btn-primary">Next: Prevent Duplicates →</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mb-4 text-4xl">📄</div>
                                        <p className="mb-4 text-lg">Drag & drop your CV here, or</p>
                                        <button onClick={() => fileInputRef.current?.click()} className="btn-secondary mb-6">Select File</button>
                                        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.doc" onChange={handleFileSelect} />
                                        <p className="text-sm text-muted-foreground">Supported formats: PDF, Word (.docx, .doc)</p>

                                        <div className="mt-8 pt-8 border-t">
                                            <button onClick={() => setWizardStep(3)} className="text-muted-foreground hover:text-foreground">
                                                I don&apos;t have a CV file, skip this step →
                                            </button>
                                        </div>
                                    </>
                                )}
                                {cvError && <p className="text-destructive mt-4">{cvError}</p>}
                            </div>
                        </div>
                    )}

                    {wizardStep === 3 && (
                        <div className="space-y-6">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold">Step 2: Prevent Duplicates</h2>
                                <p className="text-muted-foreground">We recommend adding PMIDs (PubMed IDs) to your articles. This helps us identify duplicates when scanning online sources.</p>
                            </div>

                            {!pmidStats ? (
                                <div className="text-center py-8">
                                    <button onClick={fetchPmidEntries} disabled={pmidLoading} className="btn-primary text-lg px-8 py-3">
                                        {pmidLoading ? 'Scanning...' : 'Scan CV for Missing PMIDs'}
                                    </button>
                                    <p className="mt-4 text-sm text-muted-foreground">We will cross-reference your titles with PubMed.</p>

                                    <div className="mt-8 pt-8 border-t">
                                        <button onClick={() => setWizardStep(4)} className="text-muted-foreground text-sm">Skip this step</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="flex gap-4 p-4 bg-muted/30 rounded-lg justify-center">
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-green-500">{pmidStats.withPmid}</div>
                                            <div className="text-xs text-muted-foreground">Has PMID</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-2xl font-bold text-orange-500">{pmidStats.withoutPmid}</div>
                                            <div className="text-xs text-muted-foreground">Missing PMID</div>
                                        </div>
                                    </div>

                                    {pmidEntries.length > 0 ? (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between p-4 border rounded-lg bg-blue-50/50">
                                                <div>
                                                    <h4 className="font-semibold text-blue-900">Auto-Enrichment</h4>
                                                    <p className="text-sm text-blue-700">Found {pmidEntries.length} entries we can check against PubMed.</p>
                                                    {pmidEnrichMessage && <p className="text-sm font-medium mt-1">{pmidEnrichMessage}</p>}
                                                </div>
                                                <button
                                                    onClick={batchEnrichPmids}
                                                    disabled={batchEnriching || selectedPmidEntries.size === 0}
                                                    className="btn-primary whitespace-nowrap"
                                                >
                                                    {batchEnriching ? 'Processing...' : 'Auto-Add PMIDs to All'}
                                                </button>
                                            </div>

                                            <div className="max-h-60 overflow-y-auto border rounded-md p-2 text-sm bg-muted/10">
                                                {pmidEntries.map(entry => (
                                                    <div key={entry.id} className="p-2 border-b last:border-0 flex justify-between">
                                                        <span className="truncate flex-1 pr-4">{entry.title}</span>
                                                        <span className="text-muted-foreground text-xs whitespace-nowrap">Missing</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center text-green-500 py-4">
                                            <p>All scanned entries have PMIDs or none found.</p>
                                        </div>
                                    )}

                                    <div className="flex justify-end pt-6 border-t">
                                        <button onClick={() => setWizardStep(4)} className="btn-primary">Next: Find Missing Articles →</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {wizardStep === 4 && (
                        <div className="space-y-6">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold">Step 3: Find Missing Articles</h2>
                                <p className="text-muted-foreground">Scan PubMed for articles that might be missing from your CV.</p>
                            </div>

                            <div className="max-w-xl mx-auto">
                                <div className="flex gap-2 mb-6">
                                    <input
                                        type="text"
                                        value={authorName}
                                        onChange={(e) => setAuthorName(e.target.value)}
                                        placeholder="Enter Author Name (e.g., Ponsky T)"
                                        className="input-field flex-1"
                                    />
                                    <button onClick={searchPubMed} disabled={loading} className="btn-primary">
                                        {loading ? 'Searching...' : 'Search'}
                                    </button>
                                </div>

                                {publications.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="p-4 bg-muted/30 rounded-lg">
                                            <h3 className="font-medium mb-2">Found {publications.length} potential articles</h3>
                                            <p className="text-sm text-muted-foreground mb-4">Select the ones that are yours.</p>

                                            <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
                                                {publications.map((pub, i) => (
                                                    <label key={i} className="flex gap-3 p-3 bg-background border rounded cursor-pointer hover:border-primary/50">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedPubs.has(i)}
                                                            onChange={() => {
                                                                const next = new Set(selectedPubs);
                                                                if (next.has(i)) next.delete(i);
                                                                else next.add(i);
                                                                setSelectedPubs(next);
                                                            }}
                                                            className="mt-1"
                                                        />
                                                        <div>
                                                            <div className="font-medium text-sm">{pub.title}</div>
                                                            <div className="text-xs text-muted-foreground">{pub.sourceType} • {pub.date}</div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>

                                            <button
                                                onClick={importSelectedPublications}
                                                disabled={selectedPubs.size === 0 || importing}
                                                className="w-full btn-primary"
                                            >
                                                {importing ? 'Importing...' : `Import ${selectedPubs.size} Selected`}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end pt-6 mt-8 border-t">
                                    <button onClick={() => setWizardStep(5)} className="btn-primary">Next: Confirm Profile →</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {wizardStep === 5 && (
                        <div className="space-y-6">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold">Step 4: Confirm Profile</h2>
                                <p className="text-muted-foreground">Make sure your profile information is correct.</p>
                            </div>

                            <div className="max-w-xl mx-auto space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Full Name</label>
                                    <input value={profile.name || ''} onChange={e => setProfile({ ...profile, name: e.target.value })} className="input-field w-full" placeholder="Dr. Jane Doe" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Institution</label>
                                    <input value={profile.institution || ''} onChange={e => setProfile({ ...profile, institution: e.target.value })} className="input-field w-full" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Email</label>
                                    <input value={profile.email || ''} onChange={e => setProfile({ ...profile, email: e.target.value })} className="input-field w-full" />
                                </div>

                                <div className="flex justify-end pt-6 mt-8 border-t gap-2">
                                    <button onClick={handleSaveProfile} className="btn-secondary">Save Profile</button>
                                    <button onClick={async () => { await handleSaveProfile(); setWizardStep(6); }} className="btn-primary">Save & Next →</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {wizardStep === 6 && (
                        <div className="text-center space-y-6 py-8">
                            <h2 className="text-3xl font-bold">All Set! 🚀</h2>
                            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                                Your CV is set up. You can now enable auto-updates to keep it current.
                            </p>

                            <div className="max-w-md mx-auto p-6 bg-muted/30 rounded-lg text-left space-y-4">
                                <h3 className="font-semibold">Automation Settings</h3>
                                <p className="text-sm text-muted-foreground">You can configure these in Settings later.</p>
                                <div className="text-sm space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span>✅</span> <span>PubMed Auto-Update: Checks weekly for new papers</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span>✅</span> <span>Email Import: Forward emails to your unique address</span>
                                    </div>
                                </div>
                            </div>

                            <button onClick={() => { setWizardStep(0); window.location.href = '/cv'; }} className="btn-primary text-lg px-8 py-3">Go to My CV Dashboard</button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (wizardStep > 0) {
        return (
            <div className="min-h-screen bg-background">
                <Navbar user={navUser} />
                <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {renderWizardStep()}
                </main>
            </div>
        );
    }

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
                    {hasExistingEntries && !cvUploadExpanded ? (
                        // Collapsed view for users with existing CV
                        <>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-semibold">CV Uploaded ✓</h2>
                                    <p className="text-muted-foreground text-sm mt-1">
                                        Your CV has been imported. Click Reupload to replace with a new version.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setCvUploadExpanded(true)}
                                    className="btn-secondary"
                                >
                                    Reupload CV
                                </button>
                            </div>
                        </>
                    ) : (
                        // Full upload view for new users or when expanded
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold">
                                    {hasExistingEntries ? 'Reupload CV' : 'Import Existing CV'}
                                </h2>
                                {hasExistingEntries && (
                                    <button
                                        onClick={() => setCvUploadExpanded(false)}
                                        className="text-sm text-muted-foreground hover:text-foreground"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                            <p className="text-muted-foreground mb-4">
                                {hasExistingEntries
                                    ? 'Upload a new CV to add more entries. Existing entries will be preserved.'
                                    : 'Upload your existing CV (PDF or Word) and AI will automatically extract sections and entries.'}
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
                                    <div className="flex flex-col items-center py-8 text-foreground">
                                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500/30 border-t-primary-500 mb-4"></div>
                                        <h3 className="text-xl font-bold mb-1 text-foreground">{cvMessage}</h3>

                                        {cvChunkProgress && (
                                            <div className="w-full max-w-sm mt-4 px-4">
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="text-gray-600 dark:text-gray-300">Analyzing...</span>
                                                    <span className="font-medium text-primary-600 dark:text-primary-400">{cvChunkProgress.current}%</span>
                                                </div>
                                                <div className="h-2.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
                                                    <div className="h-full bg-gradient-to-r from-primary-600 to-primary-400 transition-all duration-500" style={{ width: `${cvChunkProgress.current}%` }} />
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-8 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-center max-w-md">
                                            <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-1">⏱️ Large CVs take ~1 min per page (15-20 min for full professors)</p>
                                            <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">Please stay on this page until complete</p>
                                        </div>
                                    </div>
                                ) : pasteMode ? (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="font-medium">Paste CV Section Text</h3>
                                            <button onClick={() => setPasteMode(false)} className="text-sm text-muted-foreground hover:text-foreground">
                                                ← Back to file upload
                                            </button>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Copy text from your CV (e.g., Education, Experience sections) and paste below. 
                                            <strong> Include the dates!</strong> For example: &quot;2018-2023&quot; or &quot;January 2020&quot;
                                        </p>
                                        <textarea
                                            value={pasteText}
                                            onChange={(e) => setPasteText(e.target.value)}
                                            placeholder="Paste your CV section here...&#10;&#10;Example:&#10;Education:&#10;Medical School: Case Western Reserve University&#10;Cleveland, OH&#10;Degree: M.D., 1999&#10;&#10;Residency: The George Washington University Hospital&#10;Washington, DC, 1999-2005"
                                            className="input w-full h-64 font-mono text-sm"
                                        />
                                        <div className="flex gap-3">
                                            <button
                                                onClick={uploadPastedText}
                                                disabled={!pasteText.trim() || pasteText.length < 50}
                                                className="btn-primary"
                                            >
                                                Import Pasted Text
                                            </button>
                                            <span className="text-sm text-muted-foreground self-center">
                                                {pasteText.length} characters
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <svg className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <p className="text-lg font-medium mb-1">Drop your CV here</p>
                                        <p className="text-muted-foreground text-sm mb-4">or click to browse</p>
                                        <div className="flex gap-3 justify-center">
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="btn-secondary"
                                            >
                                                Select File
                                            </button>
                                            <button
                                                onClick={() => setPasteMode(true)}
                                                className="btn-ghost border border-border"
                                            >
                                                📋 Paste Text
                                            </button>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-3">
                                            Supports PDF, Word, or paste specific sections
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
                        </>
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
                                disabled={dedupeRemoving || selectedToRemove.size === 0}
                                className="btn-primary"
                            >
                                {dedupeRemoving ? 'Removing...' : `Remove ${selectedToRemove.size} Selected`}
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
                        <div className="max-h-[600px] overflow-y-auto space-y-3">
                            {duplicateGroups.map((group, gi) => (
                                <div key={gi} className="p-3 rounded-lg bg-secondary/50">
                                    <p className="font-medium text-sm mb-2 line-clamp-1">{group.entries[0]?.title}</p>
                                    <div className="space-y-1">
                                        {group.entries.map((entry) => {
                                            const isSelected = selectedToRemove.has(entry.id);
                                            const isKeeper = entry.id === group.keepId;
                                            return (
                                                <label
                                                    key={entry.id}
                                                    className={`text-xs p-3 rounded cursor-pointer block ${isKeeper
                                                        ? 'bg-success/10 border border-success/30'
                                                        : isSelected
                                                            ? 'bg-destructive/10 border border-destructive/30'
                                                            : 'bg-secondary/50 border border-border'
                                                        }`}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        {!isKeeper && (
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => {
                                                                    const newSet = new Set(selectedToRemove);
                                                                    if (isSelected) {
                                                                        newSet.delete(entry.id);
                                                                    } else {
                                                                        newSet.add(entry.id);
                                                                    }
                                                                    setSelectedToRemove(newSet);
                                                                }}
                                                                className="mt-0.5 w-4 h-4 rounded"
                                                            />
                                                        )}
                                                        <div className="flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className={`font-medium ${isKeeper ? 'text-success' : isSelected ? 'text-destructive' : ''}`}>
                                                                    {isKeeper ? '✓ Keep' : isSelected ? '✗ Will Remove' : '○ Keeping'}
                                                                </span>
                                                                <span className="text-muted-foreground">|</span>
                                                                <span>{entry.categoryName}</span>
                                                                {entry.date && (
                                                                    <span className="text-muted-foreground font-medium">
                                                                        {new Date(entry.date).toLocaleDateString()}
                                                                    </span>
                                                                )}
                                                                {entry.hasPMID && <span className="text-primary-400">[PMID]</span>}
                                                                {entry.hasDOI && <span className="text-primary-400">[DOI]</span>}
                                                            </div>
                                                            {entry.description && (
                                                                <p className="text-muted-foreground mt-1 text-xs">
                                                                    {entry.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Entries Missing Dates Section */}
                <div className="card mb-8">
                    <h2 className="text-xl font-semibold mb-4">Entries Missing Dates</h2>
                    <p className="text-muted-foreground mb-4">
                        Some entries don&apos;t have dates. Add dates to keep your CV properly organized.
                    </p>

                    <div className="flex flex-wrap gap-3 mb-4">
                        <button
                            onClick={fetchMissingDates}
                            disabled={missingDatesLoading}
                            className="btn-secondary"
                        >
                            {missingDatesLoading ? 'Loading...' : 'Find Entries Without Dates'}
                        </button>
                        <button
                            onClick={autoFixDates}
                            disabled={autoFixingDates}
                            className="btn-primary"
                        >
                            {autoFixingDates ? 'Extracting Dates...' : '🔧 Auto-Extract Dates from Text'}
                        </button>
                    </div>

                    {autoFixResult && (
                        <div className="mb-4 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
                            ✅ Updated {autoFixResult.updated} entries with extracted dates
                            {autoFixResult.skipped > 0 && ` (${autoFixResult.skipped} already had dates)`}
                        </div>
                    )}

                    {missingDatesEntries.length > 0 && (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            <p className="text-sm text-muted-foreground">
                                Found {missingDatesEntries.length} entries without dates
                            </p>
                            {missingDatesEntries.map(entry => (
                                <div key={entry.id} className="p-3 rounded-lg bg-secondary/50 space-y-2">
                                    <p className="font-medium text-sm">{entry.title}</p>
                                    <p className="text-xs text-muted-foreground">{entry.categoryName}</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="date"
                                            value={dateEdits[entry.id] || ''}
                                            onChange={(e) => setDateEdits(prev => ({
                                                ...prev,
                                                [entry.id]: e.target.value
                                            }))}
                                            className="input text-sm px-2 py-1"
                                        />
                                        <button
                                            onClick={() => updateEntryDate(entry.id)}
                                            disabled={!dateEdits[entry.id]}
                                            className="btn-primary text-sm px-3 py-1"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* PMID Enrichment Section */}
                <div className="card mb-8">
                    <h2 className="text-xl font-semibold mb-4">Add PMIDs to Publications</h2>
                    <p className="text-muted-foreground mb-4">
                        Adding PubMed IDs to publications helps prevent duplicates when importing from PubMed.
                    </p>

                    <button
                        onClick={fetchPmidEntries}
                        disabled={pmidLoading}
                        className="btn-secondary mb-4"
                    >
                        {pmidLoading ? 'Scanning...' : 'Scan Publications'}
                    </button>

                    {pmidStats && (
                        <div className="text-sm text-muted-foreground mb-4">
                            <p>Total publications: <span className="font-medium text-foreground">{pmidStats.total}</span></p>
                            <p>With PMID: <span className="font-medium text-success">{pmidStats.withPmid}</span></p>
                            <p>Without PMID: <span className="font-medium text-warning">{pmidStats.withoutPmid}</span></p>
                        </div>
                    )}

                    {pmidEnrichMessage && (
                        <div className="p-3 rounded-lg bg-success/10 text-success text-sm mb-4">
                            {pmidEnrichMessage}
                        </div>
                    )}

                    {pmidEntries.length > 0 && (
                        <div className="space-y-3">
                            {/* Batch controls */}
                            <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-secondary/30">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedPmidEntries.size === pmidEntries.length && pmidEntries.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedPmidEntries(new Set(pmidEntries.map(e => e.id)));
                                            } else {
                                                setSelectedPmidEntries(new Set());
                                            }
                                        }}
                                        className="w-4 h-4 rounded"
                                    />
                                    <span className="text-sm">Select All ({pmidEntries.length})</span>
                                </label>
                                <button
                                    onClick={batchEnrichPmids}
                                    disabled={selectedPmidEntries.size === 0 || batchEnriching}
                                    className="btn-primary text-sm"
                                >
                                    {batchEnriching
                                        ? `Enriching... (${selectedPmidEntries.size})`
                                        : `Auto-Add PMIDs (${selectedPmidEntries.size} selected)`}
                                </button>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                Select entries and click &quot;Auto-Add PMIDs&quot; to find and apply PMIDs automatically.
                            </p>

                            {/* Entry list with checkboxes */}
                            <div className="max-h-[400px] overflow-y-auto space-y-2">
                                {pmidEntries.map(entry => (
                                    <label
                                        key={entry.id}
                                        className={`p-3 rounded-lg block cursor-pointer ${selectedPmidEntries.has(entry.id)
                                            ? 'bg-primary/10 border border-primary/30'
                                            : 'bg-secondary/50'
                                            }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedPmidEntries.has(entry.id)}
                                                onChange={(e) => {
                                                    const newSet = new Set(selectedPmidEntries);
                                                    if (e.target.checked) {
                                                        newSet.add(entry.id);
                                                    } else {
                                                        newSet.delete(entry.id);
                                                    }
                                                    setSelectedPmidEntries(newSet);
                                                }}
                                                className="mt-1 w-4 h-4 rounded"
                                            />
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">{entry.title}</p>
                                                <p className="text-xs text-muted-foreground">{entry.categoryName}</p>
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
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

                {/* Danger Zone */}
                <div className="card mt-8 border-destructive/50">
                    <h2 className="text-xl font-semibold mb-4 text-destructive">Danger Zone</h2>
                    <p className="text-muted-foreground mb-4">
                        Delete all your CV data including categories, entries, and pending items. This cannot be undone.
                    </p>

                    {!showResetConfirm ? (
                        <button
                            onClick={() => setShowResetConfirm(true)}
                            className="btn-secondary text-destructive border-destructive/50 hover:bg-destructive/10"
                        >
                            Delete All CV Data
                        </button>
                    ) : (
                        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
                            <p className="text-sm font-medium text-destructive">
                                Are you sure? This will delete ALL your CV data permanently.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={resetCV}
                                    disabled={cvResetting}
                                    className="btn-primary bg-destructive hover:bg-destructive/80"
                                >
                                    {cvResetting ? 'Deleting...' : 'Yes, Delete Everything'}
                                </button>
                                <button
                                    onClick={() => setShowResetConfirm(false)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
