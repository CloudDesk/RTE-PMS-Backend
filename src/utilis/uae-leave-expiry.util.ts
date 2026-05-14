/**
 * UAE Leave Expiry Utility Functions
 * 
 * This module provides utility functions for calculating leave expiry dates
 * according to UAE labor law requirements. Leave must be taken within
 * 12 months of allocation.
 */

/**
 * Calculate expiry date as allocation date + 1 year (UAE requirement)
 * @param allocationDate - The date when leave was allocated
 * @returns The expiry date (1 year from allocation)
 */
export function calculateUAELeaveExpiry(allocationDate: Date): Date {
  const expiryDate = new Date(allocationDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  return expiryDate;
}

/**
 * Calculate allocation date backwards from expiry date
 * @param expiryDate - The expiry date
 * @returns The calculated allocation date (1 year before expiry)
 */
export function calculateAllocationFromExpiry(expiryDate: Date): Date {
  const allocationDate = new Date(expiryDate);
  allocationDate.setFullYear(allocationDate.getFullYear() - 1);
  return allocationDate;
}

/**
 * Check if leave has expired
 * @param expiryDate - The expiry date to check
 * @param referenceDate - The date to compare against (defaults to today)
 * @returns true if leave has expired, false otherwise
 */
export function isLeaveExpired(expiryDate: Date, referenceDate: Date = new Date()): boolean {
  return expiryDate < referenceDate;
}

/**
 * Get days until expiry
 * @param expiryDate - The expiry date
 * @param referenceDate - The date to calculate from (defaults to today)
 * @returns Number of days until expiry (negative if already expired)
 */
export function getDaysUntilExpiry(expiryDate: Date, referenceDate: Date = new Date()): number {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const differenceMs = expiryDate.getTime() - referenceDate.getTime();
  return Math.ceil(differenceMs / millisecondsPerDay);
}

/**
 * Check if expiry is approaching (within specified days)
 * @param expiryDate - The expiry date
 * @param warningDays - Number of days before expiry to consider as "approaching" (default: 30)
 * @param referenceDate - The date to calculate from (defaults to today)
 * @returns true if expiry is approaching, false otherwise
 */
export function isExpiryApproaching(
  expiryDate: Date,
  warningDays: number = 30,
  referenceDate: Date = new Date()
): boolean {
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate, referenceDate);
  return daysUntilExpiry > 0 && daysUntilExpiry <= warningDays;
}

/**
 * Format date for UAE timezone (GST - Gulf Standard Time, UTC+4)
 * @param date - The date to format
 * @returns Formatted date string in UAE timezone
 */
export function formatDateUAE(date: Date): string {
  return date.toLocaleString('en-AE', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Get the current date in UAE timezone
 * @returns Date object representing current time in UAE
 */
export function getCurrentDateUAE(): Date {
  const now = new Date();
  const uaeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  return uaeTime;
}

/**
 * Validate if a date range is valid (end date after start date)
 * @param startDate - The start date
 * @param endDate - The end date
 * @returns true if valid, false otherwise
 */
export function isValidDateRange(startDate: Date, endDate: Date): boolean {
  return endDate >= startDate;
}

/**
 * Calculate the difference between two dates in days
 * @param startDate - The start date
 * @param endDate - The end date
 * @returns Number of days between the dates
 */
export function getDaysBetween(startDate: Date, endDate: Date): number {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const differenceMs = endDate.getTime() - startDate.getTime();
  return Math.ceil(differenceMs / millisecondsPerDay);
}

/**
 * UAE Leave Expiry Summary Interface
 */
export interface UAELeaveExpirySummary {
  allocationDate: Date;
  expiryDate: Date;
  daysUntilExpiry: number;
  isExpired: boolean;
  isApproaching: boolean;
  daysRemaining: number;
}

/**
 * Get comprehensive leave expiry summary for UAE
 * @param allocationDate - When leave was allocated
 * @param expiryDate - When leave expires
 * @param warningDays - Days before expiry to consider as "approaching"
 * @returns Complete summary of leave expiry status
 */
export function getLeaveExpirySummary(
  allocationDate: Date,
  expiryDate: Date,
  warningDays: number = 30
): UAELeaveExpirySummary {
  const daysUntilExpiry = getDaysUntilExpiry(expiryDate);
  const isExpired = isLeaveExpired(expiryDate);
  const isApproaching = isExpiryApproaching(expiryDate, warningDays);
  const daysRemaining = Math.max(0, daysUntilExpiry);

  return {
    allocationDate,
    expiryDate,
    daysUntilExpiry,
    isExpired,
    isApproaching,
    daysRemaining
  };
}

