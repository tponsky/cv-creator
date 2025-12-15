/**
 * AI Email Parser
 * Uses OpenAI GPT-4 to extract CV-relevant information from emails
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export interface ParsedCVEntry {
    title: string;
    description: string | null;
    date: Date | null;
    startDate: Date | null;
    endDate: Date | null;
    location: string | null;
    url: string | null;
    suggestedCategory: string;
    confidence: number;
    reasoning: string;
}

export interface EmailData {
    from: string;
    subject: string;
    textBody: string;
    htmlBody?: string;
    date: Date;
}

const SYSTEM_PROMPT = `You are an AI assistant that extracts CV-worthy achievements from emails.

Your job is to analyze an email and determine if it contains information that should be added to someone's academic/professional CV.

Types of CV-worthy content:
- Publication acceptances
- Conference presentations or invitations
- Awards and honors
- Grant approvals
- Speaking engagements
- Committee appointments
- Leadership positions
- Editorial board appointments
- Teaching assignments
- Research collaborations
- Visiting professorships

For each piece of CV-worthy content found, extract:
1. title: A concise title for the CV entry
2. description: Brief description with relevant details (journal, conference, amount, etc.)
3. date: For one-time events, the date (ISO format or null)
4. startDate: For positions/ranges, the start date (ISO format or null)
5. endDate: For positions/ranges, the end date (ISO format or null if ongoing)
6. location: Location if relevant (city, institution, etc.)
7. url: Any relevant URL mentioned
8. suggestedCategory: Best category from: Publications, Presentations, Awards, Grants, Leadership, Teaching, Service
9. confidence: 0-1 score of how confident you are this is CV-worthy
10. reasoning: Brief explanation of why this should be on a CV

Use 'date' for single events (presentations, awards given on a date).
Use 'startDate' and 'endDate' for ongoing positions or date ranges.

If the email contains NO CV-worthy content, return an empty array.

Respond ONLY with valid JSON array. No markdown, no explanation outside the JSON.`;

export async function parseEmailForCVEntries(email: EmailData): Promise<ParsedCVEntry[]> {
    if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured');
    }

    const userPrompt = `Analyze this email for CV-worthy content:

FROM: ${email.from}
SUBJECT: ${email.subject}
DATE: ${email.date.toISOString()}

BODY:
${email.textBody || stripHtml(email.htmlBody || '')}

Extract any CV-worthy achievements. Return an empty array [] if none found.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 2000,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    try {
        // Parse the JSON response
        const entries = JSON.parse(content);

        // Validate and transform entries
        return entries.map((entry: Record<string, unknown>) => ({
            title: String(entry.title || ''),
            description: entry.description ? String(entry.description) : null,
            date: entry.date ? new Date(String(entry.date)) : null,
            startDate: entry.startDate ? new Date(String(entry.startDate)) : null,
            endDate: entry.endDate ? new Date(String(entry.endDate)) : null,
            location: entry.location ? String(entry.location) : null,
            url: entry.url ? String(entry.url) : null,
            suggestedCategory: String(entry.suggestedCategory || 'Other'),
            confidence: Number(entry.confidence) || 0.5,
            reasoning: String(entry.reasoning || ''),
        }));
    } catch (e) {
        console.error('Failed to parse AI response:', content, e);
        return [];
    }
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
