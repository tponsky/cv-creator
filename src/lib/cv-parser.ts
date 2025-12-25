/**
 * CV Parser
 * Uses pdf-parse/mammoth for text extraction and OpenAI GPT-4 for parsing
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// For very long CVs, process in chunks to avoid response truncation
export const CHUNK_SIZE = 30000; // Stabilized at 30k for high-tier models

export interface ParsedCategory {
    name: string;
    entries: ParsedEntry[];
}

export interface ParsedEntry {
    title: string;
    description: string | null;
    date: string | null;
    location: string | null;
    url: string | null;
}

export interface ParsedProfile {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    institution: string | null;
    website: string | null;
}

export interface ParsedCV {
    profile: ParsedProfile;
    categories: ParsedCategory[];
    rawText: string;
}

export const SYSTEM_PROMPT = `You are an expert CV parser. Your job is to analyze CV/resume text and extract it into structured data.

FIRST, extract the person's contact/profile information from the header:
- name: Full name of the person
- email: Email address if present
- phone: Phone number if present
- address: Mailing address or location if present
- institution: Current university/hospital/company affiliation
- website: Personal website or portfolio URL if present

Then, for each section you find (like Publications, Presentations, Awards, Grants, Education, Experience, etc.), extract:
1. The category name (section header)
2. All entries within that section

For each entry, extract:
- title: The main title/name of the item
- description: Any additional details, authors, journal names, etc.
- date: CRITICAL - Extract ANY date/year mentioned. Look for: ISO format (YYYY-MM-DD, YYYY-MM, or YYYY). ALWAYS try to find a date - most CV entries have years.
- location: Location if relevant
- url: Any URL or DOI if present

Return your response as a JSON object with this structure:
{
  "profile": { "name": "...", "email": "...", "phone": "...", "address": "...", "institution": "...", "website": "..." },
  "categories": [
    {
      "name": "Publications",
      "entries": [
        { "title": "...", "description": "...", "date": "...", "location": "...", "url": "..." }
      ]
    }
  ]
}

Parse ALL entries thoroughly. Do not summarize or skip any items. Your response must be a complete and valid JSON object.`;

export async function parseCV(text: string): Promise<ParsedCV> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key is required. Please configure OPENAI_API_KEY in your environment.');
    }

    if (text.length <= CHUNK_SIZE) {
        // Short CV - process in one go
        return parseCVChunk(text);
    }

    // Long CV - split by section headers and process in chunks
    console.log(`Long CV detected (${text.length} chars), processing in chunks...`);

    // Try to split by common section headers
    const sectionPatterns = [
        /\n(?=(?:PUBLICATIONS?|PEER[- ]?REVIEWED|PRESENTATIONS?|GRANTS?|AWARDS?|EDUCATION|EXPERIENCE|TEACHING|MENTORING|SERVICE|LEADERSHIP|PROFESSIONAL|EDITORIAL|COMMITTEE|TRAINING|RESEARCH|CLINICAL|ACADEMIC|HONORS?|PATENTS?|BOOKS?|CHAPTERS?|INVITED|CONFERENCES?|APPOINTMENTS?)\s*[:\n])/gi
    ];

    let sections: string[] = [text];
    // sections is already declared above
    try {
        for (const pattern of sectionPatterns) {
            const newSections: string[] = [];
            for (const section of sections) {
                // Limit section length for regex to prevent potential catastrophic backtracking or size limits
                if (section.length > 500000) {
                    console.warn('Section too large for regex split, keeping as is');
                    newSections.push(section);
                    continue;
                }
                const parts = section.split(pattern);
                newSections.push(...parts);
            }
            if (newSections.length > 1) {
                sections = newSections;
                break;
            }
        }
    } catch (e) {
        console.error('Error splitting CV sections:', e);
        // Fallback: treat as single section if split fails
        sections = [text];
    }

    // Combine small sections, split large ones
    const chunks: string[] = [];
    let currentChunk = '';

    for (const section of sections) {
        if (currentChunk.length + section.length < CHUNK_SIZE) {
            currentChunk += section;
        } else {
            if (currentChunk) chunks.push(currentChunk);
            // If single section is too large, split it
            if (section.length > CHUNK_SIZE) {
                const subChunks = splitLargeText(section, CHUNK_SIZE);
                chunks.push(...subChunks);
            } else {
                currentChunk = section;
            }
        }
    }
    if (currentChunk) chunks.push(currentChunk);

    console.log(`Split CV into ${chunks.length} chunks`);

    // Process all chunks SEQUENTIALLY to prevent 502 Proxy Errors/timeouts
    console.log(`Processing ${chunks.length} chunks sequentially...`);

    const results: ParsedCV[] = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing chunk ${i + 1} of ${chunks.length}...`);
        try {
            const result = await parseCVChunk(chunks[i]);
            results.push(result);
        } catch (error) {
            console.error(`Error processing chunk ${i + 1}:`, error);
            results.push({
                profile: { name: null, email: null, phone: null, address: null, institution: null, website: null },
                categories: [],
                rawText: chunks[i]
            });
        }
    }

    // Merge all results
    const allCategories: ParsedCategory[] = [];
    for (const result of results) {
        for (const cat of result.categories) {
            const existing = allCategories.find(c =>
                c.name.toLowerCase() === cat.name.toLowerCase()
            );
            if (existing) {
                existing.entries.push(...cat.entries);
            } else {
                allCategories.push(cat);
            }
        }
    }

    console.log(`Merged ${allCategories.length} categories from ${chunks.length} chunks`);

    // Use the first profile found (usually from the first chunk which has the header)
    const profile = results.find(r => r.profile?.name)?.profile || { name: null, email: null, phone: null, address: null, institution: null, website: null };

    return {
        profile,
        categories: allCategories,
        rawText: text,
    };
}

// Helper function to split large text
export function splitLargeText(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        // Try to split at a line break
        let end = start + maxSize;
        if (end < text.length) {
            const lastNewline = text.lastIndexOf('\n', end);
            if (lastNewline > start) end = lastNewline;
        }
        chunks.push(text.slice(start, end));
        start = end;
    }
    return chunks;
}

// SIMPLIFIED: Parse a single chunk using ONLY OpenAI (most reliable)
export async function parseCVChunk(text: string, attempt: number = 1): Promise<ParsedCV> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key is required. Please configure OPENAI_API_KEY in your environment.');
    }

    // If text is too large, split it further (recursively)
    if (text.length > 15000 && attempt < 3) {
        console.log(`[Parser] Text too large (${text.length} chars), splitting further (attempt ${attempt})`);
        const chunks = splitLargeText(text, 12000); // Smaller chunks for reliability
        const results: ParsedCV[] = [];
        
        for (let i = 0; i < chunks.length; i++) {
            try {
                const result = await parseCVChunk(chunks[i], attempt + 1);
                results.push(result);
            } catch (error) {
                console.warn(`[Parser] Chunk ${i + 1}/${chunks.length} failed:`, error instanceof Error ? error.message : String(error));
                // Continue with other chunks - don't fail completely
            }
        }
        
        // Merge results
        if (results.length > 0) {
            const merged: ParsedCV = {
                profile: results.find(r => r.profile?.name)?.profile || { name: null, email: null, phone: null, address: null, institution: null, website: null },
                categories: [],
                rawText: text
            };
            
            for (const result of results) {
                merged.categories.push(...result.categories);
            }
            
            return merged;
        } else {
            throw new Error('All chunks failed to parse');
        }
    }

    // Limit text to 15k chars for API
    const textToParse = text.length > 15000 ? text.substring(0, 15000) : text;
    const userPrompt = `Extract CV entries from this text. Return JSON only:

${textToParse}`;

    try {
        console.log(`[Parser] Parsing ${textToParse.length} chars with OpenAI...`);
        return await parseWithOpenAI(userPrompt, text);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Parser] OpenAI failed: ${errorMessage}`);
        
        // If it's a size issue and we haven't split yet, try splitting
        if ((errorMessage.includes('token') || errorMessage.includes('length') || errorMessage.includes('too large')) && attempt === 1 && text.length > 10000) {
            console.log('[Parser] Retrying with smaller chunks due to size error...');
            return parseCVChunk(text, attempt + 1);
        }
        
        throw new Error(`Failed to parse CV: ${errorMessage}`);
    }
}

// SIMPLIFIED: Use OpenAI with structured output (most reliable)
async function parseWithOpenAI(userPrompt: string, originalText: string): Promise<ParsedCV> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini', // Use mini for cost efficiency, still very capable
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.1, // Low temperature for consistent parsing
            max_tokens: 8000, // Reasonable limit for structured output
            response_format: { type: 'json_object' }, // Force JSON output
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenAI API error (${response.status})`;
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorMessage;
        } catch {
            errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
        throw new Error('OpenAI returned empty response');
    }

    try {
        const parsed = JSON.parse(content);
        return {
            profile: parsed.profile || { name: null, email: null, phone: null, address: null, institution: null, website: null },
            categories: Array.isArray(parsed.categories) ? parsed.categories : [],
            rawText: originalText,
        };
    } catch (parseError) {
        console.error('[Parser] JSON parse error. Content:', content.substring(0, 500));
        throw new Error(`Failed to parse OpenAI response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
}

/**
 * Extract text from PDF buffer using unpdf
 * unpdf is designed for serverless/edge environments
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
    try {
        // Bypass the faulty index.js in pdf-parse which triggers a debug mode 
        // that tries to read non-existent test files when bundled.
        let pdfModule;
        try {
            // @ts-expect-error - Direct lib import to bypass index.js bug that triggers ENOENT on test files
            pdfModule = await import('pdf-parse/lib/pdf-parse.js');
        } catch {
            console.warn('Direct lib import failed, falling back to main entry point');
            pdfModule = await import('pdf-parse');
        }

        // Classic pdf-parse is a function exported via module.exports
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParser = (pdfModule as any).default || pdfModule;

        if (typeof pdfParser !== 'function') {
            throw new Error('pdf-parse is not a function. Check library installation.');
        }

        const data = await pdfParser(buffer);
        console.log(`Extracted ${data?.text?.length || 0} characters using pdf-parse`);
        return data?.text || '';
    } catch (error) {
        console.error('PDF parsing failed with pdf-parse:', error);
        throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}. Please try uploading a Word (.docx) document instead.`);
    }
}

/**
 * Extract text from Word document buffer
 */
export async function extractTextFromWord(buffer: Buffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}

/**
 * Extract text from a file based on its type
 */
export async function extractTextFromFile(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
        return extractTextFromPDF(buffer);
    } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
    ) {
        return extractTextFromWord(buffer);
    } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
}
