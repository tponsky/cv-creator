import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/server-auth';
import { searchAndFetchArticles } from '@/lib/pubmed-api';

/**
 * GET /api/cv/enrich-pmid
 * Get publications that could be enriched with PMID
 */
export async function GET(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
            include: {
                categories: {
                    where: {
                        name: {
                            in: ['Publications', 'Peer-Reviewed Publications', 'Journal Articles',
                                'Book Chapters', 'Articles', 'Original Research']
                        }
                    },
                    include: {
                        entries: {
                            orderBy: { displayOrder: 'asc' },
                            select: {
                                id: true,
                                title: true,
                                description: true,
                                sourceData: true,
                            },
                        },
                    },
                },
            },
        });

        if (!cv) {
            return NextResponse.json({ entries: [], total: 0, withPmid: 0, withoutPmid: 0 });
        }

        // Collect entries and check for PMID
        const entriesWithStatus = cv.categories.flatMap(cat =>
            cat.entries.map(entry => {
                let hasPMID = false;
                try {
                    const data = typeof entry.sourceData === 'object'
                        ? entry.sourceData as Record<string, unknown>
                        : JSON.parse(String(entry.sourceData) || '{}');
                    hasPMID = !!data?.pmid;
                } catch {
                    hasPMID = false;
                }

                return {
                    id: entry.id,
                    title: entry.title,
                    description: entry.description,
                    categoryId: cat.id,
                    categoryName: cat.name,
                    hasPMID,
                };
            })
        );

        const withPmid = entriesWithStatus.filter(e => e.hasPMID).length;
        const withoutPmid = entriesWithStatus.filter(e => !e.hasPMID).length;

        return NextResponse.json({
            entries: entriesWithStatus.filter(e => !e.hasPMID),
            total: entriesWithStatus.length,
            withPmid,
            withoutPmid,
        });
    } catch (error) {
        console.error('Enrich PMID API error:', error);
        return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
    }
}

/**
 * POST /api/cv/enrich-pmid
 * Search PubMed and update entry with found PMID
 */
export async function POST(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { entryId, pmid, doi } = await request.json();

        if (!entryId) {
            return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
        }

        // Verify ownership
        const entry = await prisma.entry.findFirst({
            where: {
                id: entryId,
                category: { cv: { userId: user.id } },
            },
        });

        if (!entry) {
            return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
        }

        // Update sourceData with PMID
        let currentData: Record<string, unknown> = {};
        try {
            currentData = typeof entry.sourceData === 'object' && entry.sourceData !== null
                ? entry.sourceData as Record<string, unknown>
                : JSON.parse(String(entry.sourceData) || '{}');
        } catch {
            currentData = {};
        }

        const newSourceData = {
            ...currentData,
            pmid: pmid || currentData.pmid,
            doi: doi || currentData.doi,
        };

        const updated = await prisma.entry.update({
            where: { id: entryId },
            data: {
                sourceData: newSourceData,
                sourceType: 'pubmed',  // Mark as PubMed source
            },
        });

        return NextResponse.json({
            success: true,
            entry: { id: updated.id, pmid, doi },
        });
    } catch (error) {
        console.error('Update PMID error:', error);
        return NextResponse.json({ error: 'Failed to update PMID' }, { status: 500 });
    }
}

/**
 * PUT /api/cv/enrich-pmid
 * Search PubMed by title to find matching PMID
 */
export async function PUT(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { title } = await request.json();

        if (!title) {
            return NextResponse.json({ error: 'title is required' }, { status: 400 });
        }

        // Search PubMed by title
        const searchResult = await searchAndFetchArticles(title, 5);

        return NextResponse.json({
            results: searchResult.articles.map(r => ({
                pmid: r.pmid,
                title: r.title,
                doi: r.doi,
                journal: r.journal,
                pubDate: r.pubDate,
                authors: r.authors.slice(0, 3).join(', ') + (r.authors.length > 3 ? ' et al.' : ''),
            })),
        });
    } catch (error) {
        console.error('Search PMID error:', error);
        return NextResponse.json({ error: 'Failed to search PubMed' }, { status: 500 });
    }
}
