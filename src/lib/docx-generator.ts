/**
 * Word Document Generator for CV Export
 * Uses the docx package to create professional Word documents
 */

import {
    Document,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
    Packer,
} from 'docx';
import { getTemplate } from './cv-templates';

interface CVEntry {
    id: string;
    title: string;
    description: string | null;
    date: Date | null;
    startDate?: Date | null;
    endDate?: Date | null;
    location: string | null;
    url: string | null;
}

interface CVCategory {
    id: string;
    name: string;
    entries: CVEntry[];
}

interface CVData {
    title: string;
    userName: string;
    userEmail: string;
    categories: CVCategory[];
}

// Format date for display
function formatDate(date: Date | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = d.toLocaleString('en-US', { month: 'short' });
    return `${month} ${year}`;
}

// Format date range
function formatDateRange(startDate: Date | null | undefined, endDate: Date | null | undefined, singleDate: Date | null | undefined): string {
    if (startDate) {
        const start = formatDate(startDate);
        if (endDate) {
            return `${start} - ${formatDate(endDate)}`;
        }
        return `${start} - Present`;
    }
    if (singleDate) {
        return formatDate(singleDate);
    }
    return '';
}

// Create section header
function createSectionHeader(title: string): Paragraph {
    return new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
        border: {
            bottom: {
                color: '000000',
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
            },
        },
    });
}

// Create entry paragraph
function createEntry(entry: CVEntry): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const dateStr = formatDateRange(entry.startDate, entry.endDate, entry.date);

    // Title with date
    const titleRuns: TextRun[] = [
        new TextRun({ text: entry.title, bold: true }),
    ];

    if (dateStr) {
        titleRuns.push(new TextRun({ text: ` (${dateStr})` }));
    }

    paragraphs.push(new Paragraph({
        children: titleRuns,
        spacing: { before: 100 },
    }));

    // Description
    if (entry.description) {
        paragraphs.push(new Paragraph({
            text: entry.description,
            spacing: { before: 50 },
        }));
    }

    // Location
    if (entry.location) {
        paragraphs.push(new Paragraph({
            children: [new TextRun({ text: entry.location, italics: true })],
            spacing: { before: 50 },
        }));
    }

    return paragraphs;
}

// Create contact header
function createContactHeader(userName: string, userEmail: string): Paragraph[] {
    return [
        new Paragraph({
            children: [new TextRun({ text: userName, bold: true, size: 36 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
        }),
        new Paragraph({
            text: userEmail,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
        }),
    ];
}

// Generate Word document
export async function generateDocx(
    data: CVData,
    templateId: string = 'traditional'
): Promise<Buffer> {
    const template = getTemplate(templateId);

    // Start with contact header
    const children: Paragraph[] = [
        ...createContactHeader(data.userName, data.userEmail),
    ];

    // Add document title
    children.push(new Paragraph({
        text: 'CURRICULUM VITAE',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 400 },
    }));

    // Process sections according to template
    for (const section of template.sections) {
        // Find matching category (case-insensitive)
        const category = data.categories.find(
            c => c.name.toLowerCase() === section.categoryName.toLowerCase()
        );

        if (category && category.entries.length > 0) {
            // Add section header
            children.push(createSectionHeader(section.displayName));

            // Add entries
            for (const entry of category.entries) {
                children.push(...createEntry(entry));
            }
        }
    }

    // Add any categories not in template
    const templateCategoryNames = new Set(
        template.sections.map(s => s.categoryName.toLowerCase())
    );

    for (const category of data.categories) {
        if (!templateCategoryNames.has(category.name.toLowerCase()) && category.entries.length > 0) {
            children.push(createSectionHeader(category.name));
            for (const entry of category.entries) {
                children.push(...createEntry(entry));
            }
        }
    }

    // Create document
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1440, // 1 inch in twips
                        right: 1440,
                        bottom: 1440,
                        left: 1440,
                    },
                },
            },
            children,
        }],
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);
    return Buffer.from(buffer);
}
