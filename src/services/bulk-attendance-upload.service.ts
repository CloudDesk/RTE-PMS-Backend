import { Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
// import { IUser } from '../models/user.model';
import { IShift } from '../models/shift.model';
import { IAttendanceRecord } from '../models/attendance-record.model';
import { User } from '../models/user.model';
import { Shift, ShiftAssignment } from '../models/shift.model';
import { AttendanceRecord } from '../models/attendance-record.model';
import { Overtime } from '../models/overtime.model';
import { getManageableExternalUsers } from '../utilis/userHierarchy';
import {
  convertLocalToUTC,
  parseTimezone,
  createShiftDayUTC,
  formatTimeDifference,
  TimezoneConfig,
  detectOvernightShift,
  convertLocalToUTCWithOvernight
} from '../utilis/timezone';

export interface IBulkUploadRow {
  rowNumber: number;
  userId: string;
  userName?: string;
  shiftCode: string;
  shiftName?: string;
  startDate: string;
  endDate?: string;
  weekendDays: string; // Comma-separated numbers (0=Sunday, 1=Monday, etc.)
  attendanceDate: string;
  inTime: string; // HH:mm format (local time)
  outTime: string; // HH:mm format (local time)
  deviceId?: string;
  location?: string;
  timezone?: string; // Optional timezone (e.g., "IST", "UAE", "UTC+5:30")
}

export interface IValidationError {
  rowNumber: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface IValidationResult {
  validRows: IBulkUploadRow[];
  invalidRows: IBulkUploadRow[];
  errors: IValidationError[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    errors: number;
    warnings: number;
    weekendAttendanceCount: number;
  };
}

export interface IBulkUploadPreview {
  success: boolean;
  data: IValidationResult;
  message?: string;
}

export interface IBulkUploadConfirm {
  success: boolean;
  data: {
    shiftAssignmentsCreated: number;
    attendanceRecordsCreated: number;
    overtimeRecordsCreated: number;
    errors: string[];
  };
  message?: string;
}

export class BulkAttendanceUploadService {
  private readonly WEEKEND_WARNING_MESSAGE = 'Attendance on weekend - please confirm';
  private readonly EXTERNAL_USER_ROLE = 'external';

  /**
   * Parse Excel file and extract bulk upload data
   */
  async parseExcelFile(fileBuffer: Buffer): Promise<IBulkUploadRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    
    const worksheet = workbook.getWorksheet(1); // First sheet
    if (!worksheet) {
      throw new Error('No worksheet found in Excel file');
    }

    const rows: IBulkUploadRow[] = [];
    let rowNumber = 2; // Start from row 2 (assuming row 1 is header)

    worksheet.eachRow((row, index) => {
      if (index === 1) return; // Skip header row

      const timezone = this.getCellValue(row, 11); // Timezone column (K)
      const deviceId = this.getCellValue(row, 12); // Device ID column (L)
      const location = this.getCellValue(row, 13); // Location column (M)

      const rowData: IBulkUploadRow = {
        rowNumber,
        userId: this.getCellValue(row, 1),
        userName: this.getCellValue(row, 2),
        shiftCode: this.getCellValue(row, 3),
        shiftName: this.getCellValue(row, 4),
        startDate: this.getCellValue(row, 5),
        endDate: this.getCellValue(row, 6),
        weekendDays: this.getCellValue(row, 7),
        attendanceDate: this.getCellValue(row, 8),
        inTime: this.getCellValue(row, 9),
        outTime: this.getCellValue(row, 10),
        deviceId: deviceId,
        location: location,
        timezone: timezone || this.detectTimezoneFromLocation(location),
      };

      // Only add rows that have essential data
      if (rowData.userId && rowData.shiftCode && rowData.attendanceDate) {
        rows.push(rowData);
      }

      rowNumber++;
    });

    return rows;
  }

  /**
   * Detect timezone from location if not explicitly provided
   */
  private detectTimezoneFromLocation(location?: string): string {
    if (!location) return 'UAE'; // Default to UAE
    
    const locationLower = location.toLowerCase();
    
    if (locationLower.includes('uae') || locationLower.includes('dubai') || locationLower.includes('emirates')) {
      return 'UAE';
    }
    
    if (locationLower.includes('india') || locationLower.includes('indian')) {
      return 'IST';
    }
    
    // Default to UAE
    return 'UAE';
  }

  /**
   * Convert shift time from local to UTC using the same logic as manual attendance
   * This replicates the convertISTtoUTC logic from biometric attendance service
   */
  // private convertShiftTimeToUTC(
  //   shiftTime: string, 
  //   attendanceDate: Date, 
  //   timezoneConfig: TimezoneConfig
  // ): Date {
  //   return convertLocalToUTC(shiftTime, attendanceDate, timezoneConfig);
  // }

  /**
   * Create shift time in UTC from shift time string (stored as IST format)
   * @param shiftTime - Shift time string in HH:mm format (IST)
   * @param attendanceDate - Base date for the shift
   * @returns UTC Date object
  
  private createShiftTimeUTC(shiftTime: string, attendanceDate: Date): Date {
    const [hours, minutes] = shiftTime.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error('Invalid shift time format. Expected HH:mm');
    }

    // Convert IST to UTC (IST is UTC+5:30)
    const convertISTtoUTC = (istHours: number, istMinutes: number): { hours: number; minutes: number } => {
      let utcHours = istHours - 5;
      let utcMinutes = istMinutes - 30;

      if (utcMinutes < 0) {
        utcMinutes += 60;
        utcHours -= 1;
      }

      if (utcHours < 0) {
        utcHours += 24;
      }

      return { hours: utcHours, minutes: utcMinutes };
    };

    const utcTime = convertISTtoUTC(hours, minutes);
    const shiftTimeUTC = new Date(attendanceDate);
    shiftTimeUTC.setUTCHours(utcTime.hours, utcTime.minutes, 0, 0);
    
    return shiftTimeUTC;
  }
*/
    /**
   * Create shift time in UTC from shift time string (stored as UTC format in database)
   * @param shiftTime - Shift time string in HH:mm format (UTC)
   * @param attendanceDate - Base date for the shift
   * @returns UTC Date object
 
  private createShiftTimeFromUTC(shiftTime: string, attendanceDate: Date): Date {
    const [hours, minutes] = shiftTime.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error('Invalid shift time format. Expected HH:mm');
    }

    // Shift times are already in UTC format, just create the Date object
    const shiftTimeUTC = new Date(attendanceDate);
    shiftTimeUTC.setUTCHours(hours, minutes, 0, 0);
    
    return shiftTimeUTC;
  }
  */
  /**
   * Create shift time in local timezone (treating shift times as if they're already in attendance timezone)
   * @param shiftTime - Shift time string in HH:mm format (local timezone)
   * @param attendanceDate - Base date for the shift
   * @returns Date object in local timezone
   */
  private createShiftTimeInLocalTimezone(shiftTime: string, attendanceDate: Date): Date {
    const [hours, minutes] = shiftTime.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error('Invalid shift time format. Expected HH:mm');
    }

    // Create date in local timezone (treating shift times as local times)
    const shiftTimeLocal = new Date(attendanceDate);
    shiftTimeLocal.setHours(hours, minutes, 0, 0);
    
    return shiftTimeLocal;
  }

  /**
   * Validate parsed data and return validation results
   * @param rows - The rows to validate
   * @param currentUserId - The ID of the current user performing validation
   * @param currentUserRole - The role of the current user
   */
  async validateBulkUploadData(
    rows: IBulkUploadRow[],
    currentUserId?: string | Types.ObjectId,
    currentUserRole?: string
  ): Promise<IValidationResult> {
    const validRows: IBulkUploadRow[] = [];
    const invalidRows: IBulkUploadRow[] = [];
    const errors: IValidationError[] = [];
    let weekendAttendanceCount = 0;

    // Track duplicates within the upload file
    const uploadDuplicates = new Map<string, number[]>();
    // const duplicateTracker = new Map<string, number>();

    // Get all unique user IDs and shift codes for batch validation
    const userIds = [...new Set(rows.map(row => row.userId))];
    const shiftCodes = [...new Set(rows.map(row => row.shiftCode))];

    // Get manageable external users if current user info is provided
    let manageableExternalUserIds: Types.ObjectId[] = [];
    if (currentUserId && currentUserRole) {
      manageableExternalUserIds = await getManageableExternalUsers(currentUserId, currentUserRole);
    }

    // Build user query based on hierarchy access
    const userQuery: any = {
      _id: { $in: userIds.map(id => new Types.ObjectId(id)) },
      role: this.EXTERNAL_USER_ROLE 
    };

    // If hierarchy access is enabled, filter by manageable users
    if (manageableExternalUserIds.length > 0) {
      userQuery._id = { 
        $in: userIds
          .map(id => new Types.ObjectId(id))
          .filter(id => manageableExternalUserIds.some(manageableId => manageableId.equals(id)))
      };
    }

    console.log(userQuery,"userQuery in getManageableExternalUsers")
    // Batch fetch users and shifts (include joiningDate for validation)
    const users = await User.find(userQuery).select('_id name email role joiningDate').lean();
    
    const shifts = await Shift.find({ 
      code: { $in: shiftCodes },
      isActive: true 
    }).lean();

    const userMap = new Map(users.map(user => [user._id.toString(), user]));
    const shiftMap = new Map(shifts.map(shift => [shift.code, shift]));

    // First pass: Detect duplicates within the upload file
    for (const row of rows) {
      const duplicateKey = `${row.userId}_${row.attendanceDate}_${row.shiftCode}`;
      
      if (!uploadDuplicates.has(duplicateKey)) {
        uploadDuplicates.set(duplicateKey, []);
      }
      uploadDuplicates.get(duplicateKey)!.push(row.rowNumber);
    }

    // Second pass: Main validation
    for (const row of rows) {
      const rowErrors: IValidationError[] = [];

      // Validate user
      const user = userMap.get(row.userId);
      if (!user) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'userId',
          message: 'User not found or not an external user',
          severity: 'error'
        });
      }

      // Validate shift
      const shift = shiftMap.get(row.shiftCode);
      if (!shift) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftCode',
          message: 'Shift not found or inactive',
          severity: 'error'
        });
      }

      // Validate dates against user's joining date
      if (user && user.joiningDate) {
        const joiningDate = new Date(user.joiningDate);
        joiningDate.setHours(0, 0, 0, 0); // Set to start of day for comparison

        // Validate start date against joining date
        const startDate = this.parseDate(row.startDate);
        if (startDate) {
          const startDateOnly = new Date(startDate);
          startDateOnly.setHours(0, 0, 0, 0);
          
          if (startDateOnly < joiningDate) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'startDate',
              message: `Start date (${row.startDate}) is before user's joining date (${joiningDate.toISOString().split('T')[0]})`,
              severity: 'error'
            });
          }
        }

        // Validate end date against joining date
        const endDate = row.endDate ? this.parseDate(row.endDate) : null;
        if (endDate) {
          const endDateOnly = new Date(endDate);
          endDateOnly.setHours(0, 0, 0, 0);
          
          if (endDateOnly < joiningDate) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'endDate',
              message: `End date (${row.endDate}) is before user's joining date (${joiningDate.toISOString().split('T')[0]})`,
              severity: 'error'
            });
          }
        }

        // Validate attendance date against joining date
        const attendanceDate = this.parseDate(row.attendanceDate);
        if (attendanceDate) {
          const attendanceDateOnly = new Date(attendanceDate);
          attendanceDateOnly.setHours(0, 0, 0, 0);
          
          if (attendanceDateOnly < joiningDate) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'attendanceDate',
              message: `Attendance date (${row.attendanceDate}) is before user's joining date (${joiningDate.toISOString().split('T')[0]})`,
              severity: 'error'
            });
          }
        }
      }

      // Validate dates (reuse parsed dates from joining date validation)
      const startDate = this.parseDate(row.startDate);
      const endDate = row.endDate ? this.parseDate(row.endDate) : null;
      const attendanceDate = this.parseDate(row.attendanceDate);

      if (!startDate) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'startDate',
          message: 'Invalid start date format (expected YYYY-MM-DD)',
          severity: 'error'
        });
      }

      if (endDate && startDate && endDate < startDate) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'endDate',
          message: 'End date must be after start date',
          severity: 'error'
        });
      }

      if (!attendanceDate) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'attendanceDate',
          message: 'Invalid attendance date format (expected YYYY-MM-DD)',
          severity: 'error'
        });
      }

      // Validate times
      if (!this.isValidTimeFormat(row.inTime)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'inTime',
          message: 'Invalid in time format (expected HH:mm)',
          severity: 'error'
        });
      }

      if (!this.isValidTimeFormat(row.outTime)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'outTime',
          message: 'Invalid out time format (expected HH:mm)',
          severity: 'error'
        });
      }

      // Validate weekend days
      const weekendDays = this.parseWeekendDays(row.weekendDays);
      if (weekendDays.length === 0) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'weekendDays',
          message: 'Invalid weekend days format (expected comma-separated numbers 0-6)',
          severity: 'error'
        });
      }

      // Check if attendance is on weekend
      if (attendanceDate && weekendDays.length > 0) {
        const dayOfWeek = attendanceDate.getDay();
        if (weekendDays.includes(dayOfWeek)) {
          weekendAttendanceCount++;
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'attendanceDate',
            message: this.WEEKEND_WARNING_MESSAGE,
            severity: 'warning'
          });
        }
      }

      // Validate time logic
      if (this.isValidTimeFormat(row.inTime) && this.isValidTimeFormat(row.outTime)) {
        const inTime = this.parseTime(row.inTime);
        const outTime = this.parseTime(row.outTime);
        
        if (outTime <= inTime) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'outTime',
            message: 'Out time must be after in time',
            severity: 'error'
          });
        }
      }

      // Check if attendance date is within shift assignment period
      if (startDate && attendanceDate && endDate) {
        if (attendanceDate < startDate || attendanceDate > endDate) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'attendanceDate',
            message: 'Attendance date must be within shift assignment period',
            severity: 'error'
          });
        }
      } else if (startDate && attendanceDate) {
        if (attendanceDate < startDate) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'attendanceDate',
            message: 'Attendance date must be after shift start date',
            severity: 'error'
          });
        }
      }

      // Check for duplicates within the upload file
      const duplicateKey = `${row.userId}_${row.attendanceDate}_${row.shiftCode}`;
      const duplicateRows = uploadDuplicates.get(duplicateKey);
      
      if (duplicateRows && duplicateRows.length > 1) {
        // Find the first occurrence (keep it) and mark others as duplicates
        const isFirstOccurrence = duplicateRows[0] === row.rowNumber;
        
        if (!isFirstOccurrence) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'attendanceDate',
            message: `Duplicate attendance record found within upload file. User ${row.userName || row.userId} already has attendance for ${row.attendanceDate} with shift ${row.shiftCode} in row ${duplicateRows[0]}. Only the first occurrence will be processed.`,
            severity: 'error'
          });
        }
      }

      // Check for potential duplicate attendance records in database
      if (attendanceDate && user) {
        const existingAttendance = await AttendanceRecord.findOne({
          userId: new Types.ObjectId(row.userId),
          shiftDay: attendanceDate,
          shiftCode: row.shiftCode
        });

        if (existingAttendance) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'attendanceDate',
            message: `Attendance record already exists in database for user ${row.userName || row.userId} on ${attendanceDate.toISOString().split('T')[0]} with shift ${row.shiftCode}`,
            severity: 'error'
          });
        }
      }

      // Categorize row based on errors
      const hasErrors = rowErrors.some(error => error.severity === 'error');
      
      // Create a clean copy of the row to avoid any reference issues
      const cleanRow: IBulkUploadRow = {
        rowNumber: row.rowNumber,
        userId: row.userId,
        userName: row.userName,
        shiftCode: row.shiftCode,
        shiftName: row.shiftName,
        startDate: row.startDate,
        endDate: row.endDate,
        weekendDays: row.weekendDays,
        attendanceDate: row.attendanceDate, // Keep as original string
        inTime: row.inTime,
        outTime: row.outTime,
        deviceId: row.deviceId,
        location: row.location
      };
      
      if (hasErrors) {
        invalidRows.push(cleanRow);
      } else {
        validRows.push(cleanRow);
      }

      errors.push(...rowErrors);
    }

    return {
      validRows,
      invalidRows,
      errors,
      summary: {
        totalRows: rows.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        errors: errors.filter(e => e.severity === 'error').length,
        warnings: errors.filter(e => e.severity === 'warning').length,
        weekendAttendanceCount
      }
    };
  }

  /**
   * Confirm and bulk insert shift assignments and attendance records
   * @param validRows - The valid rows to process
   * @param assignedBy - The user ID who is performing the bulk upload
   * @param currentUserRole - The role of the current user (optional, for hierarchy validation)
   */
  async confirmBulkUpload(
    validRows: IBulkUploadRow[], 
    assignedBy: Types.ObjectId,
    currentUserRole?: string
  ): Promise<IBulkUploadConfirm> {
    const errors: string[] = [];
    let shiftAssignmentsCreated = 0;
    let attendanceRecordsCreated = 0;
    let overtimeRecordsCreated = 0;

    try {
      // Validate hierarchy access if role is provided
      if (currentUserRole && currentUserRole !== 'admin') {
        const manageableExternalUserIds = await getManageableExternalUsers(assignedBy, currentUserRole);
        const manageableUserIdsSet = new Set(manageableExternalUserIds.map(id => id.toString()));
        
        // Check if all users in validRows are manageable
        const unmanageableUsers = validRows.filter(row => !manageableUserIdsSet.has(row.userId));
        
        if (unmanageableUsers.length > 0) {
          const unmanageableUserIds = [...new Set(unmanageableUsers.map(row => row.userId))];
                  return {
          success: false,
          data: {
            shiftAssignmentsCreated: 0,
            attendanceRecordsCreated: 0,
            overtimeRecordsCreated: 0,
            errors: [`Access denied: You cannot manage attendance for users: ${unmanageableUserIds.join(', ')}`]
          },
          message: 'Access denied: You can only manage attendance for your subordinates'
        };
        }
      }

      // Group rows by user for independent processing
      const userGroups = this.groupRowsByUser(validRows);

      for (const [userId, userRows] of userGroups) {
        try {
          // Process each user's shifts and attendance independently
          const userResult = await this.processUserShiftsAndAttendance(
            userId,
            userRows,
            assignedBy
          );
          
          shiftAssignmentsCreated += userResult.shiftAssignmentsCreated;
          attendanceRecordsCreated += userResult.attendanceRecordsCreated;
          overtimeRecordsCreated += userResult.overtimeRecordsCreated;
          errors.push(...userResult.errors);

        } catch (error: any) {
          errors.push(`Error processing user ${userId}: ${error.message}`);
        }
      }

      return {
        success: errors.length === 0,
        data: {
          shiftAssignmentsCreated,
          attendanceRecordsCreated,
          overtimeRecordsCreated,
          errors
        },
        message: errors.length === 0 
          ? 'Bulk upload completed successfully' 
          : 'Bulk upload completed with some errors'
      };

    } catch (error: any) {
      return {
        success: false,
        data: {
          shiftAssignmentsCreated: 0,
          attendanceRecordsCreated: 0,
          overtimeRecordsCreated: 0,
          errors: [error.message]
        },
        message: 'Bulk upload failed'
      };
    }
  }

  /**
   * Process shifts and attendance for a single user
   */
  private async processUserShiftsAndAttendance(
    userId: string,
    userRows: IBulkUploadRow[],
    assignedBy: Types.ObjectId
  ): Promise<{
    shiftAssignmentsCreated: number;
    attendanceRecordsCreated: number;
    overtimeRecordsCreated: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let shiftAssignmentsCreated = 0;
    let attendanceRecordsCreated = 0;
    let overtimeRecordsCreated = 0;

    // Group rows by shift code and date range
    const shiftGroups = this.groupRowsByShiftAndDateRange(userRows);

    // Process each shift group
    for (const [shiftKey, shiftRows] of shiftGroups) {
      try {
        const [shiftCode, startDate, endDate] = shiftKey.split('|');
        const firstRow = shiftRows[0];

        // Handle overlapping shift assignments
        const shiftAssignmentMap = await this.handleOverlappingShiftAssignments(
          userId,
          shiftCode,
          startDate,
          endDate,
          firstRow.weekendDays,
          assignedBy,
          parseTimezone(firstRow.timezone)
        );

        shiftAssignmentsCreated += shiftAssignmentMap.size;

        // Create attendance records with correct shift assignment mapping
        const attendanceResult = await this.createAttendanceRecordsWithShiftMapping(
          shiftRows,
          shiftAssignmentMap
        );

        attendanceRecordsCreated += attendanceResult.attendanceRecords.length;
        overtimeRecordsCreated += attendanceResult.overtimeRecordsCreated;

      } catch (error: any) {
        // Check for specific MongoDB duplicate key error
        if (error.code === 11000) {
          const duplicateFields = Object.keys(error.keyPattern || {});
          const duplicateValues = Object.values(error.keyValue || {});
          
          if (duplicateFields.includes('userId') && duplicateFields.includes('shiftDay') && duplicateFields.includes('shiftCode')) {
            errors.push(`Duplicate attendance record found for user ${userId} on date ${duplicateValues[duplicateFields.indexOf('shiftDay')]}. Each user can only have one attendance record per day per shift.`);
          } else {
            errors.push(`Duplicate record found for user ${userId}, shift ${shiftKey}: ${error.message}`);
          }
        } else {
          errors.push(`Error processing user ${userId}, shift ${shiftKey}: ${error.message}`);
        }
      }
    }

          return {
          shiftAssignmentsCreated,
          attendanceRecordsCreated,
          overtimeRecordsCreated,
          errors
    };
  }

  /**
   * Group rows by user
   */
  private groupRowsByUser(rows: IBulkUploadRow[]): Map<string, IBulkUploadRow[]> {
    const groups = new Map<string, IBulkUploadRow[]>();
    
    for (const row of rows) {
      if (!groups.has(row.userId)) {
        groups.set(row.userId, []);
      }
      groups.get(row.userId)!.push(row);
    }
    
    return groups;
  }

  /**
   * Group rows by shift code and date range
   */
  private groupRowsByShiftAndDateRange(rows: IBulkUploadRow[]): Map<string, IBulkUploadRow[]> {
    const groups = new Map<string, IBulkUploadRow[]>();
    
    for (const row of rows) {
      const key = `${row.shiftCode}|${row.startDate}|${row.endDate || 'no-end'}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    }
    
    return groups;
  }

  /**
   * Handle overlapping shift assignments by splitting/updating existing records
   */
  private async handleOverlappingShiftAssignments(
    userId: string,
    shiftCode: string,
    startDate: string,
    endDate: string | undefined,
    weekendDays: string,
    assignedBy: Types.ObjectId,
    timezoneConfig?: TimezoneConfig
  ): Promise<Map<string, Types.ObjectId>> {
    const shift = await Shift.findOne({ code: shiftCode, isActive: true });
    if (!shift) {
      throw new Error(`Shift ${shiftCode} not found`);
    }

    // Use provided timezone config or default to UAE
    const tzConfig = timezoneConfig || { name: 'UAE', offset: 4, offsetMinutes: 0 };
    console.log(tzConfig,"tzConfig")

    // Convert dates to UTC for storage (same logic as manual shift assignment)
    const parsedStartDate = this.parseDate(startDate);
    const parsedEndDate = endDate ? this.parseDate(endDate) : null;
    const parsedWeekendDays = this.parseWeekendDays(weekendDays);

    if (!parsedStartDate) {
      throw new Error('Invalid start date');
    }

    // Find all overlapping shift assignments for this user and shift
    const overlappingAssignments = await ShiftAssignment.find({
      userId: new Types.ObjectId(userId),
      shiftCode,
      $or: [
        // Assignment starts before new end and ends after new start
        {
          startDate: { $lte: parsedEndDate || parsedStartDate },
          $or: [
            { endDate: { $gte: parsedStartDate } },
            { endDate: null }
          ]
        },
        // Assignment starts within new period
        {
          startDate: { $gte: parsedStartDate, $lte: parsedEndDate || parsedStartDate }
        }
      ]
    }).sort({ startDate: 1 });

    const shiftAssignmentMap = new Map<string, Types.ObjectId>();
    const assignmentsToCreate: Array<{
      startDate: Date;
      endDate: Date | undefined;
      weekendDays: number[];
      status: 'past' | 'current';
    }> = [];

    // Process overlapping assignments
    for (const existingAssignment of overlappingAssignments) {
      const existingStart = existingAssignment.startDate;
      const existingEnd = existingAssignment.endDate;

      // Case 1: New assignment completely covers existing
      if (parsedStartDate <= existingStart && 
          (parsedEndDate === null || (existingEnd && parsedEndDate >= existingEnd))) {
        
        // Mark existing as past
        existingAssignment.status = 'past';
        existingAssignment.modifiedBy = assignedBy;
        existingAssignment.modifiedAt = new Date();
        await existingAssignment.save();

        // Add to creation list
        assignmentsToCreate.push({
          startDate: existingStart,
          endDate: existingEnd,
          weekendDays: parsedWeekendDays,
          status: 'current'
        });

      } 
      // Case 2: New assignment overlaps with start of existing
      else if (parsedStartDate <= existingStart && 
               (parsedEndDate === null || (existingEnd && parsedEndDate < existingEnd))) {
        
        // Split existing assignment
        const newEndDate = new Date(parsedEndDate!);
        newEndDate.setDate(newEndDate.getDate() - 1); // Day before new assignment

        // Update existing assignment to end before new period
        existingAssignment.endDate = newEndDate;
        existingAssignment.modifiedBy = assignedBy;
        existingAssignment.modifiedAt = new Date();
        await existingAssignment.save();

        // Add new period to creation list
        assignmentsToCreate.push({
          startDate: parsedStartDate,
          endDate: parsedEndDate === null ? undefined : parsedEndDate,
          weekendDays: parsedWeekendDays,
          status: 'current'
        });

        // Add remaining period to creation list
        if (existingEnd) {
          const remainingStart = new Date(parsedEndDate!);
          assignmentsToCreate.push({
            startDate: remainingStart,
            endDate: existingEnd,
            weekendDays: existingAssignment.weekendDays,
            status: 'current'
          });
        }

      }
      // Case 3: New assignment overlaps with end of existing
      else if (parsedStartDate > existingStart && 
               (parsedEndDate === null || (existingEnd && parsedEndDate >= existingEnd))) {
        
        // Update existing assignment to end before new period
        const newEndDate = new Date(parsedStartDate);
        newEndDate.setDate(newEndDate.getDate() - 1); // Day before new assignment

        existingAssignment.endDate = newEndDate;
        existingAssignment.modifiedBy = assignedBy;
        existingAssignment.modifiedAt = new Date();
        await existingAssignment.save();

        // Add new period to creation list
        assignmentsToCreate.push({
          startDate: parsedStartDate,
          endDate: parsedEndDate === null ? undefined : parsedEndDate,
          weekendDays: parsedWeekendDays,
          status: 'current'
        });

      }
      // Case 4: New assignment is completely within existing
      else if (parsedStartDate > existingStart && 
               (parsedEndDate === null || (existingEnd && parsedEndDate < existingEnd))) {
        
        // Split existing assignment into three parts
        const beforeStart = new Date(parsedStartDate);
        beforeStart.setDate(beforeStart.getDate() - 1);

        const afterEnd = new Date(parsedEndDate!);
        afterEnd.setDate(afterEnd.getDate() + 1);

        // Update existing assignment to end before new period
        existingAssignment.endDate = beforeStart;
        existingAssignment.modifiedBy = assignedBy;
        existingAssignment.modifiedAt = new Date();
        await existingAssignment.save();

        // Add new period to creation list
        assignmentsToCreate.push({
          startDate: parsedStartDate,
          endDate: parsedEndDate === null ? undefined : parsedEndDate,
          weekendDays: parsedWeekendDays,
          status: 'current'
        });

        // Add remaining period to creation list
        if (existingEnd) {
          assignmentsToCreate.push({
            startDate: afterEnd,
            endDate: existingEnd,
            weekendDays: existingAssignment.weekendDays,
            status: 'current'
          });
        }
      }
    }

    // If no overlapping assignments found, create new one
    if (overlappingAssignments.length === 0) {
      assignmentsToCreate.push({
        startDate: parsedStartDate,
        endDate: parsedEndDate === null ? undefined : parsedEndDate,
        weekendDays: parsedWeekendDays,
        status: 'current'
      });
    }

    // Create new shift assignments
    for (const assignmentData of assignmentsToCreate) {
      const newAssignment = new ShiftAssignment({
        userId: new Types.ObjectId(userId),
        shiftId: shift._id,
        shiftCode,
        startDate: assignmentData.startDate,
        endDate: assignmentData.endDate,
        isActive: true,
        status: assignmentData.status,
        weekendDays: assignmentData.weekendDays,
        assignedBy,
        assignedAt: new Date()
      });

      await newAssignment.save();

      // Add to mapping for attendance records
      const key = `${assignmentData.startDate.toISOString().split('T')[0]}_${assignmentData.endDate?.toISOString().split('T')[0] || 'no-end'}`;
      shiftAssignmentMap.set(key, newAssignment._id);
    }

    return shiftAssignmentMap;
  }

  /**
   * Create attendance records with proper shift assignment mapping and timezone conversion
   */
  private async createAttendanceRecordsWithShiftMapping(
    rows: IBulkUploadRow[],
    shiftAssignmentMap: Map<string, Types.ObjectId>
  ): Promise<{ attendanceRecords: IAttendanceRecord[], overtimeRecordsCreated: number }> {
    const attendanceRecords: IAttendanceRecord[] = [];
    let overtimeRecordsCreated = 0;

    for (const row of rows) {
      const shift = await Shift.findOne({ code: row.shiftCode, isActive: true });
      if (!shift) {
        console.warn(`Shift not found for code: ${row.shiftCode}`);
        continue;
      }
      
      console.log('=== Shift Data Retrieved ===');
      console.log('Shift Code:', shift.code);
      console.log('Shift Name:', shift.name);
      console.log('Start Time:', shift.startTime);
      console.log('End Time:', shift.endTime);
      console.log('Window Start:', shift.shiftWindowStart);
      console.log('Window End:', shift.shiftWindowEnd);
      console.log('Is Active:', shift.isActive);
      console.log('==========================');

      const attendanceDate = this.parseDate(row.attendanceDate);
      if (!attendanceDate) continue;

      // Find the correct shift assignment for this attendance date
      const shiftAssignmentId = this.findShiftAssignmentForDate(
        attendanceDate,
        shiftAssignmentMap
      );

      if (!shiftAssignmentId) {
        console.warn(`No shift assignment found for attendance date ${row.attendanceDate}`);
        continue;
      }

      // Parse timezone configuration
      const timezoneConfig = parseTimezone(row.timezone);
      console.log('=== Timezone Configuration ===');
      console.log('Input timezone:', row.timezone);
      console.log('Parsed timezone config:', timezoneConfig);
      console.log('=============================');

      // Create shift day (start of day in UTC)
      const shiftDay = createShiftDayUTC(row.attendanceDate);

      // Shift times in the database appear to be stored in the local timezone, not UTC
      // We need to treat them as if they're already in the attendance timezone
      const shiftStartInAttendanceTZ = this.createShiftTimeInLocalTimezone(shift.startTime, attendanceDate);
      const shiftEndInAttendanceTZ = this.createShiftTimeInLocalTimezone(shift.endTime, attendanceDate);
      
      // Automatically detect if this is an overnight shift based on times
      const isOvernightShift = detectOvernightShift(shift.startTime, shift.endTime);
      
      // For storage, we need UTC times
      const shiftStartUTC = convertLocalToUTC(shift.startTime, attendanceDate, timezoneConfig);
      const shiftEndUTC = convertLocalToUTCWithOvernight(
        shift.endTime, 
        attendanceDate, 
        timezoneConfig, 
        isOvernightShift
      );
      
      console.log('=== Shift Time Conversion Debug ===');
      console.log('Shift Start (Local format in DB):', shift.startTime);
      console.log('Shift End (Local format in DB):', shift.endTime);
      console.log('Is Overnight Shift (Auto-detected):', isOvernightShift);
      console.log('Shift Start (UTC Date):', shiftStartUTC.toISOString());
      console.log('Shift End (UTC Date):', shiftEndUTC.toISOString());
      console.log('Shift Start (Local TZ):', shiftStartInAttendanceTZ.toLocaleString());
      console.log('Shift End (Local TZ):', shiftEndInAttendanceTZ.toLocaleString());
      console.log('Attendance Timezone:', timezoneConfig.name);
      console.log('==================================');

      // Use the automatically adjusted shift end time
      const adjustedShiftEndUTC = shiftEndUTC;

      // Convert attendance times from local to UTC (for storage)
      const inTimeUTC = convertLocalToUTC(row.inTime, attendanceDate, timezoneConfig);
      const outTimeUTC = convertLocalToUTC(row.outTime, attendanceDate, timezoneConfig);
      
      // For comparison, we need attendance times in local timezone
      const inTimeLocal = new Date(attendanceDate);
      const [inHours, inMinutes] = row.inTime.split(':').map(Number);
      inTimeLocal.setHours(inHours, inMinutes, 0, 0);
      
      const outTimeLocal = new Date(attendanceDate);
      const [outHours, outMinutes] = row.outTime.split(':').map(Number);
      outTimeLocal.setHours(outHours, outMinutes, 0, 0);

      // Handle overnight attendance
      const adjustedOutTimeUTC = outTimeUTC <= inTimeUTC ? 
        new Date(outTimeUTC.getTime() + 24 * 60 * 60 * 1000) : outTimeUTC;

      const swipes = [
        {
          timestamp: inTimeUTC,
          direction: 'IN' as const,
          deviceId: row.deviceId || 'BULK_UPLOAD',
          location: row.location || 'Office'
        },
        {
          timestamp: adjustedOutTimeUTC,
          direction: 'OUT' as const,
          deviceId: row.deviceId || 'BULK_UPLOAD',
          location: row.location || 'Office'
        }
      ];

      // Calculate work hours
      const totalWorkMs = adjustedOutTimeUTC.getTime() - inTimeUTC.getTime();
      const totalWorkHours = formatTimeDifference(inTimeUTC, adjustedOutTimeUTC);

      // Calculate shift hours
      const shiftHours = formatTimeDifference(shiftStartUTC, adjustedShiftEndUTC);

      // Calculate overtime hours first to determine if OT applies
      const overtimeHours = this.calculateOvertimeHours(totalWorkMs, adjustedShiftEndUTC.getTime() - shiftStartUTC.getTime());
      const hasOvertime = overtimeHours > 0;
      
      // Create overtime record if applicable
      if (hasOvertime) {
        try {
          await this.createOvertimeRecord(
            new Types.ObjectId(row.userId),
            attendanceDate,
            overtimeHours
          );
          overtimeRecordsCreated++;
        } catch (error: any) {
          console.warn(`Failed to create overtime record for user ${row.userId} on ${row.attendanceDate}: ${error.message}`);
        }
      }

      // Determine status
      let status: IAttendanceRecord['status'] = 'complete';
      if (swipes.length > 2) {
        status = 'duplicate_swipes';
      }

      // Determine attendance status
      const attendanceStatus: IAttendanceRecord['attendanceStatus'] = [];
      
      // Always add "Present" for valid attendance records
      attendanceStatus.push('Present');
      
      // Check if within window (but don't mark as Out-Of-Window if there's overtime)
      console.log('=== Before isWithinShiftWindow Call ===');
      console.log('Shift Object:', {
        code: shift.code,
        startTime: shift.startTime,
        endTime: shift.endTime,
        shiftWindowStart: shift.shiftWindowStart,
        shiftWindowEnd: shift.shiftWindowEnd
      });
      console.log('In Time UTC:', inTimeUTC.toISOString());
      
      const isWithinWindow = this.isWithinShiftWindow(inTimeUTC, shift);
      console.log('isWithinWindow result:', isWithinWindow);
      
      // Only add Out-Of-Window if there's no overtime
      if (!isWithinWindow && !hasOvertime) {
        attendanceStatus.push('Out-Of-Window');
        console.log('Added Out-Of-Window to attendance status (no overtime)');
      }

      // Check if late entry using grace period from shift record
      const gracePeriodMs = (shift.graceTimeInMinutes || 15) * 60 * 1000; // Get from shift record, fallback to 15 min
      console.log(`=== Grace Period Debug ===`);
      console.log(`Shift Code: ${shift.code}`);
      console.log(`Shift Grace Period: ${shift.graceTimeInMinutes || 15} minutes`);
      console.log(`Shift Start (UTC): ${shiftStartUTC.toISOString()}`);
      console.log(`Shift End (UTC): ${adjustedShiftEndUTC.toISOString()}`);
      console.log(`In Time (UTC): ${inTimeUTC.toISOString()}`);
      console.log(`Out Time (UTC): ${adjustedOutTimeUTC.toISOString()}`);
      console.log(`Input In Time (Local): ${row.inTime}`);
      console.log(`Input Out Time (Local): ${row.outTime}`);
      console.log(`Timezone Used: ${timezoneConfig.name} (UTC${timezoneConfig.offset >= 0 ? '+' : ''}${timezoneConfig.offset}${timezoneConfig.offsetMinutes ? ':' + timezoneConfig.offsetMinutes : ''})`);
      console.log(`Shift Start (Local TZ): ${shiftStartInAttendanceTZ.toLocaleString()}`);
      console.log(`Shift End (Local TZ): ${shiftEndInAttendanceTZ.toLocaleString()}`);
      console.log(`==========================`);
      
      // Compare in local timezone for accurate late/early detection
      const lateThreshold = new Date(shiftStartInAttendanceTZ.getTime() + gracePeriodMs);
      const isLateEntry = inTimeLocal > lateThreshold;
      
      if (isLateEntry) {
        attendanceStatus.push('Late');
        console.log(`Late entry: In time ${inTimeLocal.toLocaleString()} is after threshold ${lateThreshold.toLocaleString()} (grace: ${shift.graceTimeInMinutes || 15} min)`);
        console.log(`Time difference: ${Math.round((inTimeLocal.getTime() - lateThreshold.getTime()) / (1000 * 60))} minutes late`);
      } else {
        attendanceStatus.push('On-Time');
        console.log(`On-time entry: In time ${inTimeLocal.toLocaleString()} is within grace period (grace: ${shift.graceTimeInMinutes || 15} min)`);
      }

      // Check if early exit using grace period from shift record
      const earlyExitThreshold = new Date(shiftEndInAttendanceTZ.getTime() - gracePeriodMs);
      const isEarlyExit = outTimeLocal < earlyExitThreshold;
      
      if (isEarlyExit) {
        attendanceStatus.push('Early-Exit');
        console.log(`Early exit: Out time ${outTimeLocal.toLocaleString()} is before threshold ${earlyExitThreshold.toLocaleString()} (grace: ${shift.graceTimeInMinutes || 15} min)`);
        console.log(`Time difference: ${Math.round((earlyExitThreshold.getTime() - outTimeLocal.getTime()) / (1000 * 60))} minutes early`);
      }

      // Add OT status if overtime exists
      if (hasOvertime) {
        attendanceStatus.push('OT');
        console.log('Added OT to attendance status');
      }

      // Check weekend attendance
      const weekendDays = this.parseWeekendDays(row.weekendDays);
      const dayOfWeek = attendanceDate.getDay();
      if (weekendDays.includes(dayOfWeek)) {
        attendanceStatus.push('Holiday-Swipe');
      }

      const attendanceRecord = new AttendanceRecord({
        userId: new Types.ObjectId(row.userId),
        shiftId: shiftAssignmentId, // Use the correct shift assignment ID
        shiftCode: row.shiftCode,
        shiftDay,
        shiftStart: shiftStartUTC,
        shiftEnd: adjustedShiftEndUTC,
        swipes,
        firstIn: inTimeUTC,
        lastOut: adjustedOutTimeUTC,
        isWithinWindow: hasOvertime ? true : isWithinWindow, // If there's overtime, consider it within window
        isLateEntry, // Already calculated with grace period above
        isEarlyExit, // Already calculated with grace period above
        needsRegularization: false,
        totalWorkHours,
        breakHours: '0:00:00', // Default break hours
        actualWorkHours: totalWorkHours,
        shiftHours,
        shortfallHours: '0:00:00', // Will be calculated by pre-save hook
        excessHours: hasOvertime ? this.formatOvertimeHours(overtimeHours) : '0:00:00', // Store calculated overtime hours
        overtimeStart: hasOvertime ? adjustedShiftEndUTC : undefined, // OT starts when shift ends
        overtimeEnd: hasOvertime ? adjustedOutTimeUTC : undefined, // OT ends when employee leaves
        status,
        attendanceStatus,
        outOfWindowSwipes: [], // No out-of-window swipes for bulk upload (handled by isWithinWindow flag)
        regularization: {
          isRegularized: false,
          hasRegularizationRequest: false,
          status: 'Pending'
        }
      });

      attendanceRecords.push(attendanceRecord);
    }

    // Bulk insert attendance records
    if (attendanceRecords.length > 0) {
      await AttendanceRecord.insertMany(attendanceRecords);
    }

    return { attendanceRecords, overtimeRecordsCreated };
  }

  /**
   * Find the correct shift assignment for a given attendance date
   */
  private findShiftAssignmentForDate(
    attendanceDate: Date,
    shiftAssignmentMap: Map<string, Types.ObjectId>
  ): Types.ObjectId | null {
    const attendanceDateStr = attendanceDate.toISOString().split('T')[0];

    for (const [key, shiftAssignmentId] of shiftAssignmentMap) {
      const [startDateStr, endDateStr] = key.split('_');
      
      if (endDateStr === 'no-end') {
        // No end date - check if attendance date is after start date
        if (attendanceDateStr >= startDateStr) {
          return shiftAssignmentId;
        }
      } else {
        // Check if attendance date is within the range
        if (attendanceDateStr >= startDateStr && attendanceDateStr <= endDateStr) {
          return shiftAssignmentId;
        }
      }
    }

    return null;
  }

  /**
   * Generate Excel template for bulk upload with data validation and reference sheets
   * @param currentUserId - The ID of the current user requesting the template
   * @param currentUserRole - The role of the current user
   */
  async generateExcelTemplate(
    currentUserId: string | Types.ObjectId,
    currentUserRole: string
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Get manageable external users based on hierarchy
    const manageableExternalUserIds = await getManageableExternalUsers(currentUserId, currentUserRole);
    console.log(manageableExternalUserIds,"manageableExternalUserIds")
    // Get reference data - only external users the current user can manage
    const users = await User.find({ 
      _id: { $in: manageableExternalUserIds },
      role: this.EXTERNAL_USER_ROLE,
      active: true 
    }).select('_id name email').lean();
    
    const shifts = await Shift.find({ 
      isActive: true 
    }).select('code name startTime endTime').lean();

    console.log(shifts,"getShifts")

    // Create main worksheet
    const mainSheet = workbook.addWorksheet('Bulk Attendance Upload');
    await this.createMainSheet(mainSheet, users, shifts);

    // Create reference sheets
    await this.createUsersReferenceSheet(workbook, users);
    await this.createShiftsReferenceSheet(workbook, shifts);
    await this.createInstructionsSheet(workbook);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Create main worksheet with data validation
   */
  private async createMainSheet(
    worksheet: ExcelJS.Worksheet, 
    users: any[], 
    shifts: any[]
  ): Promise<void> {
    // Define headers
    const headers = [
      'User ID',
      'User Name',
      'Shift Code',
      'Shift Name',
      'Start Date (YYYY-MM-DD)',
      'End Date (YYYY-MM-DD)',
      'Weekend Days (0,1,2,3,4,5,6)',
      'Attendance Date (YYYY-MM-DD)',
      'In Time (HH:mm)',
      'Out Time (HH:mm)',
      'Timezone (IST/UAE/UTC+5:30)',
      'Device ID',
      'Location'
    ];

    // Add header row
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add sample data row
    const sampleRow = worksheet.addRow([
      users.length > 0 ? users[0]._id.toString() : '507f1f77bcf86cd799439011',
      users.length > 0 ? users[0].name : 'John Doe',
      'GEN',
      'General Shift',
      '2025-01-01',
      '2025-12-31',
      '5,6',
      '2025-01-02',
      '09:00',
      '18:00',
      'UAE',
      'DEVICE001',
      'Office Building A'
    ]);

    // Style sample row
    sampleRow.font = { italic: true, color: { argb: 'FF808080' } };

    // Add data validation
    this.addDataValidation(worksheet, users, shifts);

    // Add formatting
    this.addColumnFormatting(worksheet);

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = Math.max(
        column.width || 0,
        Math.max(...headers.map(h => h.length))
      );
    });
  }

  /**
   * Create users reference sheet
   */
  private async createUsersReferenceSheet(workbook: ExcelJS.Workbook, users: any[]): Promise<void> {
    const worksheet = workbook.addWorksheet('Users Reference');
    
    // Add header
    const headerRow = worksheet.addRow(['User ID', 'User Name', 'Email', 'Role']);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add user data
    users.forEach(user => {
      worksheet.addRow([
        user._id.toString(),
        user.name,
        user.email,
        'external'
      ]);
    });

    // Style the sheet
    worksheet.getColumn(1).width = 25; // User ID
    worksheet.getColumn(2).width = 20; // User Name
    worksheet.getColumn(3).width = 25; // Email
    worksheet.getColumn(4).width = 10; // Role

    // Add note based on whether users exist
    worksheet.addRow([]);
    if (users.length === 0) {
      worksheet.addRow(['Note: You don\'t have any subordinates to manage.']);
    } else {
      worksheet.addRow(['Note: Copy User ID from this sheet to the main sheet']);
    }
  }

  /**
   * Create shifts reference sheet
   */
  private async createShiftsReferenceSheet(workbook: ExcelJS.Workbook, shifts: any[]): Promise<void> {
    const worksheet = workbook.addWorksheet('Shifts Reference');
    
    // Add header
    const headerRow = worksheet.addRow(['Shift Code', 'Shift Name', 'Start Time', 'End Time', 'Status']);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add shift data
    shifts.forEach(shift => {
      worksheet.addRow([
        shift.code,
        shift.name,
        shift.startTime,
        shift.endTime,
        'Active'
      ]);
    });

    // Style the sheet
    worksheet.getColumn(1).width = 15; // Shift Code
    worksheet.getColumn(2).width = 20; // Shift Name
    worksheet.getColumn(3).width = 12; // Start Time
    worksheet.getColumn(4).width = 12; // End Time
    worksheet.getColumn(5).width = 10; // Status

    // Add note based on whether shifts exist
    worksheet.addRow([]);
    if (shifts.length === 0) {
      worksheet.addRow(['Note: Please contact admin - currently we don\'t have any active shifts']);
    } else {
      worksheet.addRow(['Note: Copy Shift Code from this sheet to the main sheet']);
    }
  }

  /**
   * Create instructions sheet
   */
  private async createInstructionsSheet(workbook: ExcelJS.Workbook): Promise<void> {
    const worksheet = workbook.addWorksheet('Instructions');
    
    // Add title
    const titleRow = worksheet.addRow(['Bulk Attendance Upload - Instructions']);
    titleRow.font = { bold: true, size: 16 };
    worksheet.addRow([]);

    // Add step-by-step instructions
    const instructions = [
      ['Step 1:', 'Download and open this template'],
      ['Step 2:', 'Go to "Users Reference" sheet to see available external users'],
      ['Step 3:', 'Go to "Shifts Reference" sheet to see available shifts'],
      ['Step 4:', 'Return to "Bulk Attendance Upload" sheet'],
      ['Step 5:', 'Use dropdowns or copy-paste values from reference sheets'],
      ['Step 6:', 'Fill in attendance data for each row'],
      ['Step 7:', 'Save the file and upload it to the system'],
      ['', ''],
      ['Column Guidelines:', ''],
      ['User ID:', 'Use dropdown or copy from Users Reference sheet'],
      ['User Name:', 'Auto-filled when User ID is selected'],
      ['Shift Code:', 'Use dropdown (default: GEN) or copy from Shifts Reference sheet'],
      ['Shift Name:', 'Auto-filled when Shift Code is selected (default: General Shift)'],
      ['Start Date:', 'Shift assignment start date (YYYY-MM-DD)'],
      ['End Date:', 'Shift assignment end date (YYYY-MM-DD) - Optional'],
      ['Weekend Days:', 'Use dropdown: UAE (5,6), India (0,6), or custom'],
      ['Attendance Date:', 'Date of attendance record (YYYY-MM-DD)'],
      ['In Time:', 'Check-in time (HH:mm format) - Local time'],
      ['Out Time:', 'Check-out time (HH:mm format) - Local time'],
      ['Timezone:', 'Timezone for time conversion (default: UAE) - Optional, auto-detected from location'],
      ['Device ID:', 'Device identifier - Optional'],
      ['Location:', 'Location description - Optional'],
      ['', ''],
      ['Weekend Day Numbers:', ''],
      ['0:', 'Sunday'],
      ['1:', 'Monday'],
      ['2:', 'Tuesday'],
      ['3:', 'Wednesday'],
      ['4:', 'Thursday'],
      ['5:', 'Friday'],
      ['6:', 'Saturday'],
      ['', ''],
      ['Common Weekend Configurations:', ''],
      ['UAE:', '5,6 (Friday-Saturday)'],
      ['India:', '0,6 (Sunday-Saturday)'],
      ['US:', '0,6 (Sunday-Saturday)'],
      ['', ''],
      ['Timezone Configurations:', ''],
      ['UAE:', 'UAE Standard Time (UTC+4:00) - Default'],
      ['IST:', 'India Standard Time (UTC+5:30)'],
      ['PST:', 'Pacific Standard Time (UTC-8:00)'],
      ['EST:', 'Eastern Standard Time (UTC-5:00)'],
      ['', ''],
      ['Validation Rules:', ''],
      ['•', 'User ID must be from external users only'],
      ['•', 'Shift Code must be from active shifts only'],
      ['•', 'Dates must be in YYYY-MM-DD format'],
      ['•', 'Times must be in HH:mm format (24-hour) - Local time'],
      ['•', 'Out time must be after in time'],
      ['•', 'Attendance date must be within shift assignment period'],
      ['•', 'Weekend attendance will be flagged as warning'],
      ['•', 'Timezone defaults to UAE if not specified'],
      ['•', 'All times are converted to UTC for storage'],
      ['', ''],
      ['Tips:', ''],
      ['•', 'Use the dropdown lists to avoid errors'],
      ['•', 'Copy-paste from reference sheets for accuracy'],
      ['•', 'Check weekend configurations for your country'],
      ['•', 'Ensure all required fields are filled'],
      ['•', 'Test with a few rows before bulk upload'],
      ['•', 'Default shift code is GEN (General Shift)'],
      ['•', 'Default timezone is UAE'],
      ['•', 'All times are stored in UTC for consistency across locations']
    ];

    instructions.forEach(([label, description]) => {
      const row = worksheet.addRow([label, description]);
      if (label.includes('Step') || label.includes('Column') || label.includes('Weekend') || 
          label.includes('Common') || label.includes('Validation') || label.includes('Tips')) {
        row.font = { bold: true };
      }
    });

    // Style the sheet
    worksheet.getColumn(1).width = 25;
    worksheet.getColumn(2).width = 60;
  }

  /**
   * Add data validation to the main worksheet
   */
  private addDataValidation(worksheet: ExcelJS.Worksheet, users: any[], shifts: any[]): void {
    // User ID validation (Column A)
    if (users.length > 0) {
      const userIds = users.map(u => u._id.toString());
      this.addDropdownValidation(worksheet, 'A', userIds, 2, 1000); // Start from row 2
    }

    // Shift Code validation (Column C) - Default to GEN
    const shiftCodes = ['GEN', ...(shifts.length > 0 ? shifts.map(s => s.code) : [])];
    this.addDropdownValidation(worksheet, 'C', shiftCodes, 2, 1000); // Start from row 2

    // Weekend Days validation (Column G)
    const weekendOptions = [
      '0,6', '1,6', '2,6', '3,6', '4,6', '5,6', '6,0',
      '0,1', '1,2', '2,3', '3,4', '4,5', '5,0',
      '0,1,2', '1,2,3', '2,3,4', '3,4,5', '4,5,6', '5,6,0', '6,0,1',
      '5,6', '0,6', '1,6', '2,6', '3,6', '4,6'
    ];
    this.addDropdownValidation(worksheet, 'G', weekendOptions, 2, 1000);

    // Date validation (Columns E, F, H)
    this.addDateValidation(worksheet, 'E', 2, 1000); // Start Date
    this.addDateValidation(worksheet, 'F', 2, 1000); // End Date
    this.addDateValidation(worksheet, 'H', 2, 1000); // Attendance Date

    // Time validation (Columns I, J)
    this.addTimeValidation(worksheet, 'I', 2, 1000); // In Time
    this.addTimeValidation(worksheet, 'J', 2, 1000); // Out Time

    // Timezone validation (Column K) - Default to UAE
    const timezoneOptions = ['UAE', 'IST', 'UTC+5:30', 'UTC+4:00', 'UTC-8:00', 'UTC-5:00'];
    this.addDropdownValidation(worksheet, 'K', timezoneOptions, 2, 1000);
  }

  /**
   * Add dropdown validation
   */
  private addDropdownValidation(worksheet: ExcelJS.Worksheet, column: string, options: string[], startRow: number, _endRow: number): void {
    // For now, we'll add validation as comments since ExcelJS data validation API might vary
    // Users can still use the dropdown options from the reference sheets
    // const range = `${column}${startRow}:${column}${endRow}`;
    
    // Add a note to the first cell indicating available options
    const firstCell = worksheet.getCell(`${column}${startRow}`);
    firstCell.note = `Available options: ${options.slice(0, 10).join(', ')}${options.length > 10 ? '...' : ''}`;
  }

  /**
   * Add date validation
   */
  private addDateValidation(worksheet: ExcelJS.Worksheet, column: string, startRow: number, _endRow: number): void {
    // Add format validation note
    const firstCell = worksheet.getCell(`${column}${startRow}`);
    firstCell.note = 'Use YYYY-MM-DD format (e.g., 2025-01-15)';
  }

  /**
   * Add time validation
   */
  private addTimeValidation(worksheet: ExcelJS.Worksheet, column: string, startRow: number, _endRow: number): void {
    // Add format validation note
    const firstCell = worksheet.getCell(`${column}${startRow}`);
    firstCell.note = 'Use HH:mm format (24-hour, e.g., 09:30, 17:45)';
  }

  /**
   * Add column formatting
   */
  private addColumnFormatting(worksheet: ExcelJS.Worksheet): void {
    // Date formatting
    worksheet.getColumn(5).numFmt = 'yyyy-mm-dd'; // Start Date
    worksheet.getColumn(6).numFmt = 'yyyy-mm-dd'; // End Date
    worksheet.getColumn(8).numFmt = 'yyyy-mm-dd'; // Attendance Date
    
    // Time formatting
    worksheet.getColumn(9).numFmt = 'hh:mm'; // In Time
    worksheet.getColumn(10).numFmt = 'hh:mm'; // Out Time
  }

  // Private helper methods

  private getCellValue(row: ExcelJS.Row, columnIndex: number): string {
    const cell = row.getCell(columnIndex);
    return cell.value?.toString()?.trim() || '';
  }

  private parseDate(dateString: string): Date | null {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  }

  private parseTime(timeString: string): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  private isValidTimeFormat(timeString: string): boolean {
    if (!timeString) return false;
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeString);
  }

  private parseWeekendDays(weekendDaysString: string): number[] {
    if (!weekendDaysString) return [];
    
    return weekendDaysString
      .split(',')
      .map(day => parseInt(day.trim()))
      .filter(day => !isNaN(day) && day >= 0 && day <= 6);
  }

  private isWithinShiftWindow(swipeTime: Date, shift: IShift): boolean {
    // Use the same logic as the biometric attendance service
    // This ensures consistency across the application
    
    console.log('=== isWithinShiftWindow Debug ===');
    console.log('Shift Code:', shift.code);
    console.log('Shift Window Start (string):', shift.shiftWindowStart);
    console.log('Shift Window End (string):', shift.shiftWindowEnd);
    console.log('Swipe Time (UTC):', swipeTime.toISOString());
    
    // Parse the window times
    const parseTime = (timeStr: string): { hours: number; minutes: number } => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) {
        throw new Error('Invalid time format. Expected HH:mm or HH:mm:ss');
      }
      return { hours, minutes };
    };

    // Convert IST to UTC (same as biometric service)
    const convertISTtoUTC = (istHours: number, istMinutes: number): { hours: number; minutes: number } => {
      let utcHours = istHours - 5;
      let utcMinutes = istMinutes - 30;

      if (utcMinutes < 0) {
        utcMinutes += 60;
        utcHours -= 1;
      }

      if (utcHours < 0) {
        utcHours += 24;
      }

      return { hours: utcHours, minutes: utcMinutes };
    };

    const windowStartIST = parseTime(shift.shiftWindowStart);
    const windowEndIST = parseTime(shift.shiftWindowEnd);

    const windowStartUTC = convertISTtoUTC(windowStartIST.hours, windowStartIST.minutes);
    const windowEndUTC = convertISTtoUTC(windowEndIST.hours, windowEndIST.minutes);

    // Create window start and end dates
    const shiftDay = new Date(swipeTime);
    shiftDay.setUTCHours(0, 0, 0, 0);

    const windowStart = new Date(shiftDay);
    windowStart.setUTCHours(windowStartUTC.hours, windowStartUTC.minutes, 0, 0);

    const windowEnd = new Date(shiftDay);
    windowEnd.setUTCHours(windowEndUTC.hours, windowEndUTC.minutes, 0, 0);

    // Handle overnight windows
    if (windowEndUTC.hours < windowStartUTC.hours ||
        (windowEndUTC.hours === windowStartUTC.hours && windowEndUTC.minutes < windowStartUTC.minutes)) {
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
    }

    console.log('Window Start (UTC):', windowStart.toISOString());
    console.log('Window End (UTC):', windowEnd.toISOString());
    console.log('Is Swipe >= Window Start:', swipeTime >= windowStart);
    console.log('Is Swipe <= Window End:', swipeTime <= windowEnd);
    
    const result = swipeTime >= windowStart && swipeTime <= windowEnd;
    console.log('Final Result:', result);
    console.log('================================');

    return result;
  }



  /**
   * Calculate overtime hours based on actual work hours vs shift hours
   * @param actualWorkMs - Actual work time in milliseconds
   * @param shiftMs - Shift duration in milliseconds
   * @returns Overtime hours (number)
   */
  private calculateOvertimeHours(actualWorkMs: number, shiftMs: number): number {
    const overtimeMs = actualWorkMs - shiftMs;
    
    // Only consider overtime if it's more than 2 hours
    const overtimeHours = overtimeMs / (1000 * 60 * 60);
    
    if (overtimeHours <= 2) {
      return 0; // No overtime if less than or equal to 2 hours
    }
    
    // Apply overtime rules
    if (overtimeHours <= 4) {
      return 2; // 2-4 hrs → record 2 hrs
    } else if (overtimeHours <= 6) {
      return 4; // 4-6 hrs → record 4 hrs
    } else if (overtimeHours <= 8) {
      return 6; // 6-8 hrs → record 6 hrs
    } else {
      // 8+ hrs → record actual overtime (rounded to nearest hour)
      return Math.round(overtimeHours);
    }
  }

  /**
   * Format overtime hours to HH:mm:ss format for storage
   * @param hours - Overtime hours (number)
   * @returns Formatted string in HH:mm:ss format
   */
  private formatOvertimeHours(hours: number): string {
    const wholeHours = Math.floor(hours);
    const minutes = Math.floor((hours - wholeHours) * 60);
    const seconds = Math.floor(((hours - wholeHours) * 60 - minutes) * 60);
    
    return `${wholeHours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Create overtime record for a user
   * @param userId - User ID
   * @param date - Attendance date
   * @param hours - Overtime hours
   * @returns Created overtime record
   */
  private async createOvertimeRecord(
    userId: Types.ObjectId,
    date: Date,
    hours: number
  ): Promise<any> {
    const overtimeRecord = new Overtime({
      userId,
      date,
      hours,
      status: 'Pending',
      remarks: 'Auto-generated from bulk attendance upload'
    });

    return await overtimeRecord.save();
  }
} 
