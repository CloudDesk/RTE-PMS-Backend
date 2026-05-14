import mongoose, { Types, Document } from 'mongoose';
import { User } from '../models/user.model';
import { ShiftAssignment, IShift } from '../models/shift.model';
import { AttendanceRecord, IAttendanceRecord } from '../models/attendance-record.model';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { HolidayCalendar, IHoliday } from '../models/holiday-calendar.model';
import { OptionalHolidayRequest } from '../models/optional-holiday-request.model';
import { WFH } from '../models/wfh.model';
import { Leave } from '../models/leave.model';
import * as ExcelJS from 'exceljs';


interface ISwipeData {
  biometricId: string; // Biometric ID to identify user
  timestamp: Date;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number;
    address: string;
  };
  hasLocation?: boolean;
  locationValid?: boolean;
  locationAddress?: string;
}

interface IAttendanceRecordsQuery {
  startDate: Date;
  endDate: Date;
  userIds?: string[];
  page: number;
  limit: number;
}
interface ISwipeResponse {
  success: boolean;
  message: string;
  data?: {
    userId: Types.ObjectId;
    shiftCode: string;
    shiftDay: Date;
    swipeTime: Date;
    firstIn?: Date | null;
    lastOut?: Date | null;
    isWithinWindow: boolean;

    needsRegularization?: boolean;
    isLateEntry?: boolean;
    isEarlyExit?: boolean;
    status: string;
    attendanceStatus: string[];
    totalWorkHours?: string;
    breakHours?: string;
    actualWorkHours?: string;
    shiftHours?: string;
    shortfallHours?: string;
    excessHours?: string;
    outOfWindowSwipes?: {
      timestamp: Date;
      direction: 'IN' | 'OUT';
      deviceId: string;
      location: {
        latitude: number;
        longitude: number;
        accuracy: number;
        altitude: number;
        address: string;
      };
      reason: string;
    }[];
    reason?: string;
  };
}

interface IShiftWindow {
  shiftStart: Date;
  shiftEnd: Date;
  windowStart: Date;
  windowEnd: Date;
  graceTimeInMinutes: number;
}

interface IAttendanceMetrics {
  totalWorkHours: string;
  breakHours: string;
  actualWorkHours: string;
  shiftHours: string;
  shortfallHours: string;
  excessHours: string;
  hasShortfall: boolean;
  hasExcessHours: boolean;
}




export class BiometricAttendanceService extends BaseService {
  constructor(context: RequestContext) {
    super(context);// Initialize shiftService with the appropriate service
  }
  // Add this function to check if the attendance date matches with a holiday
  private async checkHolidayCalendar(userId: Types.ObjectId, shiftDay: Date): Promise<IHoliday | null> {
    // Normalize the date to start of day to ensure accurate comparison
    const normalizedDate = new Date(shiftDay);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    // Find holiday calendars assigned to this user
    const holidayCalendars = await HolidayCalendar.find({
      assignedTo: { $in: [userId.toString()] }
    });

    // If no holiday calendars found for this user
    if (!holidayCalendars || holidayCalendars.length === 0) {
      return null;
    }

    // Check each calendar for matching holiday date
    for (const calendar of holidayCalendars) {
      const matchedHoliday = calendar.holidays.find(holiday => {
        const holidayDate = new Date(holiday.date);
        holidayDate.setUTCHours(0, 0, 0, 0);

        return holidayDate.getTime() === normalizedDate.getTime();
      });

      if (matchedHoliday) {
        return matchedHoliday;
      }
    }

    return null;
  }

  private async getUserByBiometricId(biometricId: string) {
    console.log('🔍 getUserByBiometricId called with:', biometricId);

    // Check if biometricId is actually a MongoDB ObjectId (userId)
    if (Types.ObjectId.isValid(biometricId) && biometricId.length === 24) {
      console.log('✅ Detected ObjectId format, treating as userId');
      // If it's a valid ObjectId, treat it as userId
      const user = await User.findById(biometricId);
      if (!user || !user.active) {
        throw new Error('User not found or inactive');
      }
      console.log('✅ User found by ObjectId:', user.name, user.email);
      return user;
    } else {
      console.log('✅ Detected string format, treating as biometricId');
      // If it's not an ObjectId, treat it as biometricId
      const user = await User.findOne({ biometricId, active: true });
      if (!user) {
        throw new Error('User not found or inactive');
      }
      console.log('✅ User found by biometricId:', user.name, user.email);
      return user;
    }
  }

  /**
   * Get timezone offset in hours and minutes based on user's country
   * @param country - User's country code ('IN' | 'AE')
   * @returns Object with hours and minutes offset
   */
  private getTimezoneOffset(country?: string): { hours: number; minutes: number } {
    // Normalize country code to uppercase
    const normalizedCountry = country?.toUpperCase() || 'IN';

    switch (normalizedCountry) {
      case 'IN': return { hours: 5, minutes: 30 }; // IST (UTC+5:30)
      case 'AE': return { hours: 4, minutes: 0 };  // UAE (UTC+4:00)
      default:
        console.warn(`⚠️ Unknown country code "${country}", defaulting to IST (UTC+5:30)`);
        return { hours: 5, minutes: 30 };   // Default to IST for backward compatibility
    }
  }

  /**
   * Convert a date string (YYYY-MM-DD) to shiftDay format (OLD BEHAVIOR - UTC date)
   * When frontend sends a date like "2025-12-15", treat it as UTC date
   * 
   * @param date - Date object or date string (e.g., "2025-12-15")
   * @param country - User's country code (not used in old behavior, kept for compatibility)
   * @returns Date object in shiftDay format (UTC midnight)
   * 
   * Example:
   * - Input: "2025-12-15"
   * - Returns: 2025-12-15T00:00:00.000Z (UTC midnight)
   */
  private convertDateStringToShiftDay(date: Date | string, _country?: string): Date {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    // OLD BEHAVIOR: Treat date as UTC date, normalize to UTC midnight
    const shiftDay = new Date(dateObj);
    shiftDay.setUTCHours(0, 0, 0, 0);

    console.log(`📅 convertDateStringToShiftDay (OLD BEHAVIOR - UTC date):`);
    console.log(`  Input date: ${dateObj.toISOString()}`);
    console.log(`  Shift day (UTC date): ${shiftDay.toISOString()}`);

    return shiftDay;
  }

  /**
   * Get shift day from UTC timestamp (OLD BEHAVIOR - stores UTC date)
   * @param timestamp - UTC timestamp
   * @param country - User's country code (not used in old behavior, kept for compatibility)
   * @returns Date object set to start of UTC day
   * 
   * Example:
   * - UTC timestamp: 2025-12-14T22:37:26.910Z (10:37 PM UTC on Dec 14)
   * - Returns: 2025-12-14T00:00:00.000Z (midnight UTC of Dec 14 - UTC date)
   */
  private getLocalShiftDay(timestamp: Date, _country?: string): Date {
    // OLD BEHAVIOR: Store UTC date, not local date
    const shiftDay = new Date(timestamp);
    shiftDay.setUTCHours(0, 0, 0, 0);

    console.log(`🕐 getLocalShiftDay (OLD BEHAVIOR - UTC date):`);
    console.log(`  UTC timestamp: ${timestamp.toISOString()}`);
    console.log(`  Shift day (UTC date stored): ${shiftDay.toISOString()}`);

    return shiftDay;
  }

  private async getCurrentShiftAssignment(userId: Types.ObjectId, timestamp: Date, userCountry?: string) {
    // Get shiftDay (OLD BEHAVIOR - UTC date)
    const shiftDay = this.getLocalShiftDay(timestamp, userCountry);
    console.log("userId", userId, shiftDay, "shiftDay (UTC date)")
    // Find active shift assignment for the user
    const shiftAssignment = await ShiftAssignment.findOne({
      userId,
      isActive: true,
      startDate: { $lte: shiftDay },
      $or: [
        { endDate: { $gte: shiftDay } },
        { endDate: null },
      ],
    }).populate<{ shiftId: any }>('shiftId');
    console.log(shiftAssignment, "shiftAssignment")
    if (!shiftAssignment || !shiftAssignment.shiftId) {
      throw new Error('No active shift assignment found');
    }
    return shiftAssignment;
  }

  private getShiftTimings(shift: IShift & Document, shiftDay: Date, country?: string): IShiftWindow {
    // IMPORTANT: Create a copy of shiftDay to avoid mutating the original
    // The original shiftDay must remain unchanged (it's stored as UTC date)
    const baseShiftDay = new Date(shiftDay);

    // Get timezone offset for the user's country
    const timezoneOffset = this.getTimezoneOffset(country);

    const parseTime = (timeStr: string): { hours: number; minutes: number } => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) {
        throw new Error('Invalid time format. Expected HH:mm or HH:mm:ss');
      }
      return { hours, minutes };
    };

    // Convert local time to UTC based on user's timezone
    // Shift times in database are stored as local time (e.g., "09:00" means 9 AM in user's timezone)
    const convertLocalToUTC = (localHours: number, localMinutes: number): { hours: number; minutes: number; dateAdjustment: number } => {
      // Subtract timezone offset to convert local time to UTC
      let utcHours = localHours - timezoneOffset.hours;
      let utcMinutes = localMinutes - timezoneOffset.minutes;
      let dateAdjustment = 0;

      if (utcMinutes < 0) {
        utcMinutes += 60;
        utcHours -= 1;
      }

      if (utcHours < 0) {
        utcHours += 24;
        dateAdjustment = -1; // Indicates the date needs to be adjusted by -1 day
      }

      return { hours: utcHours, minutes: utcMinutes, dateAdjustment };
    };

    // Parse shift times (stored as local time strings like "09:00", "18:00")
    const startLocal = parseTime(shift.startTime);
    const endLocal = parseTime(shift.endTime);
    const windowStartLocal = parseTime(shift.shiftWindowStart);
    const windowEndLocal = parseTime(shift.shiftWindowEnd);

    // Convert local times to UTC based on user's timezone
    const startUTC = convertLocalToUTC(startLocal.hours, startLocal.minutes);
    const endUTC = convertLocalToUTC(endLocal.hours, endLocal.minutes);
    const windowStartUTC = convertLocalToUTC(windowStartLocal.hours, windowStartLocal.minutes);
    const windowEndUTC = convertLocalToUTC(windowEndLocal.hours, windowEndLocal.minutes);

    // Create dates with proper date adjustments - use baseShiftDay (copy) not shiftDay (original)
    const shiftStart = new Date(baseShiftDay);
    if (startUTC.dateAdjustment !== 0) {
      shiftStart.setUTCDate(shiftStart.getUTCDate() + startUTC.dateAdjustment);
    }
    shiftStart.setUTCHours(startUTC.hours, startUTC.minutes, 0, 0);

    const shiftEnd = new Date(baseShiftDay);
    if (endUTC.dateAdjustment !== 0) {
      shiftEnd.setUTCDate(shiftEnd.getUTCDate() + endUTC.dateAdjustment);
    }
    shiftEnd.setUTCHours(endUTC.hours, endUTC.minutes, 0, 0);

    const windowStart = new Date(baseShiftDay);
    if (windowStartUTC.dateAdjustment !== 0) {
      windowStart.setUTCDate(windowStart.getUTCDate() + windowStartUTC.dateAdjustment);
    }
    windowStart.setUTCHours(windowStartUTC.hours, windowStartUTC.minutes, 0, 0);

    const windowEnd = new Date(baseShiftDay);
    if (windowEndUTC.dateAdjustment !== 0) {
      windowEnd.setUTCDate(windowEnd.getUTCDate() + windowEndUTC.dateAdjustment);
    }
    windowEnd.setUTCHours(windowEndUTC.hours, windowEndUTC.minutes, 0, 0);

    if (endUTC.hours < startUTC.hours ||
      (endUTC.hours === startUTC.hours && endUTC.minutes < startUTC.minutes)) {
      shiftEnd.setUTCDate(shiftEnd.getUTCDate() + 1);
    }

    if (windowEndUTC.hours < windowStartUTC.hours ||
      (windowEndUTC.hours === windowStartUTC.hours && windowEndUTC.minutes < windowStartUTC.minutes)) {
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
    }

    return {
      shiftStart,
      shiftEnd,
      windowStart,
      windowEnd,
      graceTimeInMinutes: shift.graceTimeInMinutes ?? 0
    };
  }

  private async findOrCreateAttendanceRecord(
    userId: Types.ObjectId,
    shiftId: Types.ObjectId,
    shiftDay: Date,
    shiftCode: string,
    shiftStart: Date,
    shiftEnd: Date,
  ) {
    let record = await AttendanceRecord.findOne({
      userId,
      shiftDay,
      shiftCode,
    });

    if (!record) {
      record = await AttendanceRecord.create({
        userId,
        shiftId,
        shiftDay,
        shiftCode,
        shiftStart,
        shiftEnd,
        swipes: [],
        outOfWindowSwipes: [],
        needsRegularization: false,
        attendanceStatus: [],
        isLateEntry: false,
        isEarlyExit: false,
        isWithinWindow: true,
        excessHours: '0:00:00',
        shortfallHours: '0:00:00',
        // status: 'incomplete'
      });
    }

    // Check if this date is a holiday for the user
    const holiday = await this.checkHolidayCalendar(userId, shiftDay);

    if (holiday) {
      let isActuallyHoliday = true;

      // If it's an optional holiday, check if the user has an approved request (either via Optional Holiday Request or Leave Request)
      if (holiday.type === 'optional') {
        // 1. Check in OptionalHolidayRequest collection
        const approvedOptionalRequest = await OptionalHolidayRequest.findOne({
          userId,
          holidayDate: shiftDay,
          status: 'Approved'
        });

        // 2. Check in Leave collection (restricted_holiday type)
        const approvedLeaveRequest = await mongoose.model('Leave').findOne({
          userId,
          startDate: { $lte: shiftDay },
          endDate: { $gte: shiftDay },
          leaveType: 'restricted_holiday',
          status: 'Approved'
        });

        if (!approvedOptionalRequest && !approvedLeaveRequest) {
          isActuallyHoliday = false;
          console.log(`ℹ️ Date ${shiftDay.toISOString()} is an optional holiday, but user ${userId} has no approved request (OptionalHolidayRequest or Leave). Processing as regular day.`);
        }
      }

      if (isActuallyHoliday) {
        // Update record with holiday information
        record.status = 'holiday_swipe';
        record.attendanceStatus = ['Holiday-Swipe'];

        // Initialize regularization field if it doesn't exist
        if (!record.regularization) {
          record.regularization = {
            isRegularized: true,
            hasRegularizationRequest: false,
            regularizationType: ['Holiday-Swipe'],
            status: 'Approved',
            regularizationId: new Types.ObjectId(), // Generate a new ID
          };
        } else {
          // Update existing regularization safely
          const reg = record.regularization;
          reg.isRegularized = true;
          reg.status = 'Approved';

          if (!reg.regularizationType) {
            reg.regularizationType = ['Holiday-Swipe'];
          } else if (!reg.regularizationType.includes('Holiday-Swipe')) {
            reg.regularizationType.push('Holiday-Swipe');
          }

          record.regularization = reg;
        }

        // Save the updated record
        await record.save();
      }
    }

    return record;
  }

  private convertToIST(date: Date): string {
    // Create a new date object to avoid modifying the original
    const istDate = new Date(date);

    // Add 5 hours and 30 minutes for IST
    istDate.setUTCHours(istDate.getUTCHours() + 5);
    istDate.setUTCMinutes(istDate.getUTCMinutes() + 30);

    // Format time as HH:mm AM/PM
    return istDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  private async validateAndUpdateWindowStatus(
    record: IAttendanceRecord & Document,
    timestamp: Date,
    shiftWindow: IShiftWindow
  ): Promise<{ isValid: boolean; reason?: string }> {

    /* const isWithinWindow = timestamp >= shiftWindow.windowStart && timestamp <= shiftWindow.windowEnd;
     record.isWithinWindow = isWithinWindow;
 
     const prevDayWindowEnd = new Date(shiftWindow.windowEnd);
     prevDayWindowEnd.setUTCDate(prevDayWindowEnd.getUTCDate() - 1);
 
     const nextDayWindowStart = new Date(shiftWindow.windowStart);
     nextDayWindowStart.setUTCDate(nextDayWindowStart.getUTCDate() + 1);
 
     return {
       isValid: isWithinWindow ||
         timestamp <= prevDayWindowEnd ||
         timestamp >= nextDayWindowStart
     };
       */
    // Create window boundaries for previous, current, and next day
    const prevDayWindowEnd = new Date(shiftWindow.windowEnd);
    prevDayWindowEnd.setUTCDate(prevDayWindowEnd.getUTCDate() - 1);

    const nextDayWindowStart = new Date(shiftWindow.windowStart);
    nextDayWindowStart.setUTCDate(nextDayWindowStart.getUTCDate() + 1);

    // Check if swipe is within the current day's window
    const isWithinWindow = timestamp >= shiftWindow.windowStart && timestamp <= shiftWindow.windowEnd;
    record.isWithinWindow = isWithinWindow;
    console.log(isWithinWindow, "isWithinWindow handler")
    if (isWithinWindow) {
      return { isValid: true };
    }
    // Determine the reason for invalid window
    let reason = '';
    if (timestamp < shiftWindow.windowStart) {
      reason = `Too early. Window starts at ${this.convertToIST(shiftWindow.windowStart)} IST`;
    } else if (timestamp > shiftWindow.windowEnd) {
      reason = `Too late. Window ends at${this.convertToIST(shiftWindow.windowEnd)} IST`;
    }

    // Check if the swipe belongs to previous or next day's window
    const isPrevDayWindow = timestamp <= prevDayWindowEnd;
    const isNextDayWindow = timestamp >= nextDayWindowStart;

    if (isPrevDayWindow || isNextDayWindow) {
      reason += ' - Possible wrong shift assignment';
    }

    return {
      isValid: false,
      reason
    };
  }

  private async getDuration(start: Date, end: Date): Promise<string> {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    const diffMs = endTime - startTime; // Difference in milliseconds
    const hours = String(Math.floor(diffMs / (1000 * 60 * 60))).padStart(2, '0');
    const minutes = String(Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
    const seconds = String(Math.floor((diffMs % (1000 * 60)) / 1000)).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
  }


  private async processFirstSwipe(
    record: IAttendanceRecord & Document,
    timestamp: Date,
    shiftWindow: IShiftWindow,
    locationData?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: number;
      address: string;
    }
  ): Promise<void> {

    console.log('🔄 PROCESS FIRST SWIPE CALLED');
    console.log('📍 locationData received:', locationData);
    console.log('📍 shiftWindow:', shiftWindow);

    // Create the IN swipe with actual location data or defaults
    const inSwipe = {
      timestamp,
      direction: 'IN' as const,
      deviceId: 'biometric',
      location: locationData || {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        altitude: 0,
        address: 'unknown'
      }
    };

    console.log('📍 IN swipe being created:', inSwipe);
    console.log('📍 Location in IN swipe:', inSwipe.location);

    const graceTimeMs = (shiftWindow.graceTimeInMinutes || 0) * 60 * 1000;
    const lateThreshold = new Date(shiftWindow.shiftStart.getTime() + graceTimeMs);

    record.swipes = [inSwipe];
    record.firstIn = timestamp;
    record.isLateEntry = timestamp > lateThreshold;
    record.attendanceStatus = record.isLateEntry ? ['Late'] : ['On-Time'];
    // Incomplete attendance (missing checkout) ALWAYS needs regularization
    record.needsRegularization = true;

    let workDuration = await this.getDuration(shiftWindow.shiftStart, shiftWindow.shiftEnd)
    console.log(workDuration, "workDuration")
    // Initialize time calculations
    record.totalWorkHours = '00:00:00';
    record.breakHours = '00:00:00';
    record.shortfallHours = '00:00:00';
    record.excessHours = '00:00:00';
    record.actualWorkHours = "00:00:00";
    record.shiftHours = workDuration || "09:00:00"
    console.log(record, "1st swipe record")
    await record.save();
  }

  private async processSecondSwipe(
    record: IAttendanceRecord & Document,
    timestamp: Date,
    shiftWindow: IShiftWindow,
    locationData?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: number;
      address: string;
    }
  ): Promise<void> {
    console.log('🔄 PROCESS SECOND SWIPE CALLED');
    console.log('📍 locationData received:', locationData);
    console.log('📍 shiftWindow:', shiftWindow);

    // Create the OUT swipe with actual location data or defaults
    const outSwipe = {
      timestamp,
      direction: 'OUT' as const,
      deviceId: 'biometric',
      location: locationData || {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        altitude: 0,
        address: 'unknown'
      }
    };

    console.log('📍 OUT swipe being created:', outSwipe);
    console.log('📍 Location in OUT swipe:', outSwipe.location);

    const graceTimeMs = (shiftWindow.graceTimeInMinutes || 0) * 60 * 1000;
    const earlyExitThreshold = new Date(shiftWindow.shiftEnd.getTime() - graceTimeMs);

    record.swipes.push(outSwipe);
    record.lastOut = timestamp;
    record.isEarlyExit = timestamp < earlyExitThreshold;

    // Calculate metrics
    const metrics = await this.calculateAttendanceMetrics(
      record.firstIn!,
      timestamp,
      shiftWindow.shiftStart,
      shiftWindow.shiftEnd
    );
    console.log(metrics, "2nd swipe metrics")
    // Update all time-related fields
    record.totalWorkHours = metrics.totalWorkHours;
    record.breakHours = metrics.breakHours;
    record.actualWorkHours = metrics.actualWorkHours;
    record.shortfallHours = metrics.shortfallHours;
    record.excessHours = metrics.excessHours;

    // Update attendance status
    if (record.isEarlyExit) {
      record.attendanceStatus.push('Early-Exit');
    }

    // Always mark as Present if not already present (user has swiped in and out)
    if (!record.attendanceStatus.includes('Present')) {
      record.attendanceStatus.push('Present');
    }

    // Check if this is a half-day leave day - preserve 'On-Leave' status if present
    // This handles the case where swipes are added AFTER half-day leave approval
    if (record.halfType && !record.attendanceStatus.includes('On-Leave')) {
      // Check if there's an approved half-day leave for this date
      const { Leave } = await import('../models/leave.model');
      const approvedHalfDayLeave = await Leave.findOne({
        userId: record.userId,
        shiftDay: record.shiftDay,
        status: 'Approved',
        leaveDuration: 'half-day',
      });

      if (approvedHalfDayLeave) {
        // Preserve 'On-Leave' status for half-day leave
        record.attendanceStatus.push('On-Leave');
      }
    }

    // Update regularization flag
    record.needsRegularization =
      record.isLateEntry ||
      record.isEarlyExit ||
      metrics.hasShortfall ||
      !record.isWithinWindow;
    console.log(record, "2nd swipe record")
    await record.save();
  }

  private async processMultipleSwipes(
    record: IAttendanceRecord & Document,
    timestamp: Date,
    direction: 'IN' | 'OUT',
    shiftWindow: IShiftWindow,
    locationData?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: number;
      address: string;
    }
  ): Promise<void> {
    console.log('🔄 PROCESS MULTIPLE SWIPES CALLED');
    console.log('📍 Current swipes count:', record.swipes.length);
    console.log('📍 New swipe direction:', direction);

    // Create the new swipe
    const newSwipe = {
      timestamp,
      direction,
      deviceId: 'biometric',
      location: locationData || {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        altitude: 0,
        address: 'unknown'
      }
    };

    // Add swipe to record
    record.swipes.push(newSwipe);

    // Update firstIn and lastOut based on all swipes
    const validSwipes = record.swipes.filter(s => s.direction === 'IN' || s.direction === 'OUT');
    if (validSwipes.length > 0) {
      const sortedSwipes = [...validSwipes].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const firstInSwipe = sortedSwipes.find(s => s.direction === 'IN');
      const lastOutSwipe = [...sortedSwipes].reverse().find(s => s.direction === 'OUT');

      const graceTimeMs = (shiftWindow.graceTimeInMinutes || 0) * 60 * 1000;
      const lateThreshold = new Date(shiftWindow.shiftStart.getTime() + graceTimeMs);
      const earlyExitThreshold = new Date(shiftWindow.shiftEnd.getTime() - graceTimeMs);

      if (firstInSwipe) {
        record.firstIn = firstInSwipe.timestamp;
        record.isLateEntry = firstInSwipe.timestamp > lateThreshold;
      }

      if (lastOutSwipe) {
        record.lastOut = lastOutSwipe.timestamp;
        record.isEarlyExit = lastOutSwipe.timestamp < earlyExitThreshold;
      }
    }

    // Calculate metrics using multiple swipe logic
    const metrics = await this.calculateMultipleSwipeMetrics(
      record.swipes,
      shiftWindow.shiftStart,
      shiftWindow.shiftEnd
    );

    // Update all time-related fields
    record.totalWorkHours = metrics.totalWorkHours;
    record.breakHours = metrics.breakHours;
    record.actualWorkHours = metrics.actualWorkHours;
    record.shortfallHours = metrics.shortfallHours;
    record.excessHours = metrics.excessHours;

    // Update attendance status
    if (record.isLateEntry && !record.attendanceStatus.includes('Late')) {
      // Remove 'On-Time' if present and add 'Late'
      record.attendanceStatus = record.attendanceStatus.filter(s => s !== 'On-Time');
      if (!record.attendanceStatus.includes('Late')) {
        record.attendanceStatus.push('Late');
      }
    }
    if (record.isEarlyExit && !record.attendanceStatus.includes('Early-Exit')) {
      record.attendanceStatus.push('Early-Exit');
    }
    if (!record.attendanceStatus.includes('Present')) {
      record.attendanceStatus.push('Present');
    }

    // Check if this is a half-day leave day - preserve 'On-Leave' status if present
    // This handles the case where swipes are added AFTER half-day leave approval
    if (record.halfType && !record.attendanceStatus.includes('On-Leave')) {
      // Check if there's an approved half-day leave for this date
      const { Leave } = await import('../models/leave.model');
      const approvedHalfDayLeave = await Leave.findOne({
        userId: record.userId,
        shiftDay: record.shiftDay,
        status: 'Approved',
        leaveDuration: 'half-day',
      });

      if (approvedHalfDayLeave) {
        // Preserve 'On-Leave' status for half-day leave
        record.attendanceStatus.push('On-Leave');
      }
    }

    // Update regularization flag
    record.needsRegularization =
      record.isLateEntry ||
      record.isEarlyExit ||
      metrics.hasShortfall ||
      !record.isWithinWindow;

    console.log(record, "multiple swipes record")
    await record.save();
  }


  private async calculateAttendanceMetrics(
    firstIn: Date,
    lastOut: Date,
    shiftStart: Date,
    shiftEnd: Date
  ): Promise<IAttendanceMetrics> {
    console.log("c firstIn", firstIn, "c lastOut", lastOut);
    console.log("c shiftStart", shiftStart, "c shiftEnd", shiftEnd)
    // Calculate total duration in minutes
    const totalMinutes = (lastOut.getTime() - firstIn.getTime()) / (1000 * 60);
    const shiftMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60);

    // Default break calculation (can be customized based on your rules)
    const breakMinutes = totalMinutes > 360 ? 30 : 0; // 30 min break for > 6 hours

    // Calculate actual work minutes (for payroll/work hour tracking)
    const actualWorkMinutes = totalMinutes - breakMinutes;

    // Calculate shortfall/excess based on TOTAL work time (not actual work time)
    // This ensures break time doesn't affect shortfall/excess calculation
    const difference = totalMinutes - shiftMinutes;
    console.log(difference, "difference")

    return {
      totalWorkHours: await this.formatDuration(totalMinutes),
      breakHours: await this.formatDuration(breakMinutes),
      actualWorkHours: await this.formatDuration(actualWorkMinutes),
      shiftHours: await this.formatDuration(shiftMinutes),
      shortfallHours: difference < 0 ? await this.formatDuration(Math.abs(difference)) : '00:00:00',
      excessHours: difference > 0 ? await this.formatDuration(difference) : '00:00:00',
      hasShortfall: difference < 0,
      hasExcessHours: difference > 0
    };
  }


  private async formatDuration(minutes: number): Promise<string> {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes % 1) * 60);
    console.log("return ", `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`)
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  private async processOutOfWindowSwipe(
    record: IAttendanceRecord & Document,
    timestamp: Date,
    direction: 'IN' | 'OUT',
    reason: string,
    locationData?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: number;
      address: string;
    }
  ): Promise<void> {
    // Add to outOfWindowSwipes array

    let outOfWindowSwipe = {
      timestamp,
      direction,
      deviceId: 'biometric',
      location: locationData || {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        altitude: 0,
        address: 'unknown'
      },
      reason
    }

    record.outOfWindowSwipes.push(outOfWindowSwipe);

    // Mark for regularization
    record.needsRegularization = true;

    // Update attendance status
    if (!record.attendanceStatus.includes('Out-Of-Window')) {
      record.attendanceStatus.push('Out-Of-Window');
    }
    console.log(record, "88 record ")
    await record.save();
  }

  /**
   * Determines the direction (IN/OUT) for a new swipe based on existing swipes
   */
  private determineSwipeDirection(
    existingSwipes: Array<{ timestamp: Date; direction?: 'IN' | 'OUT' }>
  ): 'IN' | 'OUT' {
    // Filter valid swipes with direction
    const validSwipes = existingSwipes.filter(s => s.direction === 'IN' || s.direction === 'OUT');

    if (validSwipes.length === 0) {
      // First swipe must be IN
      return 'IN';
    }

    // Get the last swipe
    const lastSwipe = validSwipes[validSwipes.length - 1];

    // Alternate: if last was IN, next should be OUT, and vice versa
    return lastSwipe.direction === 'IN' ? 'OUT' : 'IN';
  }

  /**
   * Validates a new swipe before adding it to the record
   */
  private validateSwipe(
    currentSwipes: Array<{ timestamp: Date; direction?: 'IN' | 'OUT' }>,
    newSwipe: { timestamp: Date; direction: 'IN' | 'OUT' }
  ): { valid: boolean; reason?: string } {
    // Filter valid swipes
    const validSwipes = currentSwipes.filter(s => s.direction === 'IN' || s.direction === 'OUT');

    // First swipe must be IN
    if (validSwipes.length === 0 && newSwipe.direction !== 'IN') {
      return { valid: false, reason: 'First swipe must be IN' };
    }

    // Check for duplicate swipes (same timestamp within 1 second) - optimized for faster processing
    if (validSwipes.length > 0) {
      const duplicateSwipe = validSwipes.find(s => {
        const timeDiff = Math.abs(newSwipe.timestamp.getTime() - s.timestamp.getTime());
        return timeDiff < 1000; // 1 second tolerance for duplicate detection (optimized from 2 seconds)
      });
      if (duplicateSwipe) {
        return { valid: false, reason: 'Duplicate swipe detected. Please wait a moment before swiping again.' };
      }
    }

    // Check minimum time gap between swipes
    if (validSwipes.length > 0) {
      const lastSwipe = validSwipes[validSwipes.length - 1];
      const timeDiff = newSwipe.timestamp.getTime() - lastSwipe.timestamp.getTime();

      // Allow immediate check-out after check-in (within 3 seconds) - this handles rapid check-in/check-out
      if (lastSwipe.direction === 'IN' && newSwipe.direction === 'OUT' && timeDiff >= 0 && timeDiff < 3000) {
        // Allow immediate check-out after check-in (within 3 seconds)
        // This handles the case where user checks in and immediately checks out
      } else {
        // For multiple swipes (3rd, 4th, etc.), require minimum 2 seconds gap for faster processing
        const minGapSeconds = validSwipes.length >= 2 ? 2 : 3; // 2 seconds for multiple swipes, 3 seconds for first check-out
        if (Math.abs(timeDiff) < minGapSeconds * 1000) {
          return { valid: false, reason: `Please wait at least ${minGapSeconds} seconds between swipes` };
        }
      }
    }

    // Check if direction alternates correctly
    // Note: Direction alternation is already handled by the time gap check above
    // which allows immediate OUT after IN. Here we just ensure same direction swipes
    // are not allowed (except for the immediate OUT after IN case which is already handled)
    if (validSwipes.length > 0) {
      const lastSwipe = validSwipes[validSwipes.length - 1];
      // If directions are the same, it's invalid (except immediate OUT after IN which is handled above)
      if (lastSwipe.direction === newSwipe.direction) {
        return { valid: false, reason: 'Swipe direction must alternate (IN/OUT/IN/OUT)' };
      }
    }

    // Check if swipe is within reasonable time (24 hours from now)
    const now = new Date();
    const timeDiff = Math.abs(newSwipe.timestamp.getTime() - now.getTime());
    const maxHours = 24;
    if (timeDiff > maxHours * 60 * 60 * 1000) {
      return { valid: false, reason: `Swipe time must be within ${maxHours} hours of current time` };
    }

    return { valid: true };
  }

  /**
   * Calculates work sessions from multiple swipes
   */
  private calculateWorkSessions(
    swipes: Array<{ timestamp: Date; direction?: 'IN' | 'OUT' }>,
    _shiftStart: Date, // Kept for API consistency
    shiftEnd: Date
  ): Array<{ sessionNumber: number; inTime: Date; outTime: Date; durationMinutes: number; isOvertime: boolean }> {
    const sessions: Array<{ sessionNumber: number; inTime: Date; outTime: Date; durationMinutes: number; isOvertime: boolean }> = [];

    // Filter and sort swipes
    const validSwipes = swipes
      .filter(s => s.direction === 'IN' || s.direction === 'OUT')
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let i = 0;
    while (i < validSwipes.length) {
      const currentSwipe = validSwipes[i];
      if (currentSwipe.direction === 'IN') {
        const outSwipe = validSwipes[i + 1];
        if (outSwipe && outSwipe.direction === 'OUT') {
          const durationMs = outSwipe.timestamp.getTime() - currentSwipe.timestamp.getTime();
          if (durationMs >= 0) {
            sessions.push({
              sessionNumber: sessions.length + 1,
              inTime: currentSwipe.timestamp,
              outTime: outSwipe.timestamp,
              durationMinutes: durationMs / (1000 * 60),
              isOvertime: outSwipe.timestamp > shiftEnd
            });
          }
          i += 2;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
    return sessions;
  }


  /**
   * Calculates attendance metrics for multiple swipes
   */
  private async calculateMultipleSwipeMetrics(
    swipes: Array<{ timestamp: Date; direction?: 'IN' | 'OUT' }>,
    shiftStart: Date,
    shiftEnd: Date
  ): Promise<IAttendanceMetrics> {
    // 1. Calculate work sessions
    const workSessions = this.calculateWorkSessions(swipes, shiftStart, shiftEnd);

    // 2. Calculate total work minutes (sum of all sessions)
    const totalWorkMinutes = workSessions.reduce(
      (sum, session) => sum + session.durationMinutes,
      0
    );

    // 3. Calculate break minutes based on total work hours (not from swipe gaps)
    // Simple rule: 30 minutes break if total work > 6 hours, otherwise 0
    const breakMinutes = totalWorkMinutes > 360 ? 30 : 0;

    // 4. Actual work = total work minus break (for payroll/work hour tracking)
    const actualWorkMinutes = totalWorkMinutes - breakMinutes;

    // 5. Calculate shift duration
    const shiftMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60);

    // 6. Calculate shortfall/excess based on TOTAL work time (not actual work time)
    // This ensures break time doesn't affect shortfall/excess calculation
    const difference = totalWorkMinutes - shiftMinutes;

    return {
      totalWorkHours: await this.formatDuration(totalWorkMinutes),
      breakHours: await this.formatDuration(breakMinutes),
      actualWorkHours: await this.formatDuration(actualWorkMinutes),
      shiftHours: await this.formatDuration(shiftMinutes),
      shortfallHours: difference < 0 ? await this.formatDuration(Math.abs(difference)) : '00:00:00',
      excessHours: difference > 0 ? await this.formatDuration(difference) : '00:00:00',
      hasShortfall: difference < 0,
      hasExcessHours: difference > 0
    };
  }

  async processSwipe(swipeData: ISwipeData): Promise<ISwipeResponse> {
    console.log('🔄 ========== PROCESS SWIPE CALLED ==========');
    console.log('📍 Full swipeData received:');
    console.log('  - biometricId:', swipeData.biometricId);
    console.log('  - timestamp (Date object):', swipeData.timestamp);
    console.log('  - timestamp (ISO string):', swipeData.timestamp.toISOString());
    console.log('  - timestamp (UTC milliseconds):', swipeData.timestamp.getTime());
    console.log('  - timestamp (local string):', swipeData.timestamp.toString());
    console.log('  - location:', swipeData.location);
    console.log('  - hasLocation:', swipeData.hasLocation);
    console.log('  - locationValid:', swipeData.locationValid);
    console.log('  - locationAddress:', swipeData.locationAddress);

    const { biometricId, timestamp, location, hasLocation, locationValid, locationAddress } = swipeData;

    console.log('📍 Extracted values from swipeData:');
    console.log('  - biometricId:', biometricId);
    console.log('  - timestamp:', timestamp);
    console.log('  - timestamp type:', typeof timestamp);
    console.log('  - timestamp instanceof Date:', timestamp instanceof Date);
    console.log('  - location:', location);
    console.log('  - hasLocation:', hasLocation);
    console.log('  - locationValid:', locationValid);
    console.log('  - locationAddress:', locationAddress);

    // Extract location data from the swipe data
    let locationData = undefined;

    if (location) {
      // Use the provided location object directly
      locationData = location;
      console.log('✅ Using location object directly:', locationData);
    } else if (hasLocation && locationValid && locationAddress) {
      // If no location object but we have address, create location data with address
      locationData = {
        latitude: 0, // No GPS coordinates available
        longitude: 0,
        accuracy: 0,
        altitude: 0,
        address: locationAddress
      };
      console.log('⚠️ Using address-only location data:', locationData);
    } else {
      console.log('❌ No location data available');
    }

    console.log('🎯 Final locationData being used:', locationData);

    try {
      // 1. Validate user and get shift assignment
      const user = await this.getUserByBiometricId(biometricId);

      // Ensure country is set (default to 'IN' if not present)
      const userCountry = user.country || 'IN';
      console.log(`📍 Swipe timestamp (UTC): ${timestamp.toISOString()}`);
      console.log(`📍 User country: ${userCountry} (from user.country: ${user.country || 'undefined'})`);

      // 2. Get shift day (OLD BEHAVIOR - UTC date)
      const shiftDay = this.getLocalShiftDay(timestamp, userCountry);
      console.log(`📍 Shift day (UTC date): ${shiftDay.toISOString()}`);

      const shiftAssignment = await this.getCurrentShiftAssignment(user._id, timestamp, user.country);
      const shift = shiftAssignment.shiftId;

      // 3. Get shift window timings (using user's timezone)
      const shiftWindow = this.getShiftTimings(shift, shiftDay, userCountry);
      console.log(user.name, "username", shiftAssignment, "shiftAssignment")
      // 3. Get or create attendance record
      const record = await this.findOrCreateAttendanceRecord(
        user._id,
        shift._id,
        shiftDay,
        shiftAssignment.shiftCode,
        shiftWindow.shiftStart,
        shiftWindow.shiftEnd
      );
      console.log(record, "record")
      // If it's a holiday, handle it differently
      if (record.status === 'holiday_swipe') {
        // Use determineSwipeDirection for consistency
        const direction = this.determineSwipeDirection(record.swipes);
        const swipe = {
          timestamp,
          direction,
          deviceId: 'biometric',
          location: locationData || {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            altitude: 0,
            address: 'holiday_swipe'
          }
        };
        record.swipes.push({
          timestamp: swipe.timestamp,
          direction: swipe.direction as 'IN' | 'OUT',
          deviceId: swipe.deviceId || 'biometric',
          location: swipe.location
        });
        // Update firstIn and lastOut based on all swipes
        const validSwipes = record.swipes.filter(s => s.direction === 'IN' || s.direction === 'OUT');
        if (validSwipes.length > 0) {
          const sortedSwipes = [...validSwipes].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          const firstInSwipe = sortedSwipes.find(s => s.direction === 'IN');
          const lastOutSwipe = [...sortedSwipes].reverse().find(s => s.direction === 'OUT');
          if (firstInSwipe) {
            record.firstIn = firstInSwipe.timestamp;
          }
          if (lastOutSwipe) {
            record.lastOut = lastOutSwipe.timestamp;
          }
        }
        // Note: For holiday swipes, we do NOT add 'Present' - only 'Holiday-Swipe' status is maintained
        // 'Present' is only added for valid working days (handled in processSecondSwipe/processMultipleSwipes)
        await record.save();
        return {
          success: true,
          message: 'Swipe recorded successfully for holiday',
          data: {
            userId: record.userId,
            shiftCode: record.shiftCode,
            shiftDay: record.shiftDay,
            swipeTime: timestamp,
            status: 'holiday_swipe',
            attendanceStatus: record.attendanceStatus,
            isWithinWindow: true,
            needsRegularization: false
          }
        };
      }

      // 4. Validate shift window
      const windowValidation = await this.validateAndUpdateWindowStatus(record, timestamp, shiftWindow);
      console.log(windowValidation, "windowValidation")

      // 5. Determine swipe direction based on existing swipes
      const direction = this.determineSwipeDirection(record.swipes);

      // 6. Validate the new swipe
      const swipeValidation = this.validateSwipe(record.swipes, { timestamp, direction });
      if (!swipeValidation.valid) {
        return {
          success: false,
          message: swipeValidation.reason || 'Invalid swipe'
        };
      }

      // 7. Handle out-of-window swipes
      if (!windowValidation.isValid) {
        await this.processOutOfWindowSwipe(
          record,
          timestamp,
          direction,
          windowValidation.reason || 'Outside allowed window hours',
          locationData
        );
      }

      // 8. Process swipe based on count
      if (record.swipes.length === 0) {
        // First swipe
        await this.processFirstSwipe(record, timestamp, shiftWindow, locationData);
      } else if (record.swipes.length === 1) {
        // Second swipe - use existing method
        await this.processSecondSwipe(record, timestamp, shiftWindow, locationData);
      } else {
        // Third or more swipes - use multiple swipe handler
        await this.processMultipleSwipes(record, timestamp, direction, shiftWindow, locationData);
      }

      // 6. Return success response with out-of-window indication if applicable
      return {
        success: true,
        message: windowValidation.isValid
          ? 'Swipe processed successfully'
          : `Swipe recorded but outside window: ${windowValidation.reason}. Regularization required.`,
        data: {
          userId: record.userId,
          shiftCode: record.shiftCode,
          shiftDay: record.shiftDay,
          swipeTime: timestamp,
          isWithinWindow: record.isWithinWindow,
          firstIn: record.firstIn,
          lastOut: record.lastOut,
          totalWorkHours: record.totalWorkHours,
          breakHours: record.breakHours,
          actualWorkHours: record.actualWorkHours,
          shiftHours: record.shiftHours,
          shortfallHours: record.shortfallHours,
          excessHours: record.excessHours,
          isLateEntry: record.isLateEntry,
          isEarlyExit: record.isEarlyExit,
          status: record.status,
          attendanceStatus: record.attendanceStatus,
          needsRegularization: record.needsRegularization,
          outOfWindowSwipes: record.outOfWindowSwipes.map(swipe => ({
            timestamp: swipe.timestamp,
            direction: swipe.direction!,
            deviceId: swipe.deviceId!,
            location: swipe.location!,
            reason: swipe.reason!
          }))
        }
      };
    } catch (error: any) {
      console.error('Error processing swipe:', error);
      return {
        success: false,
        message: `Error processing swipe: ${error.message}`
      };
    }
  }


  async getAttendanceStatus(userId: string | Types.ObjectId, date: Date) {
    // Get user to determine timezone
    const user = await User.findById(typeof userId === 'string' ? userId : userId.toString()).lean();
    if (!user) {
      throw new Error('User not found');
    }
    const userCountry = (user as any).country || 'IN';

    // Convert the date parameter to shiftDay (OLD BEHAVIOR - UTC date)
    const shiftDay = this.convertDateStringToShiftDay(date, userCountry);

    // Call the shiftServiceAssignment to get shift assignment details



    const records = await AttendanceRecord.find({
      userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId,
      shiftDay,
    }).sort({ shiftCode: 1 });
    console.log(records, "getAttendanceStatus record")
    return {
      success: true,
      data: records.map(record => {
        // Ensure swipes array exists before trying to access its elements
        const swipes = record.swipes || [];
        return {
          shiftCode: record.shiftCode || null,
          status: record.status,
          excessHours: record.excessHours || '0:00:00',
          shortfallHours: record.shortfallHours || '0:00:00',
          // Always include these fields with null values if they don't exist
          firstSwipe: swipes.length > 0 ? swipes[0].timestamp : null,
          lastSwipe: swipes.length > 0 ? swipes[swipes.length - 1].timestamp : null,
        };
      }),
    };
  }

  async getAttendanceRecords(query: IAttendanceRecordsQuery) {
    const { startDate, endDate, userIds, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Normalize dates to UTC day boundaries (OLD BEHAVIOR - UTC date)
    // When frontend sends date strings like "2025-12-13", treat them as UTC dates
    const utcStartDate = new Date(startDate);
    utcStartDate.setUTCHours(0, 0, 0, 0);

    // For end date, we want to include the entire day, so we set it to the start of the next day
    // This ensures we match shiftDay values like 2025-12-15T00:00:00.000Z
    const utcEndDate = new Date(endDate);
    utcEndDate.setUTCHours(0, 0, 0, 0);
    utcEndDate.setUTCDate(utcEndDate.getUTCDate() + 1); // Next day at midnight (exclusive)

    const baseQuery: any = {
      shiftDay: {
        $gte: utcStartDate,
        $lt: utcEndDate  // Use $lt (less than) since utcEndDate is next day at midnight
      }
    };

    if (userIds?.length) {
      baseQuery.userId = {
        $in: userIds.map(id => new Types.ObjectId(id))
      };
    }

    // Calculate total days in the date range
    const totalDays = Math.ceil((utcEndDate.getTime() - utcStartDate.getTime()) / (1000 * 60 * 60 * 24));

    // Get all records for the period
    const allRecords = await AttendanceRecord.find(baseQuery)
      .populate('userId', 'name')
      .sort({ userId: 1, shiftDay: 1 })
      .lean(); // Add lean() for better performance

    console.log('Retrieved records ', allRecords);

    // Fetch WFH data for the same period
    const wfhRecords = await WFH.find({
      userId: baseQuery.userId ? baseQuery.userId : { $exists: true },
      status: 'Approved',
      startDate: { $lte: utcEndDate },
      endDate: { $gte: utcStartDate }
    }).lean();

    // Create map: userId -> Set of WFH dates
    const wfhByUserAndDate = new Map<string, Set<string>>();
    wfhRecords.forEach(wfh => {
      const userId = wfh.userId.toString();
      if (!wfhByUserAndDate.has(userId)) {
        wfhByUserAndDate.set(userId, new Set());
      }

      // Add all dates in the WFH range
      const wfhStart = new Date(wfh.startDate);
      wfhStart.setUTCHours(0, 0, 0, 0);
      const wfhEnd = new Date(wfh.endDate);
      wfhEnd.setUTCHours(23, 59, 59, 999);

      const currentDate = new Date(wfhStart);
      while (currentDate <= wfhEnd) {
        const dateStr = currentDate.toISOString().split('T')[0];
        wfhByUserAndDate.get(userId)!.add(dateStr);
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
    });

    // Initialize Map to store user records
    const userRecords = new Map();

    // Process each record
    for (const record of allRecords) {
      if (!record.userId || !record.userId._id) {
        console.log('Skipping record with invalid userId:', record);
        continue;
      }

      const userId = record.userId._id.toString();
      const userName = (record.userId as any).name;

      // Initialize user record if it doesn't exist
      if (!userRecords.has(userId)) {
        userRecords.set(userId, {
          userId,
          userName,
          records: [],
          summary: {
            totalDays,
            lateDays: 0,
            presentDays: 0,
            regularisedDays: 0,
            leaveDays: 0,
            totalWorkHours: 0,
            averageWorkHours: '00:00'
          }
        });
      }

      const userRecord = userRecords.get(userId);

      // Check if this date is a WFH day for this user
      const shiftDayStr = new Date(record.shiftDay).toISOString().split('T')[0];
      const userWfhDates = wfhByUserAndDate.get(userId);
      const isWFH = userWfhDates && userWfhDates.has(shiftDayStr);

      // Process the record
      const processedRecord = {
        _id: record._id,
        shiftId: record.shiftId,
        shiftDay: record.shiftDay,
        shiftStart: record.shiftStart,
        shiftEnd: record.shiftEnd,
        shiftCode: record.shiftCode,
        status: record.status,
        swipes: record.swipes,

        firstIn: record.firstIn,
        lastOut: record?.lastOut || null,
        attendanceStatus: record.attendanceStatus || [],

        isWithinWindow: record.isWithinWindow,
        isLateEntry: record.isLateEntry,
        isEarlyExit: record.isEarlyExit,
        isWFH: record.isWFH !== undefined ? record.isWFH : (isWFH || false),
        halfType: record.halfType || null,
        needsRegularization: record.needsRegularization,
        excessHours: record.excessHours || '00:00:00',
        shortfallHours: record.shortfallHours || '00:00:00',
        totalWorkHours: record.totalWorkHours,
        breakHours: record.breakHours,
        actualWorkHours: record.actualWorkHours,
        shiftHours: record.shiftHours,
        outOfWindowSwipes: record.outOfWindowSwipes || [],
      };

      // Add the processed record to user's records
      userRecord.records.push(processedRecord);

      // Update summary - now including all status types accurately
      const isActuallyPresent = record.attendanceStatus?.some(s =>
        ['Present', 'Late', 'On-Time', 'Early-Exit', 'Regularized', 'OT', 'Override'].includes(s)
      ) || (record.totalWorkHours && record.totalWorkHours !== '00:00:00' && record.totalWorkHours !== '0:00:00');

      if (isActuallyPresent) {
        userRecord.summary.presentDays++;
        // Add to total work hours for average calculation
        if (record.totalWorkHours) {
          userRecord.summary.totalWorkHours += this.timeStringToHours(record.totalWorkHours);
        }
      }

      if (record.attendanceStatus?.includes('Late')) {
        userRecord.summary.lateDays++;
      }

      if (record.attendanceStatus?.includes('On-Leave')) {
        userRecord.summary.leaveDays++;
      }


      if (record.status === 'regularized' || (record.regularization && record.regularization.isRegularized)) {
        userRecord.summary.regularisedDays++;
      }

    }

    // Calculate average work hours for each user
    userRecords.forEach(userRecord => {
      if (userRecord.summary.presentDays > 0) {
        const avgHours = userRecord.summary.totalWorkHours / userRecord.summary.presentDays;
        userRecord.summary.averageWorkHours = this.hoursToTimeString(avgHours);
      }
      // Remove totalWorkHours from summary before sending to frontend if not needed, 
      // but keeping it doesn't hurt.
    });

    console.log('Users processed:', userRecords.size);

    // Convert Map to array and apply pagination
    const allUsers = Array.from(userRecords.values());
    console.log('Total users before pagination:', allUsers.length);

    const paginatedData = allUsers.slice(skip, skip + limit);
    console.log('Records after pagination:', paginatedData.length);

    return {
      success: true,
      data: paginatedData,
      meta: {
        page,
        limit,
        total: allUsers.length,
        totalPages: Math.ceil(allUsers.length / limit)
      }
    };
  }

  async getAttendanceAndShiftRecords(userId: string, dates: string[]): Promise<any> {
    try {
      console.log(userId, dates, "1 getAttendanceAndShiftRecords")

      // Get user to determine timezone
      const user = await User.findById(userId).lean();
      if (!user) {
        throw new Error('User not found');
      }
      const userCountry = (user as any).country || 'IN';

      // Convert dates to shiftDay format (OLD BEHAVIOR - UTC date)
      const shiftDays = dates.map(date => {
        return this.convertDateStringToShiftDay(date, userCountry);
      });
      console.log(shiftDays, "2 getAttendanceAndShiftRecords shiftDays")
      // Fetch attendance records for the given user and dates
      const attendanceRecords = await AttendanceRecord.find({
        userId: new Types.ObjectId(userId),
        shiftDay: { $in: shiftDays },
      }).lean();
      console.log(attendanceRecords, "3 getAttendanceAndShiftRecords attendanceRecords")
      // Fetch shift assignments for the given user and dates
      const shiftAssignments = await ShiftAssignment.find({
        userId: new Types.ObjectId(userId),
        $or: shiftDays.map(shiftDay => ({
          startDate: { $lte: shiftDay },
          $or: [{ endDate: { $gte: shiftDay } }, { endDate: null }],
        })),
      })
        .populate<{ shiftId: IShift }>('shiftId')
        .lean();
      console.log(shiftAssignments, "4 getAttendanceAndShiftRecords shiftAssignments")

      // Transform shiftAssignments to include only required fields in shiftId
      const transformedShiftAssignments = shiftAssignments.map(assignment => ({
        ...assignment,
        shiftId: assignment.shiftId
          ? {
            _id: assignment.shiftId._id,
            code: assignment.shiftId.code,
            startTime: assignment.shiftId.startTime,
            endTime: assignment.shiftId.endTime,
            shiftWindowStart: assignment.shiftId.shiftWindowStart,
            shiftWindowEnd: assignment.shiftId.shiftWindowEnd,
          }
          : null,
      }));
      console.log(transformedShiftAssignments, "5 getAttendanceAndShiftRecords transformedShiftAssignments")
      // Combine attendance and shift assignment data
      return {
        success: true,
        data: {
          attendanceRecords,
          shiftAssignments: transformedShiftAssignments,
        },
      };
    } catch (error: any) {
      console.error('Error fetching attendance and shift records:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async insertBulkAttendanceRecords(userIds: string[], month: number, year: number, skipRandomLop: boolean = true) {
    try {
      const bulkRecords = [];
      const startDate = new Date(Date.UTC(year, month - 1, 1)); // Start of month UTC
      const endDate = new Date(Date.UTC(year, month, 0)); // End of month UTC

      for (const userId of userIds) {
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Fetch shift assignments for this user overlapping the month
        // We look for assignments where startDate <= monthEnd AND (endDate >= monthStart OR endDate is null)
        const assignments = await ShiftAssignment.find({
          userId: userObjectId,
          startDate: { $lte: endDate },
          $or: [{ endDate: { $gte: startDate } }, { endDate: null }]
        }).populate('shiftId').lean();

        if (!assignments || assignments.length === 0) {
          console.warn(`No shift assignments found for user ${userId} in ${month}/${year}`);
          continue;
        }

        // Identify working days for LOP calculation
        const workingDays: number[] = [];
        for (let i = 1; i <= endDate.getUTCDate(); i++) {
          const currentDate = new Date(Date.UTC(year, month - 1, i));

          // Find active assignment for this day
          const activeAssignment = assignments.find(a => {
            const assignmentStart = new Date(a.startDate);
            const assignmentEnd = a.endDate ? new Date(a.endDate) : new Date(8640000000000000); // Far future
            return currentDate >= assignmentStart && currentDate <= assignmentEnd;
          });

          if (activeAssignment && activeAssignment.shiftId) {
            const dayOfWeek = currentDate.getUTCDay();
            const weekendDays = activeAssignment.weekendDays || [0, 6]; // Default Sat, Sun if not specified
            if (!weekendDays.includes(dayOfWeek)) {
              workingDays.push(i);
            }
          }
        }

        if (workingDays.length === 0) continue;

        // Randomly select one day as LOP (Loss of Pay) simulation ONLY if skipRandomLop is false
        let lopDay = -1;
        if (!skipRandomLop) {
          lopDay = Math.random() < 0.5 ? workingDays[0] : workingDays[workingDays.length - 1];
        }

        // Process each day
        for (let i = 1; i <= endDate.getUTCDate(); i++) {
          // Skip if it is the simulated LOP day
          if (i === lopDay) continue;

          const currentDate = new Date(Date.UTC(year, month - 1, i));

          // Find active assignment for this day
          const activeAssignment = assignments.find(a => {
            const assignmentStart = new Date(a.startDate);
            const assignmentEnd = a.endDate ? new Date(a.endDate) : new Date(8640000000000000);
            return currentDate >= assignmentStart && currentDate <= assignmentEnd;
          });

          // Skip if no active assignment or if it's a weekend
          if (!activeAssignment || !activeAssignment.shiftId) continue;

          const dayOfWeek = currentDate.getUTCDay();
          const weekendDays = activeAssignment.weekendDays || [0, 6];
          if (weekendDays.includes(dayOfWeek)) continue;

          const shiftDetails = activeAssignment.shiftId as any;

          // Parse shift start/end times (e.g., "09:00", "18:00")
          const [startHour, startMin] = (shiftDetails.startTime || '09:00').split(':').map(Number);
          const [endHour, endMin] = (shiftDetails.endTime || '18:00').split(':').map(Number);
          const gracePeriod = 15; // default grace period if not in shift object

          // Normalize shiftDay to UTC midnight
          const shiftDay = new Date(currentDate);

          // Calculate Shift Start DateTime
          const shiftStart = new Date(currentDate);
          shiftStart.setUTCHours(startHour, startMin, 0, 0);

          // Calculate Shift End DateTime
          const shiftEnd = new Date(currentDate);
          shiftEnd.setUTCHours(endHour, endMin, 0, 0);

          // Handle overnight shifts (if end time is before start time)
          if (shiftEnd < shiftStart) {
            shiftEnd.setUTCDate(shiftEnd.getUTCDate() + 1);
          }

          // Grace threshold
          const graceThreshold = new Date(shiftStart.getTime());
          graceThreshold.setUTCMinutes(graceThreshold.getUTCMinutes() + gracePeriod);

          // Generate Random Swipe Times
          // In: Start time + random 0-15 mins
          const firstIn = new Date(shiftStart.getTime());
          firstIn.setUTCMinutes(firstIn.getUTCMinutes() + Math.floor(Math.random() * 15));

          // Out: End time - random 0-15 mins
          const lastOut = new Date(shiftEnd.getTime());
          lastOut.setUTCMinutes(lastOut.getUTCMinutes() - Math.floor(Math.random() * 15));

          // Calculate Flags
          const isLateEntry = firstIn.getTime() > graceThreshold.getTime();
          const isEarlyExit = lastOut.getTime() < shiftEnd.getTime();

          const totalWorkHours = ((lastOut.getTime() - firstIn.getTime()) / (1000 * 60 * 60)).toFixed(2);
          const actualWorkHours = (parseFloat(totalWorkHours) - 1).toFixed(2); // assuming 1hr break
          const shiftDuration = ((shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60 * 60));
          const shortfallHours = (shiftDuration - parseFloat(totalWorkHours)).toFixed(2);

          bulkRecords.push({
            userId: userObjectId,
            shiftId: shiftDetails._id,
            shiftCode: shiftDetails.code,
            shiftDay: shiftDay,
            shiftStart,
            shiftEnd,
            swipes: [
              { timestamp: firstIn, direction: 'IN', deviceId: 'SIMULATOR', location: 'Simulation' },
              { timestamp: lastOut, direction: 'OUT', deviceId: 'SIMULATOR', location: 'Simulation' }
            ],
            firstIn,
            lastOut,
            isWithinWindow: true,
            isLateEntry,
            isEarlyExit,
            needsRegularization: false,
            totalWorkHours,
            breakHours: '01:00',
            actualWorkHours,
            shiftHours: shiftDuration.toFixed(2), // Dynamic shift duration
            shortfallHours: parseFloat(shortfallHours) > 0 ? shortfallHours : '0',
            excessHours: '0',
            status: 'complete',
            attendanceStatus: isLateEntry ? ['Late', 'Present'] : ['On-Time', 'Present'],
            outOfWindowSwipes: [],
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      if (bulkRecords.length > 0) {
        await AttendanceRecord.insertMany(bulkRecords);
      }
      return `Bulk attendance records inserted successfully: ${bulkRecords.length}`;
    } catch (error) {
      console.error('Attendance error:', error);
      return { error: 'Internal Server Error' };
    }
  }

  async getUserAttendanceByDateRanges(userId: string, startDate: string, endDate: string) {
    try {
      console.log("getUserAttendanceByDateRanges", userId, startDate, endDate)
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const utcStartDate = new Date(startDate);
      utcStartDate.setUTCHours(0, 0, 0, 0);

      const utcEndDate = new Date(endDate);
      utcEndDate.setUTCHours(23, 59, 59, 999);

      const records = await AttendanceRecord.find({
        userId: userObjectId,
        shiftDay: {
          $gte: utcStartDate,
          $lte: utcEndDate
        }
      }).sort({ shiftDay: 1 }).lean();
      console.log("getUserAttendanceByDateRanges records")
      console.log(records, "getUserAttendanceByDateRanges records")
      console.log(records.length, "getUserAttendanceByDateRanges records length")
      return {
        success: true,
        data: records
      };
    } catch (error) {
      console.error('Error fetching user attendance:', error);
      return {
        success: false,
        message: 'Error fetching user attendance'
      };
    }
  }

  async deleteUserAttendanceByDateRanges(userId: string, startDate: string, endDate: string) {
    try {
      console.log("deleteUserAttendanceByDateRanges", userId, startDate, endDate)
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const utcStartDate = new Date(startDate);
      utcStartDate.setUTCHours(0, 0, 0, 0);

      const utcEndDate = new Date(endDate);
      utcEndDate.setUTCHours(23, 59, 59, 999);

      const result = await AttendanceRecord.deleteMany({
        userId: userObjectId,
        shiftDay: {
          $gte: utcStartDate,
          $lte: utcEndDate
        }
      });

      console.log("deleteUserAttendanceByDateRanges result", result)
      return {
        success: true,
        message: `${result.deletedCount} attendance records deleted successfully`
      };
    } catch (error) {
      console.error('Error deleting user attendance:', error);
      return {
        success: false,
        message: 'Error deleting user attendance'
      };
    }
  }

  private timeStringToHours(timeStr: string): number {
    if (!timeStr || timeStr === '0:00:00' || timeStr === '00:00:00') return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] + (parts[1] / 60) + (parts[2] / 3600);
    } else if (parts.length === 2) {
      return parts[0] + (parts[1] / 60);
    }
    return parseFloat(timeStr) || 0;
  }

  private hoursToTimeString(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * Generate Weekly Report as Excel based on month
   * Calculates all weeks in the month (including overlapping weeks) and generates report with color coding
   */
  async generateWeeklyReportByMonth(month: string): Promise<Buffer> {
    try {
      // Parse month (YYYY-MM format)
      // Note: In YYYY-MM format, months are 1-indexed (01=January, 12=December)
      // JavaScript Date uses 0-indexed months (0=January, 11=December), so we subtract 1
      const [year, monthNum] = month.split('-').map(Number);
      if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
        throw new Error('Invalid month format. Please use YYYY-MM format (e.g., 2025-11 for November 2025)');
      }

      // Calculate month boundaries (monthNum - 1 converts 1-indexed to 0-indexed for JavaScript Date)
      const firstDayOfMonth = new Date(Date.UTC(year, monthNum - 1, 1));
      const lastDayOfMonth = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

      // Calculate all weeks that fall within this month (including overlapping weeks)
      const weeks: Array<{ weekNumber: number; startDate: Date; endDate: Date }> = [];

      // Start from the first Monday before or on the first day of month
      const firstDay = new Date(firstDayOfMonth);
      const firstDayOfWeek = firstDay.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.

      // Calculate the start of the week (Monday = 1, so we need to go back)
      // ISO week starts on Monday (1), but JavaScript Sunday is 0
      let daysToSubtract = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Convert to Monday-based
      const weekStart = new Date(firstDay);
      weekStart.setUTCDate(firstDay.getUTCDate() - daysToSubtract);
      weekStart.setUTCHours(0, 0, 0, 0);

      // Calculate week number for the first week
      const getWeekNumber = (date: Date): number => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      };

      // Generate all weeks that overlap with the month
      let currentWeekStart = new Date(weekStart);
      let weekNumber = getWeekNumber(currentWeekStart);

      while (currentWeekStart <= lastDayOfMonth) {
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setUTCDate(currentWeekEnd.getUTCDate() + 6);
        currentWeekEnd.setUTCHours(23, 59, 59, 999);

        // Only include weeks that have at least one day in the target month
        if (currentWeekEnd >= firstDayOfMonth && currentWeekStart <= lastDayOfMonth) {
          weeks.push({
            weekNumber,
            startDate: new Date(currentWeekStart),
            endDate: new Date(currentWeekEnd)
          });
        }

        // Move to next week
        currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() + 7);
        weekNumber = getWeekNumber(currentWeekStart);
      }

      // Extended date range to cover all weeks
      const utcStartDate = weeks[0]?.startDate || firstDayOfMonth;
      const utcEndDate = weeks[weeks.length - 1]?.endDate || lastDayOfMonth;

      // Fetch ALL active users (not just those with attendance records)
      const allActiveUsers = await User.find({ active: true })
        .select('_id name employeeCode holidayCalendarId')
        .lean();

      if (allActiveUsers.length === 0) {
        throw new Error('No active users found');
      }

      const allUserIds = allActiveUsers.map(user => user._id.toString());

      // Fetch all attendance records for the date range
      const attendanceRecords = await AttendanceRecord.find({
        shiftDay: {
          $gte: utcStartDate,
          $lte: utcEndDate
        },
        userId: { $in: allUserIds.map(id => new Types.ObjectId(id)) }
      })
        .populate('userId', 'name employeeCode holidayCalendarId')
        .sort({ userId: 1, shiftDay: 1 })
        .lean();

      // Fetch shift assignments for all active users
      const shiftAssignments = await ShiftAssignment.find({
        userId: { $in: allUserIds.map(id => new Types.ObjectId(id)) },
        $or: [
          { endDate: null, startDate: { $lte: utcEndDate } },
          { startDate: { $lte: utcEndDate }, endDate: { $gte: utcStartDate } }
        ]
      })
        .lean();

      // Fetch holiday calendars for all active users
      const userHolidayCalendars = await HolidayCalendar.find({
        assignedTo: { $in: allUserIds.map(id => new Types.ObjectId(id)) },
        year: year
      })
        .lean();

      // Create maps for quick lookup
      const shiftAssignmentMap = new Map<string, any[]>();
      shiftAssignments.forEach(assignment => {
        const userId = assignment.userId.toString();
        if (!shiftAssignmentMap.has(userId)) {
          shiftAssignmentMap.set(userId, []);
        }
        shiftAssignmentMap.get(userId)!.push(assignment);
      });

      const holidayMap = new Map<string, Set<string>>(); // userId -> Set of holiday dates (YYYY-MM-DD)
      userHolidayCalendars.forEach(calendar => {
        calendar.assignedTo?.forEach(userId => {
          const userIdStr = userId.toString();
          if (!holidayMap.has(userIdStr)) {
            holidayMap.set(userIdStr, new Set());
          }
          calendar.holidays.forEach(holiday => {
            const holidayDate = new Date(holiday.date);
            const dateStr = `${holidayDate.getUTCFullYear()}-${String(holidayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(holidayDate.getUTCDate()).padStart(2, '0')}`;
            holidayMap.get(userIdStr)!.add(dateStr);
          });
        });
      });

      // Helper function to get weekend days for a user in a week
      // If no shift assignment exists, default to [0,6] (Saturday and Sunday)
      const getWeekendDaysForWeek = (userId: string, weekStart: Date): number[] => {
        const assignments = shiftAssignmentMap.get(userId) || [];
        const weekendDaysSet = new Set<number>();
        let hasAssignment = false;

        // Check each day of the week
        for (let i = 0; i < 7; i++) {
          const checkDate = new Date(weekStart);
          checkDate.setUTCDate(checkDate.getUTCDate() + i);

          const activeAssignment = assignments.find(assignment => {
            const start = new Date(assignment.startDate);
            const end = assignment.endDate ? new Date(assignment.endDate) : new Date('2099-12-31');
            return checkDate >= start && checkDate <= end;
          });

          if (activeAssignment?.weekendDays) {
            hasAssignment = true;
            activeAssignment.weekendDays.forEach((day: number) => weekendDaysSet.add(day));
          }
        }

        // If no shift assignment found, default to [0,6] (Saturday and Sunday)
        if (!hasAssignment) {
          return [0, 6];
        }

        return Array.from(weekendDaysSet);
      };

      // Helper function to check if week has holidays
      const weekHasHoliday = (userId: string, weekStart: Date, weekEnd: Date): boolean => {
        const userHolidays = holidayMap.get(userId);
        if (!userHolidays) return false;

        for (let d = new Date(weekStart); d <= weekEnd; d.setUTCDate(d.getUTCDate() + 1)) {
          const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
          if (userHolidays.has(dateStr)) {
            return true;
          }
        }
        return false;
      };

      // Helper function to format date
      const formatDate = (date: Date): string => {
        const d = new Date(date);
        const day = String(d.getUTCDate()).padStart(2, '0');
        const year = d.getUTCFullYear();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${day} ${monthNames[d.getUTCMonth()]} ${year}`;
      };

      // Group attendance records by user and week
      const userWeekData = new Map<string, Map<number, { records: any[]; totalHours: number }>>();

      attendanceRecords.forEach(record => {
        const userId = (record.userId as any)?._id
          ? (record.userId as any)._id.toString()
          : (record.userId as any).toString();

        // Find which week this record belongs to
        const recordDate = new Date(record.shiftDay);
        const week = weeks.find(w =>
          recordDate >= w.startDate && recordDate <= w.endDate
        );

        if (week) {
          if (!userWeekData.has(userId)) {
            userWeekData.set(userId, new Map());
          }

          const userWeeks = userWeekData.get(userId)!;
          if (!userWeeks.has(week.weekNumber)) {
            userWeeks.set(week.weekNumber, { records: [], totalHours: 0 });
          }

          const weekData = userWeeks.get(week.weekNumber)!;
          weekData.records.push(record);

          // Add hours to total - use totalWorkHours (not actualWorkHours) for cumulative calculation
          const hours = this.timeStringToHours(record.totalWorkHours || '0:00:00');
          weekData.totalHours += hours;
        }
      });

      // Prepare Excel data - one row per employee, weeks as columns
      // Create a map: userId -> { employeeCode, name, weeks: { weekNumber: { hours, shouldBeRed } } }
      const employeeDataMap = new Map<string, {
        employeeCode: string;
        employeeName: string;
        weeks: Map<number, { hours: string; shouldBeRed: boolean }>;
      }>();

      // Initialize all active users
      allActiveUsers.forEach(user => {
        const userId = user._id.toString();
        employeeDataMap.set(userId, {
          employeeCode: user.employeeCode || '',
          employeeName: user.name || '',
          weeks: new Map()
        });
      });

      // Process each week for all users
      weeks.forEach(week => {
        allActiveUsers.forEach(user => {
          const userId = user._id.toString();
          const userWeekDataForWeek = userWeekData.get(userId)?.get(week.weekNumber);
          const totalHours = userWeekDataForWeek?.totalHours || 0;
          const hoursString = this.hoursToTimeString(totalHours);

          // Get weekend days for this week
          const weekendDays = getWeekendDaysForWeek(userId, week.startDate);
          const hasHoliday = weekHasHoliday(userId, week.startDate, week.endDate);

          // Determine color based on required hours
          let shouldBeRed = false;

          if (hasHoliday) {
            shouldBeRed = totalHours < 36;
          } else if (weekendDays.length === 2 && weekendDays.includes(0) && weekendDays.includes(6)) {
            // Weekend is [0,6] - Sat and Sun
            shouldBeRed = totalHours < 45;
          } else if (weekendDays.length === 1 && weekendDays.includes(0)) {
            // Weekend is [0] - Sunday only
            shouldBeRed = totalHours < 54;
          } else {
            // Default: 5 working days = 45 hours (9 hours per day)
            shouldBeRed = totalHours < 45;
          }

          const employeeData = employeeDataMap.get(userId)!;
          employeeData.weeks.set(week.weekNumber, {
            hours: hoursString,
            shouldBeRed: shouldBeRed
          });
        });
      });

      // Convert to array and sort by employee code
      const excelData = Array.from(employeeDataMap.values())
        .sort((a, b) => (a.employeeCode || '').localeCompare(b.employeeCode || ''));

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Weekly Report');

      // Add company header
      const firstWeek = weeks[0];
      const lastWeek = weeks[weeks.length - 1];
      const totalCols = 2 + weeks.length; // Employee No, Name, and one column per week

      worksheet.mergeCells(`A1:${String.fromCharCode(64 + totalCols)}1`);
      const companyCell = worksheet.getCell('A1');
      companyCell.value = 'Cloud Desk Technology Private Limited';
      companyCell.font = { bold: true, size: 14 };
      companyCell.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.mergeCells(`A2:${String.fromCharCode(64 + totalCols)}2`);
      const addressCell = worksheet.getCell('A2');
      addressCell.value = 'No: 51, TEK Meadows, Old Mahabalipuram Rd, Solinganallur, chennai, Tamilnadu-600119';
      addressCell.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.mergeCells(`A3:${String.fromCharCode(64 + totalCols)}3`);
      const reportTitleCell = worksheet.getCell('A3');
      reportTitleCell.value = `Attendance Weekly Summary Report from ${formatDate(firstWeek.startDate)} to ${formatDate(lastWeek.endDate)}`;
      reportTitleCell.font = { bold: true };
      reportTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Table headers row
      const headerRow = worksheet.getRow(5);
      headerRow.getCell(1).value = 'Employee No';
      headerRow.getCell(2).value = 'Name';

      // Add week headers
      weeks.forEach((week, index) => {
        const colIndex = 3 + index;
        const weekHeader = `Week ${week.weekNumber}\n${formatDate(week.startDate)} - ${formatDate(week.endDate)}`;
        headerRow.getCell(colIndex).value = weekHeader;
      });

      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      headerRow.height = 40;

      // Data rows - one row per employee
      excelData.forEach((employee, rowIndex) => {
        const dataRow = worksheet.getRow(6 + rowIndex);
        dataRow.getCell(1).value = employee.employeeCode;
        dataRow.getCell(2).value = employee.employeeName;

        // Add hours for each week
        weeks.forEach((week, weekIndex) => {
          const colIndex = 3 + weekIndex;
          const weekData = employee.weeks.get(week.weekNumber);
          const hoursCell = dataRow.getCell(colIndex);

          if (weekData) {
            hoursCell.value = weekData.hours;
            // Apply color coding
            if (weekData.shouldBeRed) {
              hoursCell.font = { color: { argb: 'FFFF0000' } }; // Red
            } else {
              hoursCell.font = { color: { argb: 'FF000000' } }; // Black
            }
          } else {
            hoursCell.value = '00:00';
            hoursCell.font = { color: { argb: 'FFFF0000' } }; // Red for no data
          }
          hoursCell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      });

      // Set column widths
      worksheet.getColumn(1).width = 18; // Employee No
      worksheet.getColumn(2).width = 30; // Name
      weeks.forEach((_, index) => {
        worksheet.getColumn(3 + index).width = 18; // Each week column
      });

      // Generate Excel buffer
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      return buffer;

    } catch (error: any) {
      console.error('Error generating weekly report:', error);
      throw new Error(`Failed to generate weekly report: ${error.message}`);
    }
  }

  /**
   * Get admin attendance view for all users within a date range
   * Returns simplified attendance data for UI display
   */
  async getAdminAttendanceView(startDate: string, endDate: string): Promise<any> {
    try {
      // Step 1: Normalize dates
      const start = new Date(startDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);

      // Step 2: Generate date range
      const dateRange: string[] = [];
      const currentDate = new Date(start);
      while (currentDate <= end) {
        dateRange.push(currentDate.toISOString().split('T')[0]); // YYYY-MM-DD
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }

      // Step 3: Get all users (with attendance OR active)
      const attendanceUserIds = await AttendanceRecord.distinct('userId', {
        shiftDay: { $gte: start, $lte: end }
      });

      const activeUsers = await User.find({ active: true }).select('_id').lean();

      // Merge unique user IDs
      const allUserIds = new Set([
        ...attendanceUserIds.map(id => id.toString()),
        ...activeUsers.map(u => u._id.toString())
      ]);

      // Get full user details (include holidayCalendarHistory for year-specific calendars)
      const allUsers = await User.find({
        _id: { $in: Array.from(allUserIds).map(id => new Types.ObjectId(id)) }
      })
        .select('_id name employeeCode role active holidayCalendarId holidayCalendarHistory')
        .lean();

      // Step 4: Get attendance records (batch query)
      const attendanceRecords = await AttendanceRecord.find({
        userId: { $in: Array.from(allUserIds).map(id => new Types.ObjectId(id)) },
        shiftDay: { $gte: start, $lte: end }
      })
        .select('_id userId shiftDay status attendanceStatus isWFH halfType totalWorkHours actualWorkHours')
        .lean();

      // Create map: userId -> date -> record
      const attendanceByUserAndDate = new Map<string, Map<string, any>>();
      attendanceRecords.forEach(record => {
        const userId = record.userId.toString();
        // shiftDay is a Date object, normalize to YYYY-MM-DD
        const shiftDayDate = record.shiftDay instanceof Date ? record.shiftDay : new Date(record.shiftDay);
        const dateKey = shiftDayDate.toISOString().split('T')[0];

        if (!attendanceByUserAndDate.has(userId)) {
          attendanceByUserAndDate.set(userId, new Map());
        }
        attendanceByUserAndDate.get(userId)!.set(dateKey, record);
      });

      // Step 5: Get shift assignments
      const shiftAssignments = await ShiftAssignment.find({
        userId: { $in: Array.from(allUserIds).map(id => new Types.ObjectId(id)) },
        $or: [
          { startDate: { $gte: start, $lte: end } },
          { endDate: null, startDate: { $lte: end } },
          { startDate: { $lte: start }, endDate: { $gte: end } },
          { endDate: { $gte: start, $lte: end } }
        ]
      })
        .select('userId startDate endDate weekendDays')
        .lean();

      // Group by userId
      const shiftAssignmentsByUser = new Map<string, any[]>();
      shiftAssignments.forEach(sa => {
        const userId = sa.userId.toString();
        if (!shiftAssignmentsByUser.has(userId)) {
          shiftAssignmentsByUser.set(userId, []);
        }
        shiftAssignmentsByUser.get(userId)!.push(sa);
      });

      // Step 6: Get holiday calendars (holidayCalendarId, assignedTo, and holidayCalendarHistory)
      const allUserIdsArray = Array.from(allUserIds).map(id => new Types.ObjectId(id));

      // Years in the date range (for holidayCalendarHistory)
      const yearsInRange = new Set<number>();
      const cursorForYears = new Date(start);
      while (cursorForYears <= end) {
        yearsInRange.add(cursorForYears.getUTCFullYear());
        cursorForYears.setUTCDate(cursorForYears.getUTCDate() + 1);
      }

      // Collect calendar IDs: holidayCalendarId + from holidayCalendarHistory (active, year in range)
      const holidayCalendarIds = new Set<string>();
      allUsers.forEach(u => {
        if (u.holidayCalendarId) {
          holidayCalendarIds.add(u.holidayCalendarId.toString());
        }
        const history = (u as any).holidayCalendarHistory;
        if (history && Array.isArray(history)) {
          history.forEach((entry: any) => {
            if (entry.isActive === true && yearsInRange.has(entry.year) && entry.calendarId) {
              holidayCalendarIds.add(entry.calendarId.toString());
            }
          });
        }
      });

      const calendarIdsArray = Array.from(holidayCalendarIds).map(id => new Types.ObjectId(id));

      // Fetch all relevant calendars (by ID and assignedTo)
      const calendarsById = await HolidayCalendar.find({
        $or: [
          { _id: { $in: calendarIdsArray } },
          { assignedTo: { $in: allUserIdsArray } }
        ]
      }).select('_id holidays assignedTo year').lean();

      // Create map: userId -> holidays (holidayCalendarId + assignedTo + holidayCalendarHistory per year)
      const holidaysByUser = new Map<string, any[]>();

      const toDateKey = (d: Date | string) => {
        const date = new Date(d);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      };

      allUsers.forEach(user => {
        const userId = user._id.toString();
        const userHolidays: any[] = [];

        // Method 1: holidayCalendarId
        if (user.holidayCalendarId) {
          const calendar = calendarsById.find(
            cal => cal._id.toString() === user.holidayCalendarId!.toString()
          );
          if (calendar && calendar.holidays) {
            calendar.holidays.forEach((h: any) => {
              const dateKey = toDateKey(h.date);
              if (dateRange.includes(dateKey)) {
                userHolidays.push(h);
              }
            });
          }
        }

        // Method 2: assignedTo
        calendarsById.forEach(calendar => {
          if (calendar.assignedTo && calendar.assignedTo.length > 0) {
            const assignedUserIds = calendar.assignedTo.map((id: any) => id.toString());
            if (assignedUserIds.includes(userId) && calendar.holidays) {
              calendar.holidays.forEach((h: any) => {
                const dateKey = toDateKey(h.date);
                if (dateRange.includes(dateKey)) {
                  userHolidays.push(h);
                }
              });
            }
          }
        });

        // Method 3: holidayCalendarHistory (year-specific calendar per year in range)
        const history = (user as any).holidayCalendarHistory;
        if (history && Array.isArray(history)) {
          yearsInRange.forEach(year => {
            const entry = history.find((e: any) => e.year === year && e.isActive === true);
            if (entry && entry.calendarId) {
              const calendar = calendarsById.find(
                cal => cal._id.toString() === entry.calendarId.toString()
              );
              if (calendar && calendar.holidays) {
                calendar.holidays.forEach((h: any) => {
                  const dateKey = toDateKey(h.date);
                  if (dateRange.includes(dateKey)) {
                    userHolidays.push(h);
                  }
                });
              }
            }
          });
        }

        // Remove duplicates (same date + name)
        const uniqueHolidays = Array.from(
          new Map(
            userHolidays.map(h => {
              const dateKey = toDateKey(h.date);
              return [`${dateKey}_${h.name}`, h];
            })
          ).values()
        );

        holidaysByUser.set(userId, uniqueHolidays);
      });

      // Step 6.5: Fetch WFH data for all users
      const wfhRecords = await WFH.find({
        userId: { $in: allUserIdsArray },
        status: 'Approved', // Only approved WFH
        startDate: { $lte: end },
        endDate: { $gte: start }
      }).lean();

      // Create map: userId -> Set of WFH dates
      const wfhByUser = new Map<string, Set<string>>();
      wfhRecords.forEach(wfh => {
        const userId = wfh.userId.toString();
        if (!wfhByUser.has(userId)) {
          wfhByUser.set(userId, new Set());
        }

        // Add all dates in the WFH range
        const wfhStart = new Date(wfh.startDate);
        wfhStart.setUTCHours(0, 0, 0, 0);
        const wfhEnd = new Date(wfh.endDate);
        wfhEnd.setUTCHours(23, 59, 59, 999);

        const currentDate = new Date(wfhStart);
        while (currentDate <= wfhEnd) {
          const dateStr = currentDate.toISOString().split('T')[0];
          wfhByUser.get(userId)!.add(dateStr);
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
      });

      // Step 6.6: Fetch all approved leaves (including restricted holidays)
      const approvedLeaves = await Leave.find({
        userId: { $in: allUserIdsArray },
        status: 'Approved',
        startDate: { $lte: end },
        endDate: { $gte: start }
      }).lean();

      // Create map: userId -> date -> leave type
      // Create map: userId -> date -> leave details
      const leaveByUserAndDate = new Map<string, Map<string, { type: string, duration?: string, halfDayType?: string }>>();
      const approvedRestrictedHolidaysByUser = new Map<string, Set<string>>();

      approvedLeaves.forEach(leave => {
        const userId = leave.userId.toString();

        // Store leave type for each date
        if (!leaveByUserAndDate.has(userId)) {
          leaveByUserAndDate.set(userId, new Map());
        }

        // Add all dates in the leave range
        const leaveStart = new Date(leave.startDate);
        leaveStart.setUTCHours(0, 0, 0, 0);
        const leaveEnd = new Date(leave.endDate);
        leaveEnd.setUTCHours(23, 59, 59, 999);

        const currentDate = new Date(leaveStart);
        while (currentDate <= leaveEnd) {
          const dateStr = currentDate.toISOString().split('T')[0];
          leaveByUserAndDate.get(userId)!.set(dateStr, {
            type: leave.leaveType || 'leave',
            duration: leave.leaveDuration,
            halfDayType: leave.halfDayType
          });

          // Also track restricted holidays separately (for backward compatibility)
          if (leave.leaveType === 'restricted_holiday') {
            if (!approvedRestrictedHolidaysByUser.has(userId)) {
              approvedRestrictedHolidaysByUser.set(userId, new Set());
            }
            approvedRestrictedHolidaysByUser.get(userId)!.add(dateStr);
          }

          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
      });

      // Step 7: Helper function to find shift assignment for a date
      const findShiftAssignmentForDate = (date: Date, shiftAssignments: any[]): any | null => {
        const dateStart = new Date(date);
        dateStart.setUTCHours(0, 0, 0, 0);

        const applicable = shiftAssignments.filter(sa => {
          const saStart = new Date(sa.startDate);
          saStart.setUTCHours(0, 0, 0, 0);
          const saEnd = sa.endDate ? new Date(sa.endDate) : null;
          if (saEnd) saEnd.setUTCHours(23, 59, 59, 999);

          return saStart <= dateStart && (saEnd === null || saEnd >= dateStart);
        });

        if (applicable.length === 0) return null;

        // Use most recent assignment (by startDate descending)
        applicable.sort((a, b) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        );

        return applicable[0];
      };

      // Step 8: Process each user & date – SCENARIO PRIORITY (do not reorder):
      // 1) Leave (only when NOT mandatory holiday): AL/SL/CL/RH/CO/LOP/ML/OP/OU; half-day: AL/P, P/AL, AL/Inc, Inc/AL.
      // 2) Half-type work only (no leave, NOT mandatory holiday): First Half / Second Half.
      // 3) Mandatory holiday: if attendance record exists → record status (e.g. Holiday-Swipe); else → H. Leave never shown.
      // 4) Optional holiday approved (RH): displayLabel = RH.
      // Weekend: isWeekend set; leave still evaluated (weekend hides leave in Excel via isLeave = !!leaveDetails && !att.isWeekend).
      const result = allUsers.map(user => {
        const userId = user._id.toString();
        const userAttendance = attendanceByUserAndDate.get(userId) || new Map();
        const userShiftAssignments = shiftAssignmentsByUser.get(userId) || [];
        const userHolidays = holidaysByUser.get(userId) || [];

        // Create map of holidays by date (use same UTC date key as dateRange)
        const holidaysByDate = new Map<string, any>();
        userHolidays.forEach(holiday => {
          const dateKey = toDateKey(holiday.date);
          holidaysByDate.set(dateKey, holiday);
        });

        // Process each date in range
        const attendance: any[] = [];

        dateRange.forEach(dateStr => {
          const record = userAttendance.get(dateStr);
          const holiday = holidaysByDate.get(dateStr);

          // Find shift assignment for this date (to get weekend days)
          const applicableAssignment = findShiftAssignmentForDate(
            new Date(dateStr),
            userShiftAssignments
          );

          // Check if this date is a weekend
          let isWeekend = false;
          const dateObj = new Date(dateStr);
          const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday

          if (applicableAssignment && applicableAssignment.weekendDays) {
            if (applicableAssignment.weekendDays.includes(dayOfWeek)) {
              isWeekend = true;
            }
          }

          // Build attendance entry
          const attendanceEntry: any = {
            attendanceId: record ? record._id.toString() : null,
            shiftDay: dateStr,
            status: record ? record.status : 'unknown',  // 'unknown' if no record
            attendanceStatus: record ? record.attendanceStatus || [] : [],
            halfType: record ? record.halfType : null,
            totalWorkHours: record ? record.totalWorkHours : null,
            actualWorkHours: record ? record.actualWorkHours : null,
          };

          // Add leave information only if this date is NOT a mandatory holiday (on mandatory holiday show only H)
          const isMandatoryHolidayDate = holiday && holiday.type === 'mandatory';
          const userLeaves = leaveByUserAndDate.get(userId);
          const leaveDetails = userLeaves?.get(dateStr);
          if (leaveDetails && !isMandatoryHolidayDate) {
            attendanceEntry.leaveType = leaveDetails.type;
            attendanceEntry.leaveDuration = leaveDetails.duration;
            attendanceEntry.halfDayType = leaveDetails.halfDayType;

            const leaveAbbr = this.getLeaveAbbr(leaveDetails.type);

            if (leaveDetails.duration === 'half-day') {
              // Check if there is Present attendance (mirrors Excel logic)
              const isPresent = record && (
                record.status === 'complete' ||
                record.status === 'duplicate_swipes' ||
                (record.status === 'incomplete' && record.totalWorkHours && parseFloat(record.totalWorkHours) > 2)
              );

              if (isPresent) {
                attendanceEntry.displayLabel = leaveDetails.halfDayType === 'first-half' ? `${leaveAbbr}/P` : `P/${leaveAbbr}`;
              } else {
                // No work record or not enough hours -> AL/Inc or Inc/AL
                attendanceEntry.displayLabel = leaveDetails.halfDayType === 'first-half' ? `${leaveAbbr}/Inc` : `Inc/${leaveAbbr}`;
              }
            } else {
              attendanceEntry.displayLabel = leaveAbbr;
            }
          } else if (record && record.halfType && !isMandatoryHolidayDate) {
            // Case: Half-Work Only (No Leave Applied)
            if (record.halfType === 'First Half') {
              attendanceEntry.displayLabel = 'First Half (P / Inc)';
            } else if (record.halfType === 'Second Half') {
              attendanceEntry.displayLabel = 'Second Half (Inc / P)';
            }
          }

          // Add weekend flag only if it's a weekend
          if (isWeekend) {
            attendanceEntry.isWeekend = true;
          }

          // Add holiday information if applicable
          if (holiday) {
            attendanceEntry.isHoliday = true;
            attendanceEntry.holidayType = holiday.type; // 'mandatory' or 'optional'
            attendanceEntry.holidayName = holiday.name;

            // Check if this is an approved restricted holiday (optional holiday that was approved)
            if (holiday.type === 'optional') {
              const userApprovedDates = approvedRestrictedHolidaysByUser.get(userId);
              const isApproved = userApprovedDates && userApprovedDates.has(dateStr);
              attendanceEntry.isRestrictedHoliday = isApproved || false;
            }

            // On mandatory holiday: if attendance record exists, show that status (e.g. Holiday-Swipe); else show H.
            if (holiday.type === 'mandatory') {
              if (record && (record.attendanceStatus?.length || record.status)) {
                const statusLabel = record.attendanceStatus?.[0] || this.attendanceStatusToLabel(record.status);
                attendanceEntry.displayLabel = statusLabel || 'H';
              } else {
                attendanceEntry.displayLabel = 'H';
              }
            } else if (holiday.type === 'optional' && attendanceEntry.isRestrictedHoliday) {
              attendanceEntry.displayLabel = 'RH';
            }
          }

          // Add WFH flag if applicable (checks both approved WFH requests AND record flag)
          const userWfhDates = wfhByUser.get(userId);
          if ((userWfhDates && userWfhDates.has(dateStr)) || (record && record.isWFH)) {
            attendanceEntry.isWFH = true;
          }

          attendance.push(attendanceEntry);
        });

        return {
          userId: user._id.toString(),
          userName: user.name,
          employeeCode: user.employeeCode,
          role: user.role,
          active: user.active,
          attendance,
        };
      });

      // Filter out users with no attendance (inactive users only)
      const filteredResult = result.filter(r => r.active || r.attendance.some(a => a.attendanceId !== null));

      return {
        success: true,
        data: filteredResult,
        meta: {
          startDate: startDate,
          endDate: endDate,
          totalUsers: filteredResult.length,
          dateRange: dateRange
        }
      };
    } catch (error: any) {
      console.error('Error in getAdminAttendanceView:', error);
      throw new Error(`Failed to get admin attendance view: ${error.message}`);
    }
  }

  /**
   * Generate Excel file for admin attendance view
   * Reuses existing getAdminAttendanceView() method without modifying its logic
   */
  async generateAdminAttendanceExcel(startDate: string, endDate: string): Promise<Buffer> {
    try {
      // Get data using existing method (NO CHANGES to existing logic)
      const result = await this.getAdminAttendanceView(startDate, endDate);

      if (!result.success || !result.data) {
        throw new Error('Failed to retrieve attendance data');
      }

      const { data, meta } = result;
      const dateRange = meta.dateRange as string[];

      // Fetch WFH data for all users in the date range
      const start = new Date(startDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);

      const allUserIds = data.map((user: any) => new Types.ObjectId(user.userId));

      const wfhRecords = await WFH.find({
        userId: { $in: allUserIds },
        status: 'Approved', // Only show approved WFH
        startDate: { $lte: end },
        endDate: { $gte: start }
      }).lean();

      // Create a map: userId -> Set of WFH dates
      const wfhByUserAndDate = new Map<string, Set<string>>();
      wfhRecords.forEach(wfh => {
        const userId = wfh.userId.toString();
        if (!wfhByUserAndDate.has(userId)) {
          wfhByUserAndDate.set(userId, new Set());
        }

        // Add all dates in the WFH range
        const wfhStart = new Date(wfh.startDate);
        wfhStart.setUTCHours(0, 0, 0, 0);
        const wfhEnd = new Date(wfh.endDate);
        wfhEnd.setUTCHours(23, 59, 59, 999);

        const currentDate = new Date(wfhStart);
        while (currentDate <= wfhEnd) {
          const dateStr = currentDate.toISOString().split('T')[0];
          wfhByUserAndDate.get(userId)!.add(dateStr);
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
      });

      // Fetch Leave data for all users
      const leaveRecords = await Leave.find({
        userId: { $in: allUserIds },
        status: 'Approved', // Only approved leaves
        startDate: { $lte: end },
        endDate: { $gte: start }
      }).lean();

      // Create map: userId -> date -> leave details object
      const leaveByUserAndDate = new Map<string, Map<string, { type: string; duration: string; halfDayType?: string }>>();
      leaveRecords.forEach(leave => {
        const userId = leave.userId.toString();
        if (!leaveByUserAndDate.has(userId)) {
          leaveByUserAndDate.set(userId, new Map());
        }

        // Add all dates in the Leave range with leave type
        const leaveStart = new Date(leave.startDate);
        leaveStart.setUTCHours(0, 0, 0, 0);
        const leaveEnd = new Date(leave.endDate);
        leaveEnd.setUTCHours(23, 59, 59, 999);

        const currentDate = new Date(leaveStart);
        while (currentDate <= leaveEnd) {
          const dateStr = currentDate.toISOString().split('T')[0];
          leaveByUserAndDate.get(userId)!.set(dateStr, {
            type: leave.leaveType || 'leave',
            duration: leave.leaveDuration || 'full-day',
            halfDayType: leave.halfDayType
          });
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
      });

      // Holiday display uses attendance entry flags from getAdminAttendanceView (att.isHoliday, att.holidayType, att.isRestrictedHoliday)
      // so no need to re-fetch calendars (user.holidayCalendarId is not in the view response).

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Attendance Report');

      // Add title row
      worksheet.mergeCells('A1:' + this.getColumnLetter(3 + dateRange.length) + '1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = `Attendance Report: ${startDate} to ${endDate}`;
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Add header row (row 3)
      const headerRow = worksheet.getRow(3);
      headerRow.getCell(1).value = 'Employee Code';
      headerRow.getCell(2).value = 'Employee Name';
      headerRow.getCell(3).value = 'Role';

      // Add date columns
      dateRange.forEach((date, index) => {
        const colIndex = 4 + index;
        headerRow.getCell(colIndex).value = date;
      });

      // Style header row
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD3D3D3' }
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.height = 20;

      // Add data rows
      data.forEach((user: any, userIndex: number) => {
        const dataRow = worksheet.getRow(4 + userIndex);

        dataRow.getCell(1).value = user.employeeCode || '';
        dataRow.getCell(2).value = user.userName || '';
        dataRow.getCell(3).value = user.role || '';

        // Add attendance data for each date
        user.attendance.forEach((att: any, dateIndex: number) => {
          const colIndex = 4 + dateIndex;
          const cell = dataRow.getCell(colIndex);
          const dateStr = dateRange[dateIndex];

          // Check if this user has WFH on this date (check both approved requests and record flag)
          const userWfhDates = wfhByUserAndDate.get(user.userId);
          const isWFH = (userWfhDates && userWfhDates.has(dateStr)) || (att.isWFH === true);

          // Check if this user has Leave on this date
          const userLeaveDates = leaveByUserAndDate.get(user.userId);
          const leaveDetails = userLeaveDates?.get(dateStr); // Now returns { type, duration, halfDayType } or undefined
          // Check if leave exists (and not overridden by weekend logic, though usually leave overrides weekend in display if approved)
          // Note: Previously we checked !att.isWeekend, but if user applied leave ON weekend (e.g. comp off), we should probably show it?
          // For now, keeping existing logic: strictly hide leave if it matches weekend flag
          const isLeave = !!leaveDetails && !att.isWeekend;

          // Determine cell value and styling
          let cellValue = '';
          let fontColor = 'FF000000'; // Black
          // Removed: No background colors (no WFH blue, no weekend gray, no holiday yellow)

          // Get current date (today) at midnight for comparison
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const cellDate = new Date(dateStr);
          cellDate.setHours(0, 0, 0, 0);

          let bgColor: string | undefined;

          // Holiday status from getAdminAttendanceView (att.isHoliday, att.holidayType, att.isRestrictedHoliday)
          const isHoliday = att.isHoliday === true;
          const isMandatoryHoliday = isHoliday && att.holidayType === 'mandatory';
          const isApprovedRestrictedHoliday = isHoliday && att.holidayType === 'optional' && att.isRestrictedHoliday === true;

          // EXCEL CELL VALUE – SCENARIO PRIORITY (do not reorder):
          // 1) Mandatory holiday: record status (e.g. Holiday-Swipe) if record exists, else H.
          // 2) Approved RH: RH.
          // 3) Leave (isLeave = !!leaveDetails && !att.isWeekend): AL/SL/CL/RH/CO/LOP/ML/OP/OU; half-day variants.
          // 4) Today: empty + gray. 5) Future: Off / -. 6) Past no record: Off (weekend) / A (absent).
          // 7) Past with record: Present/WFH, Incomplete/Missing Out/half-type, or other status (human-readable).
          // Set status text: on mandatory holiday, if attendance record exists show that status (e.g. Holiday-Swipe); else H
          if (isMandatoryHoliday) {
            if (att.attendanceId && (att.attendanceStatus?.length || att.status)) {
              const statusLabel = att.attendanceStatus?.[0] || this.attendanceStatusToLabel(att.status);
              cellValue = statusLabel || 'H';
              fontColor = 'FF800080'; // Purple for holiday-related status
            } else {
              cellValue = 'H';
              fontColor = 'FF800080'; // Purple for mandatory holiday
            }
          } else if (isApprovedRestrictedHoliday) {
            cellValue = 'RH';
            fontColor = 'FF800080'; // Purple for restricted/optional holiday
          } else if (isLeave) {
            const typeStr = (leaveDetails as any).type;
            const duration = (leaveDetails as any).duration;
            const halfDayType = (leaveDetails as any).halfDayType;
            const leaveAbbr = this.getLeaveAbbr(typeStr);
            let leaveColor = 'FF0000FF'; // Blue
            if (leaveAbbr === 'LOP') leaveColor = 'FFFF0000'; // Red for Loss of Pay

            // Handle Half-Day Logic
            const isHalfDay = duration === 'half-day' || !!att.halfType;
            if (isHalfDay) {
              // Check if there is Present attendance (Work)
              const isPresent = (att.status === 'complete' || att.status === 'duplicate_swipes' ||
                (att.status === 'incomplete' && att.totalWorkHours && parseFloat(att.totalWorkHours) > 2) ||
                (att.status === 'incomplete' && att.actualWorkHours && parseFloat(att.actualWorkHours) > 2));

              // Determine which half is Leave and which is Work
              // Priority 1: Use leave record's halfDayType
              // Priority 2: Use attendance record's halfType (inverted)
              let leaveHalf = halfDayType; // 'first-half' or 'second-half'
              if (!leaveHalf && att.halfType) {
                leaveHalf = att.halfType === 'First Half' ? 'second-half' : 'first-half';
              }

              if (isPresent) {
                if (leaveHalf === 'first-half') {
                  // First Half Leave, Second Half Present -> AL/P
                  cellValue = `${leaveAbbr}/P`;
                } else {
                  // Second Half Leave, First Half Present -> P/AL
                  cellValue = `P/${leaveAbbr}`;
                }
              } else {
                if (leaveHalf === 'first-half') {
                  // First Half Leave, Second Half Missing -> AL/Inc
                  cellValue = `${leaveAbbr}/Inc`;
                } else {
                  // Second Half Leave, First Half Missing -> Inc/AL
                  cellValue = `Inc/${leaveAbbr}`;
                }
              }
            } else {
              // Full Day Leave
              cellValue = leaveAbbr;
            }

            fontColor = leaveColor;
          }

          if (!isMandatoryHoliday && !isApprovedRestrictedHoliday && !isLeave) {
            // Continue with normal logic if not leave or holiday
            if (cellDate.getTime() === today.getTime()) {
              // PRIORITY 3: Check if date is today
              // Today - show empty cell with gray background
              cellValue = '';
              fontColor = 'FF000000'; // Black
              bgColor = 'FFD3D3D3'; // Light gray background for today
            } else if (cellDate > today) {
              // Future date - check if weekend
              if (att.isWeekend) {
                cellValue = 'Off';
                fontColor = 'FF808080'; // Gray
              } else {
                cellValue = '-';
                fontColor = 'FF808080'; // Gray
              }
            } else if (att.status === 'unknown' || !att.attendanceId) {
              // Past date with no attendance
              // Check if it's a weekend with no attendance
              if (att.isWeekend) {
                cellValue = 'Off';
                fontColor = 'FF808080'; // Gray for weekend off
              } else {
                cellValue = 'A';  // Abbreviated "Absent"
                fontColor = 'FFFF0000'; // Red for absent
              }
              // Don't show WFH for absent/off employees (no attendance record)
            } else if (att.status === 'complete' || att.status === 'duplicate_swipes') {
              // Past date with complete attendance
              // Treat duplicate_swipes as Present
              cellValue = 'Present';
              fontColor = 'FF008000'; // Green
              // Add WFH indicator for complete attendance
              if (isWFH) {
                cellValue = 'WFH';
              }
            } else if (att.status === 'incomplete' || att.status === 'missing_checkout') {
              // Past date with incomplete attendance
              // Check for weekend (DB flag only - strictly based on shift assignment)
              if (att.isWeekend) {
                cellValue = 'Off';
                fontColor = 'FF808080'; // Gray
              } else {
                // Determine label for incomplete/missing checkout
                let label = 'Incomplete';
                if (att.status === 'missing_checkout') label = 'Missing Out';

                // If it's a half-day work record (from import/override)
                if (att.halfType) {
                  label = `${att.halfType} (Inc)`;
                }

                cellValue = label;
                fontColor = 'FFFF8C00'; // Orange
                // Add WFH indicator
                if (isWFH) {
                  cellValue = `${cellValue} (WFH)`;
                }
              }
            } else {
              // Past date with other status (holiday_swipe, regularized, overridden, etc.) – use human-readable label
              const otherLabel = att.attendanceStatus?.[0] || this.attendanceStatusToLabel(att.status) || att.status || '';
              cellValue = otherLabel;
              // Add WFH indicator for other statuses with attendance
              if (isWFH) {
                cellValue = `${cellValue} (WFH)`;
              }
            }
          }

          // Removed: Don't add attendance status indicators (Late, Early-Exit, etc.)
          // if (att.attendanceStatus && att.attendanceStatus.length > 0) {
          //   const statusText = att.attendanceStatus.join(', ');
          //   cellValue = `${cellValue} (${statusText})`;
          // }

          cell.value = cellValue;
          cell.font = { color: { argb: fontColor } };

          // Apply background color (only for today's date)
          if (bgColor) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: bgColor }
            };
          }

          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      });

      // Set column widths
      worksheet.getColumn(1).width = 15; // Employee Code
      worksheet.getColumn(2).width = 25; // Employee Name
      worksheet.getColumn(3).width = 15; // Role

      // Set date column widths
      dateRange.forEach((_, index) => {
        worksheet.getColumn(4 + index).width = 20;
      });

      // Add borders to all cells
      const totalRows = 3 + data.length;
      const totalCols = 3 + dateRange.length;

      for (let row = 3; row <= totalRows; row++) {
        for (let col = 1; col <= totalCols; col++) {
          const cell = worksheet.getRow(row).getCell(col);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }
      }

      // Generate Excel buffer
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      return buffer;

    } catch (error: any) {
      console.error('Error generating admin attendance Excel:', error);
      throw new Error(`Failed to generate attendance Excel: ${error.message}`);
    }
  }

  /**
   * Helper method to convert column index to Excel column letter
   */
  /**
   * Single source of truth: leave type -> display abbreviation (view + Excel).
   * Do not change order or remove; add new types at end to avoid affecting existing logic.
   */
  private getLeaveAbbr(typeStr: string): string {
    if (!typeStr) return 'Leave';
    const s = typeStr.toLowerCase();
    if (typeStr === 'restricted_holiday') return 'RH';
    if (typeStr === 'annual_leave' || typeStr === 'annual' || s.includes('annual')) return 'AL';
    if (typeStr === 'sick_leave' || typeStr === 'sick' || s.includes('sick')) return 'SL';
    if (typeStr === 'casual_leave' || typeStr === 'casual' || s.includes('casual')) return 'CL';
    if (typeStr === 'compOff' || s.includes('compoff')) return 'CO';
    if (typeStr === 'loss_of_pay' || typeStr === 'lossOfPay' || s.includes('lop')) return 'LOP';
    if (typeStr === 'maternity' || s.includes('maternity')) return 'ML';
    if (typeStr === 'otherPaid' || s.includes('otherpaid')) return 'OP';
    if (typeStr === 'otherUnpaid' || s.includes('otherunpaid')) return 'OU';
    return 'Leave';
  }

  /**
   * Map attendance record status to display label (e.g. holiday_swipe -> Holiday-Swipe).
   */
  private attendanceStatusToLabel(status: string): string {
    const map: Record<string, string> = {
      holiday_swipe: 'Holiday-Swipe',
      leave_swipe: 'On-Leave',
      pending_regularization: 'Pending-Regularization',
      regularized: 'Regularized',
      overridden: 'Override',
      complete: 'Present',
      duplicate_swipes: 'Present',
      missing_checkout: 'Missing Out',
      incomplete: 'Incomplete',
      unknown: 'No Record',
    };
    return map[status] || status;
  }

  private getColumnLetter(columnNumber: number): string {
    let columnLetter = '';
    while (columnNumber > 0) {
      const remainder = (columnNumber - 1) % 26;
      columnLetter = String.fromCharCode(65 + remainder) + columnLetter;
      columnNumber = Math.floor((columnNumber - 1) / 26);
    }
    return columnLetter;
  }

}


/*
  async processSwipe(swipeData: ISwipeData):Promise<ISwipeResponse> {
  const { biometricId, timestamp } = swipeData;
  console.log(timestamp, "0 timestamp")



  
  // Find user by biometric ID
  const user = await this.getUserByBiometricId(biometricId);

  // Get current shift assignment
  const shiftAssignment = await this.getCurrentShiftAssignment(user._id, timestamp);
  console.log(shiftAssignment, "1,shiftAssignmnet")
  const shift = shiftAssignment.shiftId;

  // Get shift timings
  const shiftDay = new Date(timestamp);
  shiftDay.setUTCHours(0, 0, 0, 0); // Normalize to start of UTC day

  const { shiftStart, shiftEnd, windowStart, windowEnd } = this.getShiftTimings(shift, shiftDay);

  console.log(timestamp, windowStart, windowEnd, "1.0 time,wS,wE")
  // Find or create attendance record
  const record = await this.findOrCreateAttendanceRecord(
    user._id,
    shift._id,
    shiftDay,
    shiftAssignment.shiftCode,
    shiftStart,
    shiftEnd
  );
  console.log(record, "2,record")
  // Initialize arrays if they don't exist
  if (!record.swipes) record.swipes = [];
  if (!record.outOfWindowSwipes) record.outOfWindowSwipes = [];
  if (!record.attendanceStatus) record.attendanceStatus = [];

  // Check if swipe is within window
  const isWithinWindow = timestamp >= windowStart && timestamp <= windowEnd;
  console.log(isWithinWindow, "3,isWithinWindow")
  if (!isWithinWindow) {
    // Determine if this is for previous day or next day's shift
    const prevDayWindowEnd = new Date(windowEnd);
    prevDayWindowEnd.setUTCDate(prevDayWindowEnd.getUTCDate() - 1);
    const nextDayWindowStart = new Date(windowStart);
    nextDayWindowStart.setUTCDate(nextDayWindowStart.getUTCDate() + 1);

    let targetShiftDay = shiftDay;
    let reason: 'before_window' | 'after_window';

    if (timestamp < windowStart) {
      // Check if it belongs to previous day's shift
      if (timestamp <= prevDayWindowEnd) {
        targetShiftDay = new Date(shiftDay);
        targetShiftDay.setUTCDate(targetShiftDay.getUTCDate() - 1);
      }
      reason = 'before_window';
    } else {
      // Check if it belongs to next day's shift
      if (timestamp >= nextDayWindowStart) {
        targetShiftDay = new Date(shiftDay);
        targetShiftDay.setUTCDate(targetShiftDay.getUTCDate() + 1);
      }
      reason = 'after_window';
    }

    // Add to out of window swipes
    record.outOfWindowSwipes.push({
      timestamp: timestamp,
      deviceId: 'biometric',
      location: 'unknown',
      reason: reason
    });
    record.needsRegularization = true;
  } else {
    console.log("else")
  }

  // Add swipe to record and determine type
  const isFirstSwipe = record.swipes.length === 0;
  const isLastSwipeOfDay = timestamp > shiftEnd; // Check if this is potentially a checkout swipe

  record.swipes.push({
    timestamp: timestamp,
    direction: isFirstSwipe ? 'IN' : 'OUT',
    deviceId: 'biometric',
    location: 'unknown',
  });

  // Update status
  if (isFirstSwipe) {
    record.isLateEntry = timestamp > shiftStart;
    record.attendanceStatus = record.isLateEntry ? ['Late'] : ['On-Time'];
  }

  if (isLastSwipeOfDay) {
    record.isEarlyExit = timestamp < shiftEnd;
    if (record.isEarlyExit) {
      record.attendanceStatus.push('Early-Exit');
    }
  }

  // Save record
  await record.save();

  console.log(record, "record")
  return {
    success: true,
    data: {
      userId: user._id,
      shiftCode: shiftAssignment.shiftCode,
      shiftDay: record.shiftDay,
      swipeTime: timestamp,
      isWithinWindow,
      isLateEntry: record.isLateEntry,
      isEarlyExit: record.isEarlyExit,
      needsRegularization: record.needsRegularization,
      status: record.status,
      attendanceStatus: record.attendanceStatus
    },
  };
}
   */
/*
  async getAttendanceRecords(query: IAttendanceRecordsQuery) {
  console.log(query?.userIds)
  const { startDate, endDate, userIds, page, limit } = query;
  const skip = (page - 1) * limit;

  // Normalize dates to UTC day boundaries
  const utcStartDate = new Date(startDate);
  utcStartDate.setUTCHours(0, 0, 0, 0);

  const utcEndDate = new Date(endDate);
  utcEndDate.setUTCHours(23, 59, 59, 999);
  // console.log("1 dates", utcStartDate, utcEndDate)
  // Create base query
  const baseQuery: any = {
    shiftDay: {
      $gte: utcStartDate,
      $lte: utcEndDate
    }
  };
  // console.log("1.1 basequery", baseQuery)
  // Add userIds filter if provided
  if (userIds?.length) {
    baseQuery.userId = {
      $in: userIds.map(id => new Types.ObjectId(id))
    };
  }

  // console.log("1.2 basequery", baseQuery)

  // Calculate total days in the date range
  const totalDays = Math.ceil((utcEndDate.getTime() - utcStartDate.getTime()) / (1000 * 60 * 60 * 24));
  console.log("1.3 total days", totalDays)
  // Get all records for the period without pagination when summary is requested
  const allRecords = await AttendanceRecord.find(baseQuery)
    .populate('userId', 'name')
    .sort({ userId: 1, shiftDay: 1 });

  console.log(allRecords, "2,allRecords")

  // Group records by user
  const userRecords = new Map<string, {
    userId: string;
    userName: string;
    records: any[];
    summary: {
      totalDays: number;
      lateDays: number;
      presentDays: number;
      regularisedDays: number;
      leaveDays: number;
    };
  }>();
  console.log("3.0 , userRec", userRecords)
  allRecords.forEach(record => {
    const userId = record.userId._id.toString();
    const userName = (record.userId as any).name;
    console.log("3.1, userId,name", userId, userName)
    if (!userRecords.has(userId)) {
      console.log("3.2 inside ")
      userRecords.set(userId, {
        userId,
        userName,
        records: [],
        summary: {
          totalDays,
          lateDays: 0,
          presentDays: 0,
          regularisedDays: 0,
          leaveDays: 0
        }
      });
    }
    console.log("3, userRecords", userRecords)
    const userRecord = userRecords.get(userId)!;
    console.log("3.5,userRecord", userRecord)
    // Add record data
    userRecord.records.push({
      shiftDay: record.shiftDay,
      shiftCode: record.shiftCode,
      status: record.status,
      excessHours: record.excessHours || '00:00:00',
      shortfallHours: record.shortfallHours || '00:00:00',
      firstSwipe: record.swipes[0]?.timestamp,
      lastSwipe: record.swipes[record.swipes.length - 1]?.timestamp,
      attendanceStatus: record.attendanceStatus
    });

    // Update summary
    if (record.status === 'complete') {
      userRecord.summary.presentDays++;
      if (record.attendanceStatus.includes('Late')) {
        userRecord.summary.lateDays++;
      }
    }
    if (record.needsRegularization) {
      userRecord.summary.regularisedDays++;
    }
  });

  // Convert to array and apply pagination
  const data = Array.from(userRecords.values())
    .slice(skip, skip + limit);

  return {
    success: true,
    data,
    meta: {
      page,
      limit,
      total: userRecords.size,
      totalPages: Math.ceil(userRecords.size / limit)
    }
  };
}
   */
