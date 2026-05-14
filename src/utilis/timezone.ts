/**
 * Timezone conversion utilities for bulk attendance upload
 * Handles conversion from local time to UTC for consistent storage
 */

export interface TimezoneConfig {
  name: string;
  offset: number; // Offset in hours from UTC
  offsetMinutes?: number; // Additional minutes offset (for half-hour timezones)
}

// Common timezone configurations
export const TIMEZONE_CONFIGS: Record<string, TimezoneConfig> = {
  'IST': { name: 'India Standard Time', offset: 5, offsetMinutes: 30 },
  'UAE': { name: 'UAE Standard Time', offset: 4 },
  'PST': { name: 'Pacific Standard Time', offset: -8 },
  'EST': { name: 'Eastern Standard Time', offset: -5 },
  'GMT': { name: 'Greenwich Mean Time', offset: 0 },
  'UTC': { name: 'Coordinated Universal Time', offset: 0 }
};

/**
 * Convert local time to UTC based on timezone offset
 * @param localTime - Time string in HH:mm format
 * @param baseDate - Base date for the time conversion
 * @param timezoneConfig - Timezone configuration
 * @returns UTC Date object
 */
export function convertLocalToUTC(
  localTime: string,
  baseDate: Date,
  timezoneConfig: TimezoneConfig
): Date {
  const [hours, minutes] = localTime.split(':').map(Number);
  
  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error('Invalid time format. Expected HH:mm');
  }

  // Convert local hours and minutes to UTC (same logic as manual attendance)
  let utcHours = hours - timezoneConfig.offset;
  let utcMinutes = minutes - (timezoneConfig.offsetMinutes || 0);

  // Handle minute overflow
  if (utcMinutes < 0) {
    utcMinutes += 60;
    utcHours -= 1;
  }

  // Handle hour overflow (previous day)
  let targetDate = new Date(baseDate);
  if (utcHours < 0) {
    utcHours += 24;
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  // Create UTC date
  const utcDate = new Date(targetDate);
  utcDate.setUTCHours(utcHours, utcMinutes, 0, 0);

  return utcDate;
}

/**
 * Convert UTC time to local time based on timezone offset
 * @param utcTime - UTC Date object
 * @param timezoneConfig - Timezone configuration
 * @returns Local time string in HH:mm format
 */
export function convertUTCToLocal(
  utcTime: Date,
  timezoneConfig: TimezoneConfig
): string {
  // Calculate total offset in milliseconds
  const totalOffsetMs = (timezoneConfig.offset * 60 + (timezoneConfig.offsetMinutes || 0)) * 60 * 1000;
  
  // Convert to local time by adding the offset
  const localDate = new Date(utcTime.getTime() + totalOffsetMs);
  
  const hours = localDate.getUTCHours().toString().padStart(2, '0');
  const minutes = localDate.getUTCMinutes().toString().padStart(2, '0');
  
  return `${hours}:${minutes}`;
}

/**
 * Detect timezone from user location or country
 * @param location - Location string (e.g., "India", "UAE", "Dubai")
 * @returns Timezone configuration
 */
export function detectTimezone(location?: string): TimezoneConfig {
  if (!location) {
    return TIMEZONE_CONFIGS['UAE']; // Default to UAE
  }

  const locationLower = location.toLowerCase();
  
  if (locationLower.includes('india') || locationLower.includes('indian')) {
    return TIMEZONE_CONFIGS['IST'];
  }
  
  if (locationLower.includes('uae') || locationLower.includes('dubai') || locationLower.includes('emirates')) {
    return TIMEZONE_CONFIGS['UAE'];
  }
  
  if (locationLower.includes('pacific') || locationLower.includes('california')) {
    return TIMEZONE_CONFIGS['PST'];
  }
  
  if (locationLower.includes('eastern') || locationLower.includes('new york')) {
    return TIMEZONE_CONFIGS['EST'];
  }
  
  // Default to UAE if no match found
  return TIMEZONE_CONFIGS['UAE'];
}

/**
 * Parse timezone from string (e.g., "IST", "UAE", "UTC+5:30")
 * @param timezoneString - Timezone string
 * @returns Timezone configuration
 */
export function parseTimezone(timezoneString?: string): TimezoneConfig {
  if (!timezoneString) {
    return TIMEZONE_CONFIGS['UAE']; // Default to UAE
  }

  const tzUpper = timezoneString.toUpperCase();
  
  // Check predefined timezones
  if (TIMEZONE_CONFIGS[tzUpper]) {
    return TIMEZONE_CONFIGS[tzUpper];
  }
  
  // Parse UTC offset format (e.g., "UTC+5:30", "UTC-8")
  const utcMatch = tzUpper.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (utcMatch) {
    const sign = utcMatch[1] === '+' ? 1 : -1;
    const hours = parseInt(utcMatch[2]);
    const minutes = utcMatch[3] ? parseInt(utcMatch[3]) : 0;
    
    return {
      name: `UTC${utcMatch[1]}${hours}${minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : ''}`,
      offset: sign * hours,
      offsetMinutes: sign * minutes
    };
  }
  
  // Default to UAE if no match found
  return TIMEZONE_CONFIGS['UAE'];
}

/**
 * Create shift day (start of day in UTC) from local date
 * @param localDate - Local date string (YYYY-MM-DD)
 * @returns UTC Date object representing start of day
 */
export function createShiftDayUTC(
  localDate: string
): Date {
  const date = new Date(localDate);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/**
 * Create shift timing in UTC from local time
 * @param localTime - Local time string (HH:mm)
 * @param localDate - Local date string (YYYY-MM-DD)
 * @param timezoneConfig - Timezone configuration
 * @returns UTC Date object
 */
export function createShiftTimeUTC(
  localTime: string,
  localDate: string,
  timezoneConfig: TimezoneConfig
): Date {
  const baseDate = new Date(localDate);
  return convertLocalToUTC(localTime, baseDate, timezoneConfig);
}

/**
 * Handle overnight shifts by adjusting end time to next day if needed
 * @param startTime - Start time in UTC
 * @param endTime - End time in UTC
 * @param isOvernightShift - Whether this is an overnight shift
 * @returns Adjusted end time in UTC
 */
export function handleOvernightShift(
  startTime: Date,
  endTime: Date,
  isOvernightShift: boolean
): Date {
  if (isOvernightShift && endTime <= startTime) {
    const adjustedEndTime = new Date(endTime);
    adjustedEndTime.setUTCDate(adjustedEndTime.getUTCDate() + 1);
    return adjustedEndTime;
  }
  return endTime;
}

/**
 * Automatically detect if a shift is overnight based on start and end times
 * @param startTime - Start time string in HH:mm format
 * @param endTime - End time string in HH:mm format
 * @returns true if the shift is overnight (end time is earlier than start time)
 */
export function detectOvernightShift(startTime: string, endTime: string): boolean {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  
  // If end time is earlier than start time, it's an overnight shift
  return endTotalMinutes < startTotalMinutes;
}

/**
 * Convert local time to UTC with automatic overnight shift detection
 * @param localTime - Time string in HH:mm format
 * @param baseDate - Base date for the time conversion
 * @param timezoneConfig - Timezone configuration
 * @param isNextDay - Whether this time should be on the next day
 * @returns UTC Date object
 */
export function convertLocalToUTCWithOvernight(
  localTime: string,
  baseDate: Date,
  timezoneConfig: TimezoneConfig,
  isNextDay: boolean = false
): Date {
  const [hours, minutes] = localTime.split(':').map(Number);
  
  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error('Invalid time format. Expected HH:mm');
  }

  // Convert local hours and minutes to UTC
  let utcHours = hours - timezoneConfig.offset;
  let utcMinutes = minutes - (timezoneConfig.offsetMinutes || 0);

  // Handle minute overflow
  if (utcMinutes < 0) {
    utcMinutes += 60;
    utcHours -= 1;
  }

  // Handle hour overflow (previous day)
  let targetDate = new Date(baseDate);
  if (utcHours < 0) {
    utcHours += 24;
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  // If this is an overnight shift end time, add one day
  if (isNextDay) {
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  }

  // Create UTC date
  const utcDate = new Date(targetDate);
  utcDate.setUTCHours(utcHours, utcMinutes, 0, 0);

  return utcDate;
}

/**
 * Format time difference in HH:mm:ss format
 * @param startTime - Start time in UTC
 * @param endTime - End time in UTC
 * @returns Formatted time difference string
 */
export function formatTimeDifference(startTime: Date, endTime: Date): string {
  const diffMs = endTime.getTime() - startTime.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
} 