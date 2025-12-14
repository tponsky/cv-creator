/**
 * CV Parser
 * Uses pdf-parse/mammoth for text extraction and OpenAI GPT-4 for parsing
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

export interface ParsedCV {
    categories: ParsedCategory[];
    rawText: string;
}

const SYSTEM_PROMPT = `You are an expert CV parser. Your job is to analyze CV/resume text and extract it into structured data.

For each section you find (like Publications, Presentations, Awards, Grants, Education, Experience, etc.), extract:
1. The category name (section header)
2. All entries within that section

For each entry, extract:
- title: The main title/name of the item
- description: Any additional details, authors, journal names, etc.
- date: The date if present (in ISO format YYYY-MM-DD or YYYY-MM or just YYYY)
- location: Location if relevant (city, institution, etc.)
- url: Any URL or DOI if present

Common CV sections to look for:
- Publications (peer-reviewed articles, books, chapters)
- Presentations (invited talks, conference presentations)
- Grants & Funding
- Awards & Honors
- Education
- Professional Experience
- Teaching
- Mentoring
- Service & Leadership
- Editorial Boards
- Professional Memberships

Return your response as a JSON object with this structure:
{
  "categories": [
    {
      "name": "Publications",
      "entries": [
        {
          "title": "Paper Title",
          "description": "Author1, Author2. Journal Name. 2024;Vol:Pages.",
          "date": "2024",
          "location": null,
          "url": "https://doi.org/..."
        }
      ]
    }
  ]
}

Parse ALL entries you can find. Be thorough. Return ONLY valid JSON.`;

export async function parseCV(text: string): Promise<ParsedCV> {
    if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured');
    }

    // Truncate text if too long (GPT-4 context limit)
    const maxChars = 100000;
    const truncatedText = text.length > maxChars ? text.slice(0, maxChars) : text;

    const userPrompt = `Parse the following CV and extract all sections and entries:

${truncatedText}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 16000,
            response_format: { type: 'json_object' },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{"categories":[]}';

    try {
        const parsed = JSON.parse(content);
        return {
            categories: parsed.categories || [],
            rawText: truncatedText,
        };
    } catch (e) {
        console.error('Failed to parse CV response:', content, e);
        return {
            categories: [],
            rawText: truncatedText,
        };
    }
}

/**
 * Extract text from PDF buffer using pdfjs-dist
 * Configured for Node.js server environment
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
    try {
        // Import pdfjs-dist with the legacy build for better Node.js compatibility
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

        // Disable the worker - not available in Node.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';

        // Load the PDF document with disabled worker
        const uint8Array = new Uint8Array(buffer);
        const loadingTask = pdfjsLib.getDocument({
            data: uint8Array,
            useWorkerFetch: false,
            isEvalSupported: false,
            useSystemFonts: true,
        });
        const pdf = await loadingTask.promise;

        // Extract text from all pages
        const textContent: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const pageText = content.items
                .filter((item: any) => 'str' in item)
                .map((item: any) => item.str as string)
                .join(' ');
            /* eslint-enable @typescript-eslint/no-explicit-any */
            textContent.push(pageText);
        }

        return textContent.join('\n\n');
    } catch (error) {
        console.error('PDF parsing failed:', error);
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
