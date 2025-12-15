import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendPubMedNotification } from '@/lib/email-notifications';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// PubMed API base URLs
const PUBMED_SEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_FETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

interface PubMedArticle {
    pmid: string;
    title: string;
    authors: string[];
    journal: string;
    pubDate: string;
    abstract?: string;
}

/**
 * POST /api/cron/pubmed
 * Cron job endpoint to check PubMed for new publications
 * This should be called by a scheduler (Vercel Cron, external cron, etc.)
 * 
 * Security: Add a secret header check in production
 */
export async function POST(request: NextRequest) {
    try {
        // Optional: Verify cron secret
        const cronSecret = request.headers.get('x-cron-secret');
        if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all users with PubMed auto-update enabled
        const usersWithPubMed = await prisma.userPreferences.findMany({
            where: {
                pubmedEnabled: true,
                pubmedAuthorName: { not: null },
            },
            include: {
                user: true,
            },
        });

        console.log(`Found ${usersWithPubMed.length} users with PubMed enabled`);

        const results = [];

        for (const prefs of usersWithPubMed) {
            // Check if it's time to run based on frequency
            if (!shouldRunCheck(prefs.pubmedLastChecked, prefs.pubmedFrequency)) {
                continue;
            }

            const authorName = prefs.pubmedAuthorName!;
            console.log(`Checking PubMed for: ${authorName}`);

            try {
                // Search PubMed
                const articles = await searchPubMed(authorName);
                console.log(`Found ${articles.length} articles for ${authorName}`);

                // Get existing PMIDs to avoid duplicates
                const existingPmids = await getExistingPmids(prefs.userId);

                // Filter to only new articles
                const newArticles = articles.filter(a => !existingPmids.has(a.pmid));
                console.log(`${newArticles.length} new articles after deduplication`);

                if (newArticles.length > 0) {
                    // Create pending entries
                    await Promise.all(
                        newArticles.map(article =>
                            prisma.pendingEntry.create({
                                data: {
                                    userId: prefs.userId,
                                    title: article.title,
                                    description: `${article.authors.slice(0, 3).join(', ')}${article.authors.length > 3 ? ' et al.' : ''}. ${article.journal}. ${article.pubDate}`,
                                    date: parsePublicationDate(article.pubDate),
                                    sourceType: 'pubmed',
                                    sourceData: {
                                        pmid: article.pmid,
                                        journal: article.journal,
                                        authors: article.authors,
                                        abstract: article.abstract,
                                        autoImport: true,
                                    },
                                    suggestedCategory: 'Publications',
                                    aiConfidence: 0.95,
                                    aiReasoning: 'Automatically found via PubMed author search',
                                    status: 'pending',
                                },
                            })
                        )
                    );

                    // Log activity
                    await prisma.activity.create({
                        data: {
                            userId: prefs.userId,
                            type: 'pubmed_import',
                            title: `${newArticles.length} new ${newArticles.length === 1 ? 'publication' : 'publications'} found`,
                            description: `Automated PubMed check for "${authorName}"`,
                            metadata: {
                                authorName,
                                count: newArticles.length,
                                pmids: newArticles.map(a => a.pmid),
                            },
                        },
                    });

                    // Send email notification if enabled
                    if (prefs.pubmedNotifyEmail && prefs.user.email) {
                        await sendPubMedNotification(prefs.user.email, newArticles.length);
                    }
                }

                // Update last checked timestamp
                await prisma.userPreferences.update({
                    where: { id: prefs.id },
                    data: { pubmedLastChecked: new Date() },
                });

                results.push({
                    userId: prefs.userId,
                    authorName,
                    found: articles.length,
                    new: newArticles.length,
                    status: 'success',
                });
            } catch (error) {
                console.error(`Error checking PubMed for ${authorName}:`, error);
                results.push({
                    userId: prefs.userId,
                    authorName,
                    status: 'error',
                    error: String(error),
                });
            }
        }

        return NextResponse.json({
            success: true,
            usersChecked: results.length,
            results,
        });
    } catch (error) {
        console.error('PubMed cron error:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
}

// Check if we should run based on frequency setting
function shouldRunCheck(lastChecked: Date | null, frequency: string): boolean {
    if (!lastChecked) return true;

    const now = new Date();
    const hoursSinceCheck = (now.getTime() - lastChecked.getTime()) / (1000 * 60 * 60);

    switch (frequency) {
        case 'daily':
            return hoursSinceCheck >= 24;
        case 'weekly':
            return hoursSinceCheck >= 24 * 7;
        case 'monthly':
            return hoursSinceCheck >= 24 * 30;
        default:
            return hoursSinceCheck >= 24 * 7; // Default to weekly
    }
}

// Get existing PMIDs for a user
async function getExistingPmids(userId: string): Promise<Set<string>> {
    const pmids = new Set<string>();

    // Check pending entries
    const pendingEntries = await prisma.pendingEntry.findMany({
        where: { userId, sourceType: 'pubmed' },
        select: { sourceData: true },
    });

    // Check approved entries
    const approvedEntries = await prisma.entry.findMany({
        where: {
            category: {
                cv: { userId },
            },
            sourceType: 'pubmed',
        },
        select: { sourceData: true },
    });

    for (const entry of [...pendingEntries, ...approvedEntries]) {
        const sourceData = entry.sourceData as { pmid?: string } | null;
        if (sourceData?.pmid) {
            pmids.add(sourceData.pmid);
        }
    }

    return pmids;
}

// Search PubMed for articles by author name
async function searchPubMed(authorName: string): Promise<PubMedArticle[]> {
    // Search for articles
    const searchParams = new URLSearchParams({
        db: 'pubmed',
        term: `${authorName}[Author]`,
        retmax: '50',
        retmode: 'json',
        sort: 'pub_date',
    });

    const searchResponse = await fetch(`${PUBMED_SEARCH_URL}?${searchParams}`);
    const searchData = await searchResponse.json();

    const pmids = searchData.esearchresult?.idlist || [];
    if (pmids.length === 0) return [];

    // Fetch article details
    const fetchParams = new URLSearchParams({
        db: 'pubmed',
        id: pmids.join(','),
        retmode: 'xml',
    });

    const fetchResponse = await fetch(`${PUBMED_FETCH_URL}?${fetchParams}`);
    const xmlText = await fetchResponse.text();

    // Parse XML (simplified parsing)
    return parseArticlesFromXml(xmlText);
}

// Parse articles from PubMed XML response
function parseArticlesFromXml(xml: string): PubMedArticle[] {
    const articles: PubMedArticle[] = [];

    // Simple regex-based parsing (for robustness, consider using an XML parser)
    const articleMatches = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

    for (const articleXml of articleMatches) {
        try {
            const pmid = extractTag(articleXml, 'PMID') || '';
            const title = extractTag(articleXml, 'ArticleTitle') || 'Untitled';
            const journal = extractTag(articleXml, 'Title') || extractTag(articleXml, 'ISOAbbreviation') || '';
            const abstract = extractTag(articleXml, 'AbstractText') || '';

            // Extract authors
            const authors: string[] = [];
            const authorMatches = articleXml.match(/<Author[\s\S]*?<\/Author>/g) || [];
            for (const authorXml of authorMatches.slice(0, 10)) {
                const lastName = extractTag(authorXml, 'LastName') || '';
                const foreName = extractTag(authorXml, 'ForeName') || '';
                const initials = extractTag(authorXml, 'Initials') || '';
                if (lastName) {
                    authors.push(`${lastName} ${initials || foreName}`.trim());
                }
            }

            // Extract publication date
            const year = extractTag(articleXml, 'Year') || '';
            const month = extractTag(articleXml, 'Month') || '';
            const pubDate = `${year}${month ? ` ${month}` : ''}`;

            if (pmid && title) {
                articles.push({
                    pmid,
                    title: cleanHtmlTags(title),
                    authors,
                    journal,
                    pubDate,
                    abstract: cleanHtmlTags(abstract),
                });
            }
        } catch (e) {
            console.error('Error parsing article:', e);
        }
    }

    return articles;
}

// Extract text from XML tag
function extractTag(xml: string, tagName: string): string | null {
    const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
    return match ? match[1].trim() : null;
}

// Clean HTML tags from text
function cleanHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '').trim();
}

// Parse publication date string to Date
function parsePublicationDate(pubDate: string): Date | null {
    try {
        const parts = pubDate.split(' ');
        const year = parseInt(parts[0], 10);
        if (isNaN(year)) return null;
        return new Date(year, 0, 1); // January 1st of that year
    } catch {
        return null;
    }
}

/**
 * GET /api/cron/pubmed
 * Manual trigger for testing
 */
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        message: 'PubMed cron endpoint. POST to trigger check.',
    });
}
