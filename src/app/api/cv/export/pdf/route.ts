import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generatePdf } from '@/lib/pdf-generator';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * GET /api/cv/export/pdf
 * Export CV as PDF document
 * Query params: template (traditional|nih|nsf|clinical)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const templateId = searchParams.get('template') || 'traditional';

        // Get user
        const user = await prisma.user.findFirst();
        if (!user) {
            return NextResponse.json({ error: 'No user found' }, { status: 404 });
        }

        // Get CV with all categories and entries
        const cv = await prisma.cV.findUnique({
            where: { userId: user.id },
            include: {
                categories: {
                    orderBy: { displayOrder: 'asc' },
                    include: {
                        entries: {
                            orderBy: { displayOrder: 'asc' },
                        },
                    },
                },
            },
        });

        if (!cv) {
            return NextResponse.json({ error: 'No CV found' }, { status: 404 });
        }

        // Prepare data for generator
        const cvData = {
            title: cv.title,
            userName: user.name || 'Academic Professional',
            userEmail: user.email,
            categories: cv.categories.map(cat => ({
                id: cat.id,
                name: cat.name,
                entries: cat.entries.map(entry => ({
                    id: entry.id,
                    title: entry.title,
                    description: entry.description,
                    date: entry.date,
                    location: entry.location,
                    url: entry.url,
                })),
            })),
        };

        // Generate PDF
        const buffer = await generatePdf(cvData, templateId);

        // Return as downloadable file
        const fileName = `CV_${templateId}_${new Date().toISOString().split('T')[0]}.pdf`;

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            },
        });
    } catch (error) {
        console.error('PDF export error:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
}
