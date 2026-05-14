export function getCurrentFinancialYear(): string {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // Months are zero-based, so +1

    const startYear = currentMonth >= 4 ? currentYear : currentYear - 1;
    const endYear = startYear + 1;

    return `${startYear}-${endYear}`;
}

/**
 * Calculate business days between two dates (excluding weekends)
 * @param startDate - Start date
 * @param endDate - End date
 * @param weekendDays - Array of weekend day numbers (0=Sunday, 6=Saturday). Default: [0, 6]
 * @returns Number of business days
 */
export function calculateBusinessDays(
    startDate: Date,
    endDate: Date,
    weekendDays: number[] = [0, 6] // Default: Sunday and Saturday
): number {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    let businessDays = 0;
    const currentDate = new Date(start);

    while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay();
        // Count only if it's not a weekend
        if (!weekendDays.includes(dayOfWeek)) {
            businessDays++;
        }
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return businessDays;
}

/**
 * Format a date to DD/MM/YYYY
 * @param date - Date to format
 * @returns Formatted date string or 'N/A' if invalid
 */
export function formatDateToDDMMYYYY(date: Date | string | number | undefined | null): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}