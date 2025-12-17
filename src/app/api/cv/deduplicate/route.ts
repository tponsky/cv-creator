import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';

// Normalize title for comparison - aggressive normalization to catch variants
function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        .replace(/^(the|a|an)\s+/i, '') // Remove leading articles
        .replace(/[^\w\s]/g, '') // Remove ALL non-alphanumeric chars
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim()
        .slice(0, 150); // Truncate for comparison
}

// Extract DOI from text
function extractDOI(text: string): string | null {
    if (!text) return null;
    const match = text.match(/10\.\d{4,}\/[^\s"'<>]+/i);
    return match ? match[0].toLowerCase() : null;
}

interface DuplicateGroup {
    normalizedTitle: string;
    entries: {
        id: string;
        title: string;
        description: string | null;
        categoryName: string;
        sourceType: string | null;
        hasPMID: boolean;
        hasDOI: boolean;
        createdAt: string;
    }[];
    keepId: string; // ID of entry to keep
}

/**
 * GET /api/cv/deduplicate
 * Scan CV for duplicate entries and return grouped duplicates
 */
export async function GET(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Get user's CV with all entries
        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
            include: {
                categories: {
                    include: {
                        entries: {
                            select: {
                                id: true,
                                title: true,
                                description: true,
                                sourceType: true,
                                sourceData: true,
                                createdAt: true,
                            }
                        }
                    }
                }
            }
        });

        if (!cv) {
            return NextResponse.json({
                duplicateGroups: [],
                totalEntries: 0,
                duplicateCount: 0
            });
        }

        // Flatten all entries with category info
        const allEntries: {
            id: string;
            title: string;
            description: string | null;
            categoryName: string;
            sourceType: string | null;
            sourceData: unknown;
            createdAt: Date;
        }[] = [];

        for (const cat of cv.categories) {
            for (const entry of cat.entries) {
                allEntries.push({
                    ...entry,
                    categoryName: cat.name,
                });
            }
        }

        // Group by normalized title
        const titleGroups = new Map<string, typeof allEntries>();

        for (const entry of allEntries) {
            const normalized = normalizeTitle(entry.title);
            if (!titleGroups.has(normalized)) {
                titleGroups.set(normalized, []);
            }
            titleGroups.get(normalized)!.push(entry);
        }

        // Build duplicate groups (only groups with 2+ entries)
        const duplicateGroups: DuplicateGroup[] = [];
        let duplicateCount = 0;

        // Use Array.from to iterate while being explicit about types
        const groupEntries = Array.from(titleGroups.entries());

        for (const [normalizedTitle, entries] of groupEntries) {
            if (entries.length > 1) {
                // Determine which entry to keep:
                // Priority: 1) Has PMID, 2) Has DOI, 3) Most complete description, 4) Most recent
                const scoredEntries = entries.map((e: typeof allEntries[number]) => {
                    let hasPMID = false;
                    let hasDOI = false;

                    try {
                        const data = typeof e.sourceData === 'object'
                            ? e.sourceData
                            : JSON.parse(String(e.sourceData) || '{}');
                        hasPMID = !!(data as Record<string, unknown>)?.pmid;
                        hasDOI = !!(data as Record<string, unknown>)?.doi;
                    } catch {
                        // Check description for DOI
                        hasDOI = !!extractDOI(e.description || '');
                    }

                    const score = (hasPMID ? 100 : 0) + (hasDOI ? 50 : 0) + (e.description?.length || 0) / 100;

                    return {
                        entry: e,
                        hasPMID,
                        hasDOI,
                        score,
                    };
                });

                // Sort by score descending - highest score is the keeper
                type ScoredEntry = { entry: typeof allEntries[number]; hasPMID: boolean; hasDOI: boolean; score: number };
                scoredEntries.sort((a: ScoredEntry, b: ScoredEntry) => b.score - a.score);
                const keepId = scoredEntries[0].entry.id;

                duplicateGroups.push({
                    normalizedTitle,
                    entries: scoredEntries.map((se: ScoredEntry) => ({
                        id: se.entry.id,
                        title: se.entry.title,
                        description: se.entry.description,
                        categoryName: se.entry.categoryName,
                        sourceType: se.entry.sourceType,
                        hasPMID: se.hasPMID,
                        hasDOI: se.hasDOI,
                        createdAt: se.entry.createdAt.toISOString(),
                    })),
                    keepId,
                });

                duplicateCount += entries.length - 1; // Count extras to remove
            }
        }

        // Sort by number of duplicates descending
        duplicateGroups.sort((a, b) => b.entries.length - a.entries.length);

        return NextResponse.json({
            duplicateGroups,
            totalEntries: allEntries.length,
            duplicateCount,
            afterCleanup: allEntries.length - duplicateCount,
        });

    } catch (error) {
        console.error('Deduplication scan error:', error);
        return NextResponse.json(
            { error: 'Failed to scan for duplicates' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/cv/deduplicate
 * Execute deduplication - remove duplicate entries
 */
export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { entriesToDelete } = body;

        if (!entriesToDelete || !Array.isArray(entriesToDelete) || entriesToDelete.length === 0) {
            return NextResponse.json(
                { error: 'No entries specified for deletion' },
                { status: 400 }
            );
        }

        // Verify all entries belong to this user before deleting
        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
            include: {
                categories: {
                    include: {
                        entries: {
                            where: { id: { in: entriesToDelete } },
                            select: { id: true }
                        }
                    }
                }
            }
        });

        if (!cv) {
            return NextResponse.json({ error: 'CV not found' }, { status: 404 });
        }

        // Collect valid entry IDs (those that actually belong to user)
        const validIds: string[] = [];
        for (const cat of cv.categories) {
            for (const entry of cat.entries) {
                validIds.push(entry.id);
            }
        }

        if (validIds.length === 0) {
            return NextResponse.json(
                { error: 'No valid entries found to delete' },
                { status: 400 }
            );
        }

        // Delete the duplicate entries
        const result = await prisma.entry.deleteMany({
            where: { id: { in: validIds } }
        });

        return NextResponse.json({
            success: true,
            deletedCount: result.count,
            message: `Removed ${result.count} duplicate entries`,
        });

    } catch (error) {
        console.error('Deduplication execution error:', error);
        return NextResponse.json(
            { error: 'Failed to remove duplicates' },
            { status: 500 }
        );
    }
}
