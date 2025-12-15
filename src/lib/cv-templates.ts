/**
 * CV Template Definitions
 * Defines different CV formats with their section ordering and configuration
 */

export interface TemplateSection {
    categoryName: string;
    displayName: string;
    required: boolean;
}

export interface CVTemplate {
    id: string;
    name: string;
    description: string;
    maxPages?: number;
    sections: TemplateSection[];
}

// Traditional Academic CV - comprehensive format
export const traditionalAcademicCV: CVTemplate = {
    id: 'traditional',
    name: 'Traditional Academic CV',
    description: 'Comprehensive academic CV for university positions and tenure review',
    sections: [
        { categoryName: 'Education', displayName: 'Education', required: true },
        { categoryName: 'Professional Experience', displayName: 'Professional Experience', required: true },
        { categoryName: 'Appointments', displayName: 'Academic Appointments', required: false },
        { categoryName: 'Honors and Awards', displayName: 'Honors & Awards', required: false },
        { categoryName: 'Grants & Funding', displayName: 'Grants & Funding', required: false },
        { categoryName: 'Publications', displayName: 'Publications', required: false },
        { categoryName: 'Text Books', displayName: 'Textbooks', required: false },
        { categoryName: 'Book Chapters', displayName: 'Book Chapters', required: false },
        { categoryName: 'Presentations', displayName: 'Presentations', required: false },
        { categoryName: 'Lectures', displayName: 'Invited Lectures', required: false },
        { categoryName: 'Teaching', displayName: 'Teaching Experience', required: false },
        { categoryName: 'Local Institution Academic and Clinical Teaching Responsibilities', displayName: 'Teaching Responsibilities', required: false },
        { categoryName: 'Mentoring', displayName: 'Mentorship', required: false },
        { categoryName: 'National / International Society Membership', displayName: 'Professional Memberships', required: false },
        { categoryName: 'National/ International Society Leadership', displayName: 'Leadership Positions', required: false },
        { categoryName: 'Editorial Positions', displayName: 'Editorial Positions', required: false },
        { categoryName: 'Hospital Committees and Appointments', displayName: 'Committee Service', required: false },
        { categoryName: 'Community Involvement / Board Member', displayName: 'Community Service', required: false },
    ],
};

// NIH Biosketch Format - 5 page limit
export const nihBiosketch: CVTemplate = {
    id: 'nih',
    name: 'NIH Biosketch',
    description: 'NIH grant application format (5-page limit)',
    maxPages: 5,
    sections: [
        { categoryName: 'Education', displayName: 'Education/Training', required: true },
        { categoryName: 'Professional Experience', displayName: 'Positions and Employment', required: true },
        { categoryName: 'Appointments', displayName: 'Other Experience and Professional Memberships', required: false },
        { categoryName: 'Honors and Awards', displayName: 'Honors', required: false },
        { categoryName: 'Publications', displayName: 'Contributions to Science', required: true },
    ],
};

// NSF CV Format - 2 page limit
export const nsfCV: CVTemplate = {
    id: 'nsf',
    name: 'NSF CV',
    description: 'NSF grant application format (2-page limit)',
    maxPages: 2,
    sections: [
        { categoryName: 'Education', displayName: 'Professional Preparation', required: true },
        { categoryName: 'Professional Experience', displayName: 'Appointments', required: true },
        { categoryName: 'Publications', displayName: 'Products (10 most relevant)', required: true },
        { categoryName: 'Community Involvement / Board Member', displayName: 'Synergistic Activities', required: false },
    ],
};

// Clinical/Medical CV Format
export const clinicalCV: CVTemplate = {
    id: 'clinical',
    name: 'Clinical/Medical CV',
    description: 'Emphasis on clinical experience and patient care',
    sections: [
        { categoryName: 'Education', displayName: 'Education & Training', required: true },
        { categoryName: 'Professional Experience', displayName: 'Clinical Experience', required: true },
        { categoryName: 'Appointments', displayName: 'Hospital Appointments', required: false },
        { categoryName: 'Hospital Committees and Appointments', displayName: 'Clinical Committees', required: false },
        { categoryName: 'Honors and Awards', displayName: 'Honors & Awards', required: false },
        { categoryName: 'Publications', displayName: 'Publications', required: false },
        { categoryName: 'Presentations', displayName: 'Presentations', required: false },
        { categoryName: 'National / International Society Membership', displayName: 'Professional Memberships', required: false },
        { categoryName: 'Local Institution Academic and Clinical Teaching Responsibilities', displayName: 'Teaching', required: false },
        { categoryName: 'Mentoring', displayName: 'Mentorship', required: false },
    ],
};

// All templates
export const CV_TEMPLATES: Record<string, CVTemplate> = {
    traditional: traditionalAcademicCV,
    nih: nihBiosketch,
    nsf: nsfCV,
    clinical: clinicalCV,
};

export function getTemplate(id: string): CVTemplate {
    return CV_TEMPLATES[id] || traditionalAcademicCV;
}

export function getAllTemplates(): CVTemplate[] {
    return Object.values(CV_TEMPLATES);
}
