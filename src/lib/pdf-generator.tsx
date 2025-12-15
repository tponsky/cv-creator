/**
 * PDF Generator for CV Export
 * Uses @react-pdf/renderer for server-side PDF generation
 */

import React from 'react';
import ReactPDF, { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { CVTemplate, getTemplate } from './cv-templates';

// Register fonts (using built-in Helvetica for compatibility)
// Font.register({ family: 'Helvetica' }); // Built-in

// Styles
const styles = StyleSheet.create({
    page: {
        padding: 50,
        fontFamily: 'Helvetica',
        fontSize: 11,
    },
    header: {
        textAlign: 'center',
        marginBottom: 20,
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 5,
    },
    contact: {
        fontSize: 11,
        color: '#666',
        marginBottom: 5,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
        marginTop: 10,
        marginBottom: 20,
    },
    sectionHeader: {
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: 15,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#000',
        paddingBottom: 3,
    },
    entryContainer: {
        marginBottom: 8,
    },
    entryTitle: {
        fontSize: 11,
        fontWeight: 'bold',
    },
    entryDate: {
        fontSize: 10,
        color: '#444',
    },
    entryDescription: {
        fontSize: 10,
        marginTop: 2,
    },
    entryLocation: {
        fontSize: 10,
        fontStyle: 'italic',
        marginTop: 2,
    },
});

interface CVEntry {
    id: string;
    title: string;
    description: string | null;
    date: Date | null;
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
function formatDate(date: Date | null): string {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.toLocaleString('en-US', { month: 'short' });
    return `${month} ${year}`;
}

// Entry component
const EntryComponent = ({ entry }: { entry: CVEntry }) => (
    <View style={styles.entryContainer}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.entryTitle}>{entry.title}</Text>
            {entry.date && <Text style={styles.entryDate}>{formatDate(entry.date)}</Text>}
        </View>
        {entry.description && (
            <Text style={styles.entryDescription}>{entry.description}</Text>
        )}
        {entry.location && (
            <Text style={styles.entryLocation}>{entry.location}</Text>
        )}
    </View>
);

// Section component
const SectionComponent = ({ title, entries }: { title: string; entries: CVEntry[] }) => (
    <View>
        <Text style={styles.sectionHeader}>{title}</Text>
        {entries.map((entry, idx) => (
            <EntryComponent key={entry.id || idx} entry={entry} />
        ))}
    </View>
);

// Main CV Document
const CVDocument = ({ data, template }: { data: CVData; template: CVTemplate }) => {
    // Build sections based on template
    const sections: { title: string; entries: CVEntry[] }[] = [];

    // Add template sections
    for (const section of template.sections) {
        const category = data.categories.find(
            c => c.name.toLowerCase() === section.categoryName.toLowerCase()
        );
        if (category && category.entries.length > 0) {
            sections.push({
                title: section.displayName,
                entries: category.entries,
            });
        }
    }

    // Add remaining categories not in template
    const templateCategoryNames = new Set(
        template.sections.map(s => s.categoryName.toLowerCase())
    );

    for (const category of data.categories) {
        if (!templateCategoryNames.has(category.name.toLowerCase()) && category.entries.length > 0) {
            sections.push({
                title: category.name,
                entries: category.entries,
            });
        }
    }

    return (
        <Document>
            <Page size="LETTER" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.name}>{data.userName}</Text>
                    <Text style={styles.contact}>{data.userEmail}</Text>
                </View>

                <Text style={styles.title}>CURRICULUM VITAE</Text>

                {/* Sections */}
                {sections.map((section, idx) => (
                    <SectionComponent
                        key={idx}
                        title={section.title}
                        entries={section.entries}
                    />
                ))}
            </Page>
        </Document>
    );
};

// Generate PDF buffer
export async function generatePdf(
    data: CVData,
    templateId: string = 'traditional'
): Promise<Buffer> {
    const template = getTemplate(templateId);

    // Render to buffer
    const pdfStream = await ReactPDF.renderToStream(
        <CVDocument data={data} template={template} />
    );

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of pdfStream) {
        chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
}
