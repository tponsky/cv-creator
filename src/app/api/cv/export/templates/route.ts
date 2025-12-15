import { NextResponse } from 'next/server';
import { getAllTemplates } from '@/lib/cv-templates';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * GET /api/cv/export/templates
 * Get list of available CV templates
 */
export async function GET() {
    const templates = getAllTemplates();

    return NextResponse.json({
        templates: templates.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            maxPages: t.maxPages,
        })),
    });
}
