/**
 * Leave Type Constants and Country-Specific Mappings
 * 
 * This file defines:
 * - All available leave types in the system
 * - Country-specific leave type mappings (UAE vs India)
 * - Validation functions for leave type validation
 * 
 * @date October 14, 2025
 */

// All possible leave types in the system
export const ALL_LEAVE_TYPES = [
    'annual',
    'sick',
    'compOff',
    'lossOfPay',
    'otherPaid',
    'otherUnpaid',
    'maternity',  // NEW: UAE-specific
    'work_from_home',  // NEW: Work From Home (merged from WFH)
    'restricted_holiday',  // NEW: Restricted/Optional Holiday (merged from optional holiday)
    'full_month_present',  // SPECIAL: For data migration - creates attendance without leave record
    'no_leave'  // SPECIAL: Alias for full_month_present
] as const;

export type LeaveType = typeof ALL_LEAVE_TYPES[number];

// UAE-allowed leave types
export const UAE_LEAVE_TYPES: readonly LeaveType[] = [
    'sick',
    'annual',
    'compOff',
    'maternity',
    'work_from_home'
] as const;

// India-allowed leave types
export const INDIA_LEAVE_TYPES: readonly LeaveType[] = [
    'annual',
    'sick',
    'compOff',
    'lossOfPay',
    'otherPaid',
    'otherUnpaid',
    'work_from_home',
    'restricted_holiday'  // Restricted/Optional Holiday
] as const;

// Leave type labels for display
export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
    annual: 'Annual Leave',
    sick: 'Sick Leave',
    compOff: 'Comp Off',
    lossOfPay: 'Loss of Pay',
    otherPaid: 'Other Paid',
    otherUnpaid: 'Other Unpaid',
    maternity: 'Maternity Leave',
    work_from_home: 'Work From Home',
    restricted_holiday: 'Restricted Holiday',
    full_month_present: 'Full Month Present (No Leave)',
    no_leave: 'No Leave'
};

// Maternity leave configuration for UAE
export const MATERNITY_LEAVE_CONFIG = {
    country: 'AE',
    type: 'maternity' as LeaveType,
    defaultAllocation: 45,        // 45 days as per UAE labor law
    validityPeriod: 365,          // 1 year
    isPaid: true,
    gender: 'female',             // Optional: only for female employees
    canCarryForward: false,       // Cannot be carried forward
    canEncash: false,             // Cannot be encashed
    description: 'Maternity leave as per UAE labor law (45 days)'
};

/**
 * Get allowed leave types for a specific country
 * @param country - Country code ('IN' or 'AE')
 * @returns Array of allowed leave types
 */
export function getAllowedLeaveTypes(country: string): readonly LeaveType[] {
    switch (country) {
        case 'AE':
            return UAE_LEAVE_TYPES;
        case 'IN':
            return INDIA_LEAVE_TYPES;
        default:
            return INDIA_LEAVE_TYPES; // Default to India
    }
}

/**
 * Validate if a leave type is allowed for a specific country
 * @param country - Country code ('IN' or 'AE')
 * @param leaveType - Leave type to validate
 * @returns true if valid, throws error if invalid
 */
export function validateLeaveTypeForCountry(
    country: string,
    leaveType: string
): boolean {
    const allowedTypes = getAllowedLeaveTypes(country);

    if (!allowedTypes.includes(leaveType as LeaveType)) {
        const countryName = country === 'AE' ? 'UAE' : country === 'IN' ? 'India' : country;
        throw new Error(
            `Leave type '${leaveType}' is not allowed for ${countryName} employees. ` +
            `Allowed types: ${allowedTypes.join(', ')}`
        );
    }

    return true;
}

/**
 * Check if a leave type is valid for UAE
 * @param leaveType - Leave type to check
 * @returns true if valid for UAE
 */
export function isUAELeaveType(leaveType: string): boolean {
    return UAE_LEAVE_TYPES.includes(leaveType as LeaveType);
}

/**
 * Check if a leave type is valid for India
 * @param leaveType - Leave type to check
 * @returns true if valid for India
 */
export function isIndiaLeaveType(leaveType: string): boolean {
    return INDIA_LEAVE_TYPES.includes(leaveType as LeaveType);
}

/**
 * Filter leave summary object to only include country-specific leave types
 * @param summary - Leave summary object
 * @param country - Country code
 * @returns Filtered leave summary with only allowed types
 */
export function filterLeaveSummaryByCountry<T extends Record<string, any>>(
    summary: T,
    country: string
): Partial<T> {
    const allowedTypes = getAllowedLeaveTypes(country);
    const filtered: Record<string, any> = {};

    allowedTypes.forEach((type) => {
        if (summary[type]) {
            filtered[type] = summary[type];
        }
    });

    return filtered as Partial<T>;
}

/**
 * Get default leave summary structure for a country
 * @param country - Country code
 * @returns Default leave summary object
 */
export function getDefaultLeaveSummary(country: string) {
    const allowedTypes = getAllowedLeaveTypes(country);
    const defaultSummary: Record<string, any> = {};

    allowedTypes.forEach((type) => {
        defaultSummary[type] = {
            alloted: 0,
            availed: 0,
            remaining: 0,
            leaveRequests: []
        };
    });

    return defaultSummary;
}

