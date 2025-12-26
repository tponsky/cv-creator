/**
 * PubMed API Integration
 * Uses NCBI E-utilities to search and fetch publication data
 * https://www.ncbi.nlm.nih.gov/books/NBK25500/
 */

const PUBMED_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// NCBI API key (optional but recommended for higher rate limits)
// Without key: 3 requests/second, With key: 10 requests/second
const NCBI_API_KEY = process.env.NCBI_API_KEY || '';

export interface PubMedArticle {
    pmid: string;
    title: string;
    authors: string[];
    journal: string;
    pubDate: string;
    doi: string | null;
    abstract: string | null;
}

export interface PubMedSearchResult {
    count: number;
    articles: PubMedArticle[];
}

/**
 * Fetch with retry and exponential backoff for rate limiting
 */
async function fetchWithRetry(url: string, maxRetries: number = 3): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url);
            
            // If rate limited (429 or 503), wait and retry
            if (response.status === 429 || response.status === 503) {
                const waitTime = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
                console.log(`PubMed rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }
            
            if (!response.ok) {
                throw new Error(`Request failed: ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                const waitTime = Math.pow(2, attempt + 1) * 1000;
                console.log(`PubMed request failed, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }
    
    throw lastError || new Error('Max retries exceeded');
}

/**
 * Clean title for better PubMed searching
 * Removes problematic characters and normalizes text
 */
function cleanTitleForSearch(title: string): string {
    return title
        // Remove author names in parentheses or after "with"
        .replace(/\s+with\s+[A-Z][a-z]+\s+[A-Z]\.?\s+[A-Z][a-z]+.*/i, '')
        // Remove content after colon (subtitles often cause issues)
        .replace(/:\s*.{20,}$/, '')
        // Remove special characters that break search
        .replace(/['"''""]/g, '')
        .replace(/[-–—]/g, ' ')
        // Remove ordinal suffixes (25th, 1st, etc.)
        .replace(/(\d+)(st|nd|rd|th)\b/gi, '$1')
        // Remove common noise words at start
        .replace(/^(The|A|An)\s+/i, '')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract key search words from title
 * Returns first N significant words
 */
function extractKeyWords(title: string, count: number = 6): string {
    const stopWords = new Set(['the', 'a', 'an', 'of', 'in', 'for', 'on', 'to', 'with', 'and', 'or', 'at', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'using', 'based']);
    const words = title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));
    return words.slice(0, count).join(' ');
}

/**
 * Search PubMed for articles by author name or title
 * Uses multiple fallback strategies for title searches
 */
export async function searchPubMed(
    query: string,
    maxResults: number = 100,
    searchType: 'author' | 'title' | 'all' = 'author'
): Promise<string[]> {
    // Format query for PubMed search
    let term = query.trim();
    
    if (searchType === 'author') {
        term = `${term}[Author]`;
    } else if (searchType === 'title') {
        // Try multiple search strategies for titles
        const strategies = [
            // Strategy 1: Clean title with [Title] field
            `${cleanTitleForSearch(query)}[Title]`,
            // Strategy 2: First 50 chars of cleaned title
            `${cleanTitleForSearch(query).substring(0, 50)}[Title]`,
            // Strategy 3: Key words as phrase (no [Title] restriction)
            `"${extractKeyWords(query, 5)}"`,
            // Strategy 4: Key words without quotes (broader)
            extractKeyWords(query, 4),
        ];
        
        for (const strategy of strategies) {
            let searchUrl = `${PUBMED_BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(strategy)}&retmax=${maxResults}&retmode=json`;
            if (NCBI_API_KEY) {
                searchUrl += `&api_key=${NCBI_API_KEY}`;
            }
            
            try {
                const response = await fetchWithRetry(searchUrl);
                const data = await response.json();
                const ids = data.esearchresult?.idlist || [];
                
                // If we found 1-10 results, that's a good match
                if (ids.length > 0 && ids.length <= 10) {
                    console.log(`[PubMed] Found ${ids.length} results with strategy: ${strategy.substring(0, 50)}...`);
                    return ids;
                }
                
                // If we found exactly 1, that's perfect
                if (ids.length === 1) {
                    return ids;
                }
            } catch (e) {
                console.warn(`[PubMed] Strategy failed: ${strategy.substring(0, 30)}...`, e);
            }
        }
        
        // Last resort: return whatever the first strategy found
        term = `${cleanTitleForSearch(query)}[Title]`;
    }

    let searchUrl = `${PUBMED_BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=${maxResults}&retmode=json`;
    if (NCBI_API_KEY) {
        searchUrl += `&api_key=${NCBI_API_KEY}`;
    }

    const response = await fetchWithRetry(searchUrl);
    const data = await response.json();
    return data.esearchresult?.idlist || [];
}

/**
 * Fetch article details by PMIDs
 */
export async function fetchArticleDetails(pmids: string[]): Promise<PubMedArticle[]> {
    if (pmids.length === 0) return [];

    let fetchUrl = `${PUBMED_BASE_URL}/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
    if (NCBI_API_KEY) {
        fetchUrl += `&api_key=${NCBI_API_KEY}`;
    }

    const response = await fetchWithRetry(fetchUrl);
    const xmlText = await response.text();
    return parseArticlesFromXml(xmlText);
}

/**
 * Parse PubMed XML response into article objects
 */
function parseArticlesFromXml(xml: string): PubMedArticle[] {
    const articles: PubMedArticle[] = [];

    // Extract each PubmedArticle block
    const articleMatches = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

    for (const articleXml of articleMatches) {
        try {
            const article = parseArticle(articleXml);
            if (article) {
                articles.push(article);
            }
        } catch (e) {
            console.error('Failed to parse article:', e);
        }
    }

    return articles;
}

function parseArticle(xml: string): PubMedArticle | null {
    // Extract PMID
    const pmidMatch = xml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    if (!pmidMatch) return null;

    // Extract title
    const titleMatch = xml.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
    const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : 'Unknown Title';

    // Extract authors
    const authors: string[] = [];
    const authorRegex = /<Author[^>]*>[\s\S]*?<LastName>([^<]+)<\/LastName>[\s\S]*?<ForeName>([^<]*)<\/ForeName>[\s\S]*?<\/Author>/g;
    let authorMatch;
    while ((authorMatch = authorRegex.exec(xml)) !== null) {
        authors.push(`${authorMatch[1]} ${authorMatch[2]}`.trim());
    }

    // Extract journal
    const journalMatch = xml.match(/<Title>([^<]+)<\/Title>/);
    const journal = journalMatch ? decodeXmlEntities(journalMatch[1]) : 'Unknown Journal';

    // Extract publication date
    const yearMatch = xml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
    const monthMatch = xml.match(/<PubDate>[\s\S]*?<Month>([^<]+)<\/Month>/);
    const pubDate = yearMatch
        ? `${yearMatch[1]}${monthMatch ? `-${monthMatch[1]}` : ''}`
        : 'Unknown';

    // Extract DOI
    const doiMatch = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
    const doi = doiMatch ? doiMatch[1] : null;

    // Extract abstract
    const abstractMatch = xml.match(/<AbstractText[^>]*>([^<]+)<\/AbstractText>/);
    const abstract = abstractMatch ? decodeXmlEntities(abstractMatch[1]) : null;

    return {
        pmid: pmidMatch[1],
        title,
        authors,
        journal,
        pubDate,
        doi,
        abstract,
    };
}

function decodeXmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

/**
 * Calculate similarity score between two titles (0-1)
 * Uses word overlap method
 */
function calculateTitleSimilarity(title1: string, title2: string): number {
    const normalize = (s: string) => s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
    
    const words1 = new Set(normalize(title1));
    const words2 = new Set(normalize(title2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    let overlap = 0;
    Array.from(words1).forEach(word => {
        if (words2.has(word)) overlap++;
    });
    
    // Jaccard-like similarity
    const union = new Set([...Array.from(words1), ...Array.from(words2)]).size;
    return overlap / union;
}

/**
 * Full search and fetch - returns complete article data
 * For title searches, filters results by similarity score
 */
export async function searchAndFetchArticles(
    query: string,
    maxResults: number = 100,
    searchType: 'author' | 'title' | 'all' = 'author'
): Promise<PubMedSearchResult> {
    const pmids = await searchPubMed(query, maxResults, searchType);
    const articles = await fetchArticleDetails(pmids);

    // For title searches, filter and sort by similarity
    if (searchType === 'title' && articles.length > 0) {
        const scoredArticles = articles.map(article => ({
            article,
            similarity: calculateTitleSimilarity(query, article.title),
        }));
        
        // Filter articles with at least 25% word overlap (lowered from 40%)
        // Academic titles vary a lot - be more permissive
        const matchingArticles = scoredArticles
            .filter(sa => sa.similarity >= 0.25)
            .sort((a, b) => b.similarity - a.similarity)
            .map(sa => sa.article);
        
        console.log(`[PubMed] Title search for "${query.substring(0, 40)}..." found ${articles.length} articles, ${matchingArticles.length} matched with >25% similarity`);
        
        return {
            count: matchingArticles.length,
            articles: matchingArticles,
        };
    }

    return {
        count: articles.length,
        articles,
    };
}

/**
 * Convert PubMed article to CV entry format
 */
export function articleToCVEntry(article: PubMedArticle) {
    const authorList = article.authors.length > 3
        ? `${article.authors.slice(0, 3).join(', ')}, et al.`
        : article.authors.join(', ');

    return {
        title: article.title,
        description: `${authorList}. ${article.journal}. ${article.pubDate}.${article.doi ? ` DOI: ${article.doi}` : ''}`,
        date: parsePublicationDate(article.pubDate),
        url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
        sourceType: 'pubmed',
        sourceData: JSON.stringify({ pmid: article.pmid, doi: article.doi }),
    };
}

function parsePublicationDate(pubDate: string): Date | null {
    if (!pubDate || pubDate === 'Unknown') return null;

    // Handle "2024" or "2024-Jan" formats
    const parts = pubDate.split('-');
    const year = parseInt(parts[0]);
    if (isNaN(year)) return null;

    const monthMap: Record<string, number> = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
    };

    const month = parts[1] ? (monthMap[parts[1]] ?? 0) : 0;
    return new Date(year, month, 1);
}
