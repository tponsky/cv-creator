/**
 * Date Formatting Utilities for CV entries
 * Handles single dates, date ranges, and "Present" for ongoing positions
 */

/**
 * Format a single date for display
 */
export function formatDate(date: Date | string | null): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = d.toLocaleString('en-US', { month: 'short' });
    return `${month} ${year}`;
}

/**
 * Format year only
 */
export function formatYear(date: Date | string | null): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear().toString();
}

/**
 * Format a date range for display
 * Examples:
 * - startDate + endDate → "Jan 2018 - Dec 2024"
 * - startDate only → "Jan 2018 - Present"
 * - date only (single) → "Jan 2018"
 */
export function formatDateRange(
    startDate: Date | string | null,
    endDate: Date | string | null,
    singleDate?: Date | string | null
): string {
    // If we have a range
    if (startDate) {
        const start = formatDate(startDate);
        if (endDate) {
            return `${start} - ${formatDate(endDate)}`;
        }
        return `${start} - Present`;
    }

    // Fall back to single date
    if (singleDate) {
        return formatDate(singleDate);
    }

    return '';
}

/**
 * Format a date range using year only for compact display
 * Examples:
 * - startDate + endDate → "2018 - 2024"
 * - startDate only → "2018 - Present"
 * - date only (single) → "2018"
 */
export function formatYearRange(
    startDate: Date | string | null,
    endDate: Date | string | null,
    singleDate?: Date | string | null
): string {
    // If we have a range
    if (startDate) {
        const start = formatYear(startDate);
        if (endDate) {
            return `${start} - ${formatYear(endDate)}`;
        }
        return `${start} - Present`;
    }

    // Fall back to single date
    if (singleDate) {
        return formatYear(singleDate);
    }

    return '';
}

/**
 * Determine if an entry is for education or experience (typically needs date ranges)
 */
export function isRangeCategory(categoryName: string): boolean {
    const rangeCategories = [
        'education',
        'professional experience',
        'experience',
        'positions',
        'appointments',
        'employment',
        'training',
        'fellowship',
        'residency',
    ];
    return rangeCategories.some(cat =>
        categoryName.toLowerCase().includes(cat)
    );
}
