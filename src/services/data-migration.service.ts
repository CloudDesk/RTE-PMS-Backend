import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { Types } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { User } from '../models/user.model';
import { Shift, ShiftAssignment } from '../models/shift.model';
import { Leave } from '../models/leave.model';
import { SalaryAssignment } from '../models/salary-assignments.model';
import { SalaryStructure } from '../models/salary-structure.model';
import { AttendanceRecord } from '../models/attendance-record.model';
import { LOV } from '../models/lov.model';
import { HolidayCalendar } from '../models/holiday-calendar.model';
import { ALL_LEAVE_TYPES, LEAVE_TYPE_LABELS } from '../utilis/leave-type-constants';

export type ExportableObject = 'user' | 'shift' | 'leave' | 'salary-assignment' | 'salary-structure' | 'attendance-record';

export interface IExportRequest {
  objects: ExportableObject[];
  filters?: {
    [key: string]: any;
  };
}

export interface IImportRow {
  rowNumber: number;
  [key: string]: any;
  shiftDayEnd?: string;
}

export interface IValidationError {
  rowNumber: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface IValidationResult {
  validRows: IImportRow[];
  invalidRows: IImportRow[];
  errors: IValidationError[];
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    errors: number;
    warnings: number;
  };
}

export interface IImportRequest {
  objects: ExportableObject[];
  validRows: {
    [objectType: string]: IImportRow[];
  };
}

// Constants
const CONSTANTS = {
  BOOLEAN_YES: 'yes',
  BOOLEAN_NO: 'no',
  DEFAULT_COUNTRY: 'IN',
  DEFAULT_CURRENCY_INR: 'INR',
  DEFAULT_CURRENCY_AED: 'AED',
  DEFAULT_LICENSE_TYPE: 'employee',
  ATTENDANCE_RECORD_EXPORT_LIMIT: 10000,
  PASSWORD_MIN_LENGTH: 12,
  VALID_ROLES: ['admin', 'manager', 'staff', 'external'],
  VALID_COUNTRIES: ['IN', 'AE'],
  VALID_VISA_TYPES: ['Standard Employment Visa', 'Domestic Worker Visa', 'Green Visa'],
  DATE_FORMAT_ISO: 'YYYY-MM-DD',
  TIME_FORMAT: 'HH:mm'
} as const;

export class DataMigrationService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  /**
   * Generate Excel template with headers only (for import)
   */
  async generateTemplate(objects: ExportableObject[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    for (const objectType of objects) {
      await this.createTemplateSheet(workbook, objectType);
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /**
   * Create template sheet with headers only
   */
  private async createTemplateSheet(
    workbook: ExcelJS.Workbook,
    objectType: ExportableObject
  ): Promise<void> {
    const sheetName = this.getSheetName(objectType);
    const worksheet = workbook.addWorksheet(sheetName);

    switch (objectType) {
      case 'user':
        this.createUserTemplate(worksheet);
        break;
      case 'shift':
        this.createShiftTemplate(worksheet);
        break;
      case 'leave':
        this.createLeaveTemplate(worksheet);
        break;
      case 'salary-assignment':
        this.createSalaryAssignmentTemplate(worksheet);
        break;
      case 'salary-structure':
        this.createSalaryStructureTemplate(worksheet);
        break;
      case 'attendance-record':
        this.createAttendanceRecordTemplate(worksheet);
        break;
    }

    this.autoFitColumns(worksheet);
    this.addInstructionsRow(worksheet, objectType);
  }

  /**
   * Add instructions row below headers
   */
  private addInstructionsRow(worksheet: ExcelJS.Worksheet, objectType: ExportableObject): void {
    const instructions: { [key: string]: string[] } = {
      'user': [
        'Instructions:',
        '• Fields marked (Required) must be filled',
        '• Fields marked (Optional) can be left empty',
        '• Email must be unique',
        '• For AE users: Visa Type and Visa Expiry Date are required',
        '• Biometric ID only for non-IN/AE countries',
        '• Date formats: YYYY-MM-DD or DD/MM/YYYY',
        '• Boolean fields: Yes/No (case insensitive)'
      ],
      'shift': [
        'Instructions:',
        '• All time fields must be in HH:mm format (e.g., 09:00)',
        '• Shift window start must be <= shift start time',
        '• Shift window end must be > shift start time',
        '• For overnight shifts: end time must be < start time',
        '• Code must be unique'
      ],
      'leave': [
        'Instructions:',
        '• For half-day leaves: startDate = endDate, noOfDays = 0.5, halfDayType required',
        '• For full-day leaves: halfDayType must be empty',
        '• End date must be >= start date',
        '• Date formats: YYYY-MM-DD or DD/MM/YYYY'
      ],
      'salary-assignment': [
        'Instructions:',
        '• All numeric fields must be >= 0',
        '• Effective To must be > Effective From',
        '• If Is Active = Yes, other active assignments for same employee will be deactivated',
        '• Note: User Active status defaults to Yes, but can be set to No for historical data migration',
        '• Date formats: YYYY-MM-DD or DD/MM/YYYY'
      ],
      'salary-structure': [
        'Instructions:',
        '• All percentage fields must be between 0 and 100',
        '• Country must be IN or AE'
      ],
      'attendance-record': [
        'Instructions:',
        '• Shift Start and Shift End must be valid ISO DateTime format',
        '• Shift End must be > Shift Start',
        '• Shift Code should match the Shift ID',
        '• Date formats: YYYY-MM-DD for shiftDay, ISO DateTime for times'
      ]
    };

    const instructionText = instructions[objectType];
    if (instructionText) {
      // Add empty row
      worksheet.addRow([]);
      // Add instructions
      instructionText.forEach((instruction) => {
        const row = worksheet.addRow([instruction]);
        if (instruction === 'Instructions:') {
          row.getCell(1).font = { bold: true };
        }
      });
    }
  }

  /**
   * Create User template
   */
  private createUserTemplate(worksheet: ExcelJS.Worksheet): void {
    const headers = [
      'Name (Required)',
      'Email (Required if Active=Yes, Optional if Active=No for historical data)',
      'Role (Required)',
      'Specific Role (Optional)',
      'Department ID (Required)',
      'Cost Center (Required)',
      'Manager ID (Required)',
      'Employee No (Required)',
      'Employment Status (Required)',
      'Check-in ID (Optional)',
      'Biometric ID (Optional - Non-IN/AE only)',
      'Active (Optional - Default: Yes. Can be set to No for historical data migration)',
      'Joining Date (Required)',
      'Confirmation Date (Optional)',
      'Probation Date (Optional)',
      'Location (Optional)',
      'Phone (Optional)',
      'Emergency Contact (Optional)',
      'Address (Optional)',
      'Blood Group (Optional)',
      'Date of Birth (Required)',
      'Father\'s Name (Optional)',
      'Marital Status (Optional)',
      'Spouse Name (Optional)',
      'Separation Date (Optional)',
      'Notice Period (Required)',
      'Personal Mail ID (Optional)',
      'Country (Required)',
      'Currency (Optional - Auto-set by Country)',
      'License Type (Optional - Default: employee)',
      'Portal Access (Optional - Default: Yes)',
      'Visa Type (Required for AE users)',
      'Visa Expiry Date (Required for AE users)',
      'Visa Is Active (Optional - Default: Yes)',
      'Client (Optional)',
      'Holiday Calendar ID (Optional)',
      'Shift ID (Optional - Required if creating shift assignment)'
      // Note: FCM Token is not included - it's set automatically when users log into the mobile app
    ];
    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    // Add detailed notes to header cells
    this.addFieldRequirementNotes(worksheet, {
      1: { required: true, note: 'Full name of the user' },
      2: { required: false, note: 'Valid email address, must be unique. Required if Active=Yes, optional if Active=No (for historical data migration)' },
      3: { required: true, note: 'Must be one of: admin, manager, staff, external' },
      4: { required: false, note: 'Specific role designation' },
      5: { required: true, note: 'Must exist in Department LOV' },
      6: { required: true, note: 'Cost center identifier' },
      7: { required: true, note: 'Valid User ID of manager (Required)' },
      8: { required: true, note: 'Employee number, must be unique' },
      9: { required: true, note: 'Employment Status (e.g. Permanent, Contract)' },
      10: { required: false, note: 'Check-in ID, must be unique if provided' },
      11: { required: false, note: 'Only for non-IN/AE countries, must be unique if provided' },
      12: { required: false, note: 'Yes/No, defaults to Yes. Can be set to No for historical data migration' },
      13: { required: true, note: 'Format: YYYY-MM-DD or DD/MM/YYYY (Required)' },
      14: { required: false, note: 'Format: YYYY-MM-DD or DD/MM/YYYY. Employee confirmation date (Optional)' },
      15: { required: false, note: 'Format: YYYY-MM-DD or DD/MM/YYYY. Employee probation date (Optional)' },
      16: { required: false, note: 'User location' },
      17: { required: false, note: 'Phone number' },
      18: { required: false, note: 'Emergency contact information' },
      19: { required: false, note: 'User address' },
      20: { required: false, note: 'Blood group' },
      21: { required: true, note: 'Format: YYYY-MM-DD or DD/MM/YYYY (Required)' },
      22: { required: false, note: 'Father\'s name' },
      23: { required: false, note: 'Single, Married, Divorced, or Widowed' },
      24: { required: false, note: 'Spouse name (if married)' },
      25: { required: false, note: 'Format: YYYY-MM-DD or DD/MM/YYYY. Employee separation date' },
      26: { required: true, note: 'Notice period in days (number)' },
      27: { required: false, note: 'Personal email address (must be valid format)' },
      28: { required: true, note: 'Required field. Must be IN or AE' },
      29: { required: false, note: 'INR for IN, AED for AE (auto-set if not provided)' },
      30: { required: false, note: 'employee or external, defaults to employee' },
      31: { required: false, note: 'Yes/No, defaults to Yes. For same email in two rows: only one Yes; put Portal Access=Yes row above Portal Access=No row.' },
      32: { required: false, note: 'Required for AE users: Standard Employment Visa, Domestic Worker Visa, or Green Visa' },
      33: { required: false, note: 'Required for AE users, must be future date, format: YYYY-MM-DD' },
      34: { required: false, note: 'Yes/No, defaults to Yes' },
      35: { required: false, note: 'Client assignment' },
      36: { required: false, note: 'Valid Holiday Calendar ID' },
      37: { required: false, note: 'Valid Shift ID. Required if shift-assignment is also being imported. Shift assignment will be created with joining date as start date and weekend [0,6]' }
    });
  }

  /**
   * Create Shift template
   */
  private createShiftTemplate(worksheet: ExcelJS.Worksheet): void {
    const headers = [
      'Name (Required)',
      'Code (Required)',
      'Start Time (Required)',
      'End Time (Required)',
      'Shift Window Start (Required)',
      'Shift Window End (Required)',
      'Valid From (Optional - Default: Today)',
      'Valid Till (Optional)',
      'Is Active (Optional - Default: No)',
      'Description (Optional)',
      'Grace Time (Minutes) (Optional - Default: 15)',
      'Is Overnight Shift (Optional - Default: No)'
    ];
    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    // Add detailed notes to header cells
    this.addFieldRequirementNotes(worksheet, {
      1: { required: true, note: 'Shift name' },
      2: { required: true, note: 'Unique shift code (uppercase)' },
      3: { required: true, note: 'Format: HH:mm (e.g., 09:00)' },
      4: { required: true, note: 'Format: HH:mm (e.g., 18:00). For overnight shifts, must be < start time' },
      5: { required: true, note: 'Format: HH:mm, must be <= start time' },
      6: { required: true, note: 'Format: HH:mm, must be > start time' },
      7: { required: false, note: 'Format: YYYY-MM-DD' },
      8: { required: false, note: 'Format: YYYY-MM-DD' },
      9: { required: false, note: 'Yes/No, defaults to No' },
      10: { required: false, note: 'Shift description' },
      11: { required: false, note: 'Number between 0-60, defaults to 15' },
      12: { required: false, note: 'Yes/No, defaults to No. If Yes, end time must be < start time' }
    });
  }

  /**
   * Create Leave template
   */
  /**
   * Create Leave template
   */
  private createLeaveTemplate(worksheet: ExcelJS.Worksheet): void {
    const headers = [
      'User ID (Required)',
      'Leave Type ID (Required if Name not provided)',
      'Leave Type Name (Required if ID not provided)',
      'Start Date (Required - YYYY-MM-DD)',
      'End Date (Required - YYYY-MM-DD)',
      'Status (Optional - Default: Approved)',
      'Leave Duration (Optional - full-day / half-day)',
      'Half Day Type (Optional - first-half / second-half)',
      'No of Days (Optional - Auto-calculated if blank)'
    ];
    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    // Add detailed notes to header cells
    this.addFieldRequirementNotes(worksheet, {
      1: { required: true, note: 'Valid User ID' },
      2: { required: false, note: 'MongoDB ID (Preferred). Leave blank for FULL_MONTH_PRESENT' },
      3: { required: false, note: 'Exact Leave Name (e.g. Sick Leave) OR use "FULL_MONTH_PRESENT" for months with no leaves' },
      4: { required: true, note: 'YYYY-MM-DD (e.g., 2024-01-01 for first day of month)' },
      5: { required: true, note: 'YYYY-MM-DD (e.g., 2024-01-31 for last day of month)' },
      6: { required: false, note: 'Default: Approved. Not used for FULL_MONTH_PRESENT' },
      7: { required: false, note: 'full-day or half-day. Not used for FULL_MONTH_PRESENT' },
      8: { required: false, note: 'Required if Duration is half-day' },
      9: { required: false, note: 'Override auto-calculation. Use 0 for FULL_MONTH_PRESENT' }
    });
  }

  // ... (No change to createSalaryAssignmentTemplate) ...

  // ...

  /**
   * Parse Leave row
   */
  private parseLeaveRow(row: ExcelJS.Row, rowData: IImportRow): void {
    // 1: User ID
    rowData.userId = this.getCellValue(row, 1);
    // 2: Leave Type ID
    rowData.leaveTypeId = this.getCellValue(row, 2);
    // 3: Leave Type Name
    rowData.leaveTypeName = this.getCellValue(row, 3);
    // 4: Start Date
    rowData.startDate = this.getCellValue(row, 4);
    // 5: End Date
    rowData.endDate = this.getCellValue(row, 5);
    // 6: Status
    rowData.status = this.getCellValue(row, 6);
    // 7: Duration
    rowData.leaveDuration = this.getCellValue(row, 7) || 'full-day';
    // 8: Half Day Type
    rowData.halfDayType = this.getCellValue(row, 8);
    // 9: No of Days
    rowData.noOfDays = this.getCellValue(row, 9);
  }

  /**
   * Create Salary Assignment template
   */
  private createSalaryAssignmentTemplate(worksheet: ExcelJS.Worksheet): void {
    const headers = [
      'Employee ID (Required)',
      'Salary Structure ID (Required)',
      'Monthly Gross (Required)',
      'Annual Insurance (Required)',
      'Reimbursement (Required)',
      'Travel Allowance (Optional - Default: 0)',
      'Air Ticket Allowance (Optional - Default: 0)',
      'Medical Allowance (Optional - Default: 0)',
      'Is Active (Optional - Default: No)',
      'Effective From (Required)',
      'Effective To (Required)'
    ];
    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    // Add detailed notes to header cells
    this.addFieldRequirementNotes(worksheet, {
      1: { required: true, note: 'Valid User ID of employee' },
      2: { required: true, note: 'Valid Salary Structure ID' },
      3: { required: true, note: 'Monthly gross salary (must be >= 0)' },
      4: { required: true, note: 'Annual insurance amount (must be >= 0)' },
      5: { required: true, note: 'Reimbursement amount (must be >= 0)' },
      6: { required: false, note: 'Travel allowance (must be >= 0)' },
      7: { required: false, note: 'Air ticket allowance (must be >= 0)' },
      8: { required: false, note: 'Medical allowance (must be >= 0)' },
      9: { required: false, note: 'Yes/No, defaults to No. If Yes, deactivates other active assignments' },
      10: { required: true, note: 'Format: YYYY-MM-DD' },
      11: { required: true, note: 'Format: YYYY-MM-DD, must be > effective from' }
    });
  }

  /**
   * Create Salary Structure template
   */
  private createSalaryStructureTemplate(worksheet: ExcelJS.Worksheet): void {
    const headers = [
      'Name (Required)',
      'Country (Required)',
      'Basic Percentage (Optional - Default: 0)',
      'HRA Percentage (Optional - Default: 0)',
      'DA Percentage (Optional - Default: 0)',
      'Other Allowance Percentage (Optional - Default: 0)',
      'Travel Allowance Percentage (Optional - Default: 0)',
      'Reimbursement Percentage (Optional - Default: 0)',
      'EPF Employee Contribution (Optional - Default: 0)',
      'EPF Employer Contribution (Optional - Default: 0)',
      'EPF Max Limit (Optional - Default: 0)',
      'ESI Employee Contribution (Optional - Default: 0)',
      'ESI Employer Contribution (Optional - Default: 0)',
      'ESI Applicability Limit (Optional - Default: 0)'
    ];
    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    // Add detailed notes to header cells
    this.addFieldRequirementNotes(worksheet, {
      1: { required: true, note: 'Salary structure name' },
      2: { required: true, note: 'IN or AE' },
      3: { required: false, note: 'Percentage (0-100)' },
      4: { required: false, note: 'Percentage (0-100)' },
      5: { required: false, note: 'Percentage (0-100)' },
      6: { required: false, note: 'Percentage (0-100)' },
      7: { required: false, note: 'Percentage (0-100)' },
      8: { required: false, note: 'Percentage (0-100)' },
      9: { required: false, note: 'EPF employee contribution percentage' },
      10: { required: false, note: 'EPF employer contribution percentage' },
      11: { required: false, note: 'EPF maximum limit' },
      12: { required: false, note: 'ESI employee contribution percentage' },
      13: { required: false, note: 'ESI employer contribution percentage' },
      14: { required: false, note: 'ESI applicability limit' }
    });
  }

  /**
   * Create Attendance Record template
   */
  private createAttendanceRecordTemplate(worksheet: ExcelJS.Worksheet): void {
    const headers = [
      'User ID (Required)',
      'Shift ID (Required)',
      'Shift Code (Required)',
      'Shift Day (Required)',
      'Shift Day End (Optional - For Range Insert)',
      'Shift Start (Optional - Auto 09:00)',
      'Shift End (Optional - Auto 18:00)',
      'Attendance Type (Required - Present / Half Day / Absent)',
      'Half Type (Optional - First Half / Second Half)',
      'Is WFH (Optional - Yes / No)'
    ];
    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    // Add detailed notes to header cells
    this.addFieldRequirementNotes(worksheet, {
      1: { required: true, note: 'Valid User ID from system' },
      2: { required: true, note: 'Valid Shift ID from system' },
      3: { required: true, note: 'Shift code (should match Shift ID)' },
      4: { required: true, note: 'Format: YYYY-MM-DD (e.g., 2024-01-15)' },
      5: { required: false, note: 'Optional End Date to create range (e.g., 2025-01-31). If provided, creates records for all dates from Shift Day to this date.' },
      6: { required: false, note: 'Format: ISO DateTime. Auto-filled to 09:00 if empty' },
      7: { required: false, note: 'Format: ISO DateTime. Auto-filled to 18:00 if empty' },
      8: { required: true, note: 'Values: Present, Full Day, Half Day, Absent. REQUIRED field.' },
      9: { required: false, note: 'Values: First Half, Second Half. Only when Attendance Type is Half Day.' },
      10: { required: false, note: 'Values: Yes, No. Mark Yes if employee worked from home.' }
    });
  }

  /**
   * Export selected objects to Excel
   */
  async exportToExcel(request: IExportRequest): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    for (const objectType of request.objects) {
      await this.exportObject(workbook, objectType, request.filters);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);
  }

  /**
   * Export a single object type to Excel sheet
   */
  private async exportObject(
    workbook: ExcelJS.Workbook,
    objectType: ExportableObject,
    filters?: { [key: string]: any }
  ): Promise<void> {
    const sheetName = this.getSheetName(objectType);
    const worksheet = workbook.addWorksheet(sheetName);

    switch (objectType) {
      case 'user':
        await this.exportUsers(worksheet, filters);
        break;
      case 'shift':
        await this.exportShifts(worksheet, filters);
        break;
      case 'leave':
        await this.exportLeaves(worksheet, filters);
        break;
      case 'salary-assignment':
        await this.exportSalaryAssignments(worksheet, filters);
        break;
      case 'salary-structure':
        await this.exportSalaryStructures(worksheet, filters);
        break;
      case 'attendance-record':
        await this.exportAttendanceRecords(worksheet, filters);
        break;
    }
  }

  /**
   * Export Users to Excel
   */
  private async exportUsers(worksheet: ExcelJS.Worksheet, filters?: any): Promise<void> {
    const headers = [
      'User ID',
      'Name',
      'Email',
      'Role',
      'Specific Role',
      'Department ID',
      'Manager ID',
      'Employee No',
      'Check-in ID',
      'Biometric ID',
      'Active',
      'Joining Date',
      'Confirmation Date',
      'Probation Date',
      'Location',
      'Phone',
      'Emergency Contact',
      'Address',
      'Blood Group',
      'Date of Birth',
      'Father\'s Name',
      'Marital Status',
      'Spouse Name',
      'Separation Date',
      'Notice Period',
      'Personal Mail ID',
      'Country',
      'Currency',
      'License Type',
      'Portal Access',
      'Visa Type',
      'Visa Expiry Date',
      'Visa Is Active',
      'Client',
      'Holiday Calendar ID',
      'FCM Token'  // Exported for reference (but not used in import - set automatically by mobile app)
    ];

    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    const query: any = {};
    if (filters?.active !== undefined) query.active = filters.active;
    if (filters?.country) query.country = filters.country;
    if (filters?.role) query.role = filters.role;
    if (filters?.departmentId) query.departmentId = filters.departmentId;

    const users = await User.find(query)
      .select('name email role specificRole departmentId managerId employeeCode checkinId biometricId active joiningDate confirmationDate probationDate location phone emergencyContact address bloodGroup dateOfBirth fatherName maritalStatus spouseName separationDate noticePeriod personalMailId country currency licenseType portalAccess visaDetails client holidayCalendarId fcmToken')
      .lean();

    for (const user of users) {
      const row = [
        user._id?.toString() || '',  // User ID as first column
        user.name || '',
        user.email || '',
        user.role || '',
        user.specificRole || '',
        user.departmentId || '',
        user.managerId?.toString() || '',
        user.employeeCode || '',
        user.checkinId || '',
        user.biometricId || '',
        user.active ? CONSTANTS.BOOLEAN_YES.toUpperCase() : CONSTANTS.BOOLEAN_NO.toUpperCase(),
        user.joiningDate ? new Date(user.joiningDate).toISOString().split('T')[0] : '',
        user.confirmationDate ? new Date(user.confirmationDate).toISOString().split('T')[0] : '',
        user.probationDate ? new Date(user.probationDate).toISOString().split('T')[0] : '',
        user.location || '',
        user.phone || '',
        user.emergencyContact
          ? (typeof user.emergencyContact === 'string'
            ? user.emergencyContact
            : user.emergencyContact.mobileNo || '')
          : '',
        user.address || '',
        user.bloodGroup || '',
        user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '',
        user.fatherName || '',
        user.maritalStatus || '',
        user.spouseName || '',
        user.separationDate ? new Date(user.separationDate).toISOString().split('T')[0] : '',
        user.noticePeriod || '',
        user.personalMailId || '',
        user.country || CONSTANTS.DEFAULT_COUNTRY,
        user.currency || CONSTANTS.DEFAULT_CURRENCY_INR,
        user.licenseType || CONSTANTS.DEFAULT_LICENSE_TYPE,
        user.portalAccess ? 'Yes' : 'No',
        user.visaDetails?.visaType || '',
        user.visaDetails?.visaExpiryDate ? new Date(user.visaDetails.visaExpiryDate).toISOString().split('T')[0] : '',
        user.visaDetails?.isActive ? 'Yes' : 'No',
        user.client || '',
        user.holidayCalendarId?.toString() || '',
        user.fcmToken || ''  // Exported for reference only (not imported - set by mobile app)
      ];
      worksheet.addRow(row);
    }

    this.autoFitColumns(worksheet);
  }

  /**
   * Export Shifts to Excel
   */
  private async exportShifts(worksheet: ExcelJS.Worksheet, filters?: any): Promise<void> {
    const headers = [
      'Shift ID',
      'Name',
      'Code',
      'Start Time',
      'End Time',
      'Shift Window Start',
      'Shift Window End',
      'Valid From',
      'Valid Till',
      'Is Active',
      'Description',
      'Grace Time (Minutes)',
      'Is Overnight Shift'
    ];

    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    const query: any = {};
    if (filters?.isActive !== undefined) query.isActive = filters.isActive;

    const shifts = await Shift.find(query).lean();

    for (const shift of shifts) {
      const row = [
        shift._id?.toString() || '',
        shift.name || '',
        shift.code || '',
        shift.startTime || '',
        shift.endTime || '',
        shift.shiftWindowStart || '',
        shift.shiftWindowEnd || '',
        shift.validFrom ? new Date(shift.validFrom).toISOString().split('T')[0] : '',
        shift.validTill ? new Date(shift.validTill).toISOString().split('T')[0] : '',
        shift.isActive ? CONSTANTS.BOOLEAN_YES.toUpperCase() : CONSTANTS.BOOLEAN_NO.toUpperCase(),
        shift.description || '',
        shift.graceTimeInMinutes || 15,
        shift.isOvernightShift ? CONSTANTS.BOOLEAN_YES.toUpperCase() : CONSTANTS.BOOLEAN_NO.toUpperCase()
      ];
      worksheet.addRow(row);
    }

    this.autoFitColumns(worksheet);
  }

  /**
   * Export Leaves to Excel
   */
  private async exportLeaves(worksheet: ExcelJS.Worksheet, filters?: any): Promise<void> {
    const headers = [
      'User ID',
      'Leave Type ID',
      'Leave Type',
      'Start Date',
      'End Date',
      'No of Days',
      'Status',
      'Remarks',
      'Reason',
      'Applied To ID',
      'Applied To Name',
      'Approved By ID',
      'Approved At',
      'Leave Duration',
      'Half Day Type'
    ];

    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    const query: any = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.userId) query.userId = new Types.ObjectId(filters.userId);

    const leaves = await Leave.find(query).lean();

    for (const leave of leaves) {
      const row = [
        leave.userId?.toString() || '',
        leave.leaveTypeId?.toString() || '',
        leave.leaveType || '',
        leave.startDate ? new Date(leave.startDate).toISOString().split('T')[0] : '',
        leave.endDate ? new Date(leave.endDate).toISOString().split('T')[0] : '',
        leave.noOfDays || 0,
        leave.status || 'Pending',
        leave.remarks || '',
        leave.reason || '',
        leave.appliedTo?._id || '',
        leave.appliedTo?.name || '',
        leave.approvedById?.toString() || '',
        leave.approvedAt ? new Date(leave.approvedAt).toISOString().split('T')[0] : '',
        leave.leaveDuration || 'full-day',
        leave.halfDayType || ''
      ];
      worksheet.addRow(row);
    }

    this.autoFitColumns(worksheet);
  }

  /**
   * Export Salary Assignments to Excel
   */
  private async exportSalaryAssignments(worksheet: ExcelJS.Worksheet, filters?: any): Promise<void> {
    const headers = [
      'Employee ID',
      'Salary Structure ID',
      'Monthly Gross',
      'Annual Insurance',
      'Reimbursement',
      'Travel Allowance',
      'Air Ticket Allowance',
      'Medical Allowance',
      'Is Active',
      'Effective From',
      'Effective To'
    ];

    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    const query: any = {};
    if (filters?.employeeId) query.employeeId = new Types.ObjectId(filters.employeeId);
    if (filters?.isActive !== undefined) query.isActive = filters.isActive;

    const assignments = await SalaryAssignment.find(query).lean();

    for (const assignment of assignments) {
      const row = [
        assignment.employeeId?.toString() || '',
        assignment.salaryStructureId?.toString() || '',
        assignment.monthlyGross || 0,
        assignment.annualInsurance || 0,
        assignment.reimbursement || 0,
        assignment.travelAllowance || 0,
        assignment.airTicketAllowance || 0,
        assignment.medicalAllowance || 0,
        assignment.isActive ? CONSTANTS.BOOLEAN_YES.toUpperCase() : CONSTANTS.BOOLEAN_NO.toUpperCase(),
        assignment.effectiveFrom ? new Date(assignment.effectiveFrom).toISOString().split('T')[0] : '',
        assignment.effectiveTo ? new Date(assignment.effectiveTo).toISOString().split('T')[0] : ''
      ];
      worksheet.addRow(row);
    }

    this.autoFitColumns(worksheet);
  }

  /**
   * Export Salary Structures to Excel
   */
  private async exportSalaryStructures(worksheet: ExcelJS.Worksheet, filters?: any): Promise<void> {
    const headers = [
      'Name',
      'Country',
      'Basic Percentage',
      'HRA Percentage',
      'DA Percentage',
      'Other Allowance Percentage',
      'Travel Allowance Percentage',
      'Reimbursement Percentage',
      'EPF Employee Contribution',
      'EPF Employer Contribution',
      'EPF Max Limit',
      'ESI Employee Contribution',
      'ESI Employer Contribution',
      'ESI Applicability Limit'
    ];

    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    const query: any = {};
    if (filters?.country) query.country = filters.country;

    const structures = await SalaryStructure.find(query).lean();

    for (const structure of structures) {
      const row = [
        structure.name || '',
        structure.country || CONSTANTS.DEFAULT_COUNTRY,
        structure.fixedEarnings?.basicPercentage || 0,
        structure.fixedEarnings?.hraPercentage || 0,
        structure.fixedEarnings?.daPercentage || 0,
        structure.fixedEarnings?.otherAllowancePercentage || 0,
        structure.fixedEarnings?.travelAllowancePercentage || 0,
        structure.fixedEarnings?.reimbursementPercentage || 0,
        structure.statutoryDeductions?.epf?.employeeContribution || 0,
        structure.statutoryDeductions?.epf?.employerContribution || 0,
        structure.statutoryDeductions?.epf?.maxLimit || 0,
        structure.statutoryDeductions?.esi?.employeeContribution || 0,
        structure.statutoryDeductions?.esi?.employerContribution || 0,
        structure.statutoryDeductions?.esi?.applicabilityLimit || 0
      ];
      worksheet.addRow(row);
    }

    this.autoFitColumns(worksheet);
  }

  /**
   * Export Attendance Records to Excel
   */
  private async exportAttendanceRecords(worksheet: ExcelJS.Worksheet, filters?: any): Promise<void> {
    const headers = [
      'User ID',
      'Shift ID',
      'Shift Code',
      'Shift Day',
      'Shift Start',
      'Shift End',
      'First In',
      'Last Out',
      'Total Work Hours',
      'Break Hours',
      'Actual Work Hours',
      'Shift Hours',
      'Shortfall Hours',
      'Excess Hours',
      'Status',
      'Is Within Window',
      'Is Late Entry',
      'Is Early Exit'
    ];

    worksheet.addRow(headers);
    this.styleHeaderRow(worksheet.getRow(1));

    const query: any = {};
    if (filters?.userId) query.userId = new Types.ObjectId(filters.userId);
    if (filters?.shiftCode) query.shiftCode = filters.shiftCode;
    if (filters?.shiftDay) query.shiftDay = new Date(filters.shiftDay);

    const records = await AttendanceRecord.find(query)
      .limit(CONSTANTS.ATTENDANCE_RECORD_EXPORT_LIMIT) // Limit to prevent memory issues
      .lean();

    for (const record of records) {
      const row = [
        record.userId?.toString() || '',
        record.shiftId?.toString() || '',
        record.shiftCode || '',
        record.shiftDay ? new Date(record.shiftDay).toISOString().split('T')[0] : '',
        record.shiftStart ? new Date(record.shiftStart).toISOString() : '',
        record.shiftEnd ? new Date(record.shiftEnd).toISOString() : '',
        record.firstIn ? new Date(record.firstIn).toISOString() : '',
        record.lastOut ? new Date(record.lastOut).toISOString() : '',
        record.totalWorkHours || '0:00:00',
        record.breakHours || '0:00:00',
        record.actualWorkHours || '0:00:00',
        record.shiftHours || '0:00:00',
        record.shortfallHours || '0:00:00',
        record.excessHours || '0:00:00',
        record.status || '',
        record.isWithinWindow ? CONSTANTS.BOOLEAN_YES.toUpperCase() : CONSTANTS.BOOLEAN_NO.toUpperCase(),
        record.isLateEntry ? CONSTANTS.BOOLEAN_YES.toUpperCase() : CONSTANTS.BOOLEAN_NO.toUpperCase(),
        record.isEarlyExit ? CONSTANTS.BOOLEAN_YES.toUpperCase() : CONSTANTS.BOOLEAN_NO.toUpperCase()
      ];
      worksheet.addRow(row);
    }

    this.autoFitColumns(worksheet);
  }

  /**
   * Parse Excel file and extract data for selected objects
   */
  async parseExcelFile(fileBuffer: Buffer, objects: ExportableObject[]): Promise<{ [objectType: string]: IImportRow[] }> {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS accepts Buffer, Uint8Array, or ArrayBuffer
    // @ts-ignore - ExcelJS Buffer type compatibility issue
    await workbook.xlsx.load(fileBuffer);

    const result: { [objectType: string]: IImportRow[] } = {};

    for (const objectType of objects) {
      const sheetName = this.getSheetName(objectType);
      const worksheet = workbook.getWorksheet(sheetName);

      if (!worksheet) {
        console.warn(`Sheet "${sheetName}" not found in Excel file`);
        result[objectType] = [];
        continue;
      }

      result[objectType] = await this.parseSheet(worksheet, objectType);
    }

    return result;
  }

  /**
   * Parse a single worksheet
   */
  private async parseSheet(worksheet: ExcelJS.Worksheet, objectType: ExportableObject): Promise<IImportRow[]> {
    const rows: IImportRow[] = [];
    let rowNumber = 2; // Start from row 2 (row 1 is header)

    // For attendance records, we need to handle potential date ranges (expansion)
    if (objectType === 'attendance-record') {
      worksheet.eachRow((row, index) => {
        if (index === 1) return; // Skip header

        const rowData: IImportRow = { rowNumber };
        this.parseAttendanceRecordRow(row, rowData);

        // Check if data exists
        const hasData = Object.keys(rowData).some(key => key !== 'rowNumber' && rowData[key] !== undefined && rowData[key] !== '');

        if (hasData) {
          // Check for date range expansion
          const shiftDayStartStr = rowData.shiftDay;
          const shiftDayEndStr = rowData.shiftDayEnd; // This is added in parseAttendanceRecordRow

          const shiftDayStart = this.parseDate(shiftDayStartStr!);
          const shiftDayEnd = shiftDayEndStr ? this.parseDate(shiftDayEndStr) : null;

          if (shiftDayStart && shiftDayEnd && shiftDayEnd > shiftDayStart) {
            // RANGE EXPLOSION 💥
            // Loop from Start to End
            const currentDate = new Date(shiftDayStart);
            const endDate = new Date(shiftDayEnd);

            while (currentDate <= endDate) {
              // Create a CLONE of the row data
              const clonedRow = { ...rowData };
              // Update the shift day for this specific instance
              clonedRow.shiftDay = currentDate.toISOString().split('T')[0];
              // Remove the end date from the clone to avoid confusion
              delete clonedRow.shiftDayEnd;

              rows.push(clonedRow);
              // Move to next day
              currentDate.setDate(currentDate.getDate() + 1);
            }
          } else {
            // Standard Single Row
            rows.push(rowData);
          }
        }
        rowNumber++;
      });
    } else {
      // Standard parsing for other types
      worksheet.eachRow((row, index) => {
        if (index === 1) return; // Skip header row

        const rowData: IImportRow = { rowNumber };

        switch (objectType) {
          case 'user':
            this.parseUserRow(row, rowData);
            break;
          case 'shift':
            this.parseShiftRow(row, rowData);
            break;
          case 'leave':
            this.parseLeaveRow(row, rowData);
            break;
          case 'salary-assignment':
            this.parseSalaryAssignmentRow(row, rowData);
            break;
          case 'salary-structure':
            this.parseSalaryStructureRow(row, rowData);
            break;
        }

        // Only add rows that have at least one non-empty field
        const hasData = Object.keys(rowData).some(key => key !== 'rowNumber' && rowData[key] !== undefined && rowData[key] !== '');
        if (hasData) {
          rows.push(rowData);
        }

        rowNumber++;
      });
    }

    return rows;
  }

  /**
   * Parse User row
   */
  private parseUserRow(row: ExcelJS.Row, rowData: IImportRow): void {
    rowData.name = this.getCellValue(row, 1);
    rowData.email = this.getCellValue(row, 2);
    rowData.role = this.getCellValue(row, 3);
    rowData.specificRole = this.getCellValue(row, 4);
    rowData.departmentId = this.getCellValue(row, 5);
    rowData.costCenter = this.getCellValue(row, 6);
    rowData.managerId = this.getCellValue(row, 7);
    rowData.employeeNo = this.getCellValue(row, 8);
    rowData.employmentStatus = this.getCellValue(row, 9);
    rowData.checkinId = this.getCellValue(row, 10);
    rowData.biometricId = this.getCellValue(row, 11);
    rowData.active = this.parseBoolean(this.getCellValue(row, 12), true);
    rowData.joiningDate = this.getCellValue(row, 13);
    rowData.confirmationDate = this.getCellValue(row, 14); // Required
    rowData.probationDate = this.getCellValue(row, 15); // Required
    rowData.location = this.getCellValue(row, 16);
    rowData.phone = this.getCellValue(row, 17);
    rowData.emergencyContact = this.getCellValue(row, 18);
    rowData.address = this.getCellValue(row, 19);
    rowData.bloodGroup = this.getCellValue(row, 20);
    rowData.dateOfBirth = this.getCellValue(row, 21);
    rowData.fatherName = this.getCellValue(row, 22);
    rowData.maritalStatus = this.getCellValue(row, 23);
    rowData.spouseName = this.getCellValue(row, 24);
    rowData.separationDate = this.getCellValue(row, 25);
    rowData.noticePeriod = this.getCellValue(row, 26);
    rowData.personalMailId = this.getCellValue(row, 27);
    rowData.country = this.getCellValue(row, 28);
    rowData.currency = this.getCellValue(row, 29) || CONSTANTS.DEFAULT_CURRENCY_INR;
    rowData.licenseType = this.getCellValue(row, 30) || CONSTANTS.DEFAULT_LICENSE_TYPE;
    rowData.portalAccess = this.parseBoolean(this.getCellValue(row, 31), true);
    rowData.visaType = this.getCellValue(row, 32);
    rowData.visaExpiryDate = this.getCellValue(row, 33);
    rowData.visaIsActive = this.parseBoolean(this.getCellValue(row, 34), true);
    rowData.client = this.getCellValue(row, 35);
    rowData.holidayCalendarId = this.getCellValue(row, 36);
    rowData.shiftId = this.getCellValue(row, 37); // For automatic shift assignment creation
    // Note: FCM Token is not imported - it's set automatically when users log into the mobile app
  }

  /**
   * Parse Shift row
   */
  private parseShiftRow(row: ExcelJS.Row, rowData: IImportRow): void {
    rowData.name = this.getCellValue(row, 1);
    rowData.code = this.getCellValue(row, 2);
    rowData.startTime = this.getCellValue(row, 3);
    rowData.endTime = this.getCellValue(row, 4);
    rowData.shiftWindowStart = this.getCellValue(row, 5);
    rowData.shiftWindowEnd = this.getCellValue(row, 6);
    rowData.validFrom = this.getCellValue(row, 7);
    rowData.validTill = this.getCellValue(row, 8);
    rowData.isActive = this.parseBoolean(this.getCellValue(row, 9), false);
    rowData.description = this.getCellValue(row, 10);
    rowData.graceTimeInMinutes = this.getCellValue(row, 11);
    rowData.isOvernightShift = this.parseBoolean(this.getCellValue(row, 12), false);
  }



  /**
   * Parse Salary Assignment row
   */
  private parseSalaryAssignmentRow(row: ExcelJS.Row, rowData: IImportRow): void {
    rowData.employeeId = this.getCellValue(row, 1);
    rowData.salaryStructureId = this.getCellValue(row, 2);
    rowData.monthlyGross = this.getCellValue(row, 3);
    rowData.annualInsurance = this.getCellValue(row, 4);
    rowData.reimbursement = this.getCellValue(row, 5);
    rowData.travelAllowance = this.getCellValue(row, 6);
    rowData.airTicketAllowance = this.getCellValue(row, 7);
    rowData.medicalAllowance = this.getCellValue(row, 8);
    rowData.isActive = this.parseBoolean(this.getCellValue(row, 9), false);
    rowData.effectiveFrom = this.getCellValue(row, 10);
    rowData.effectiveTo = this.getCellValue(row, 11);
  }

  /**
   * Parse Salary Structure row
   */
  private parseSalaryStructureRow(row: ExcelJS.Row, rowData: IImportRow): void {
    rowData.name = this.getCellValue(row, 1);
    rowData.country = this.getCellValue(row, 2);
    rowData.basicPercentage = this.getCellValue(row, 3);
    rowData.hraPercentage = this.getCellValue(row, 4);
    rowData.daPercentage = this.getCellValue(row, 5);
    rowData.otherAllowancePercentage = this.getCellValue(row, 6);
    rowData.travelAllowancePercentage = this.getCellValue(row, 7);
    rowData.reimbursementPercentage = this.getCellValue(row, 8);
    rowData.epfEmployeeContribution = this.getCellValue(row, 9);
    rowData.epfEmployerContribution = this.getCellValue(row, 10);
    rowData.epfMaxLimit = this.getCellValue(row, 11);
    rowData.esiEmployeeContribution = this.getCellValue(row, 12);
    rowData.esiEmployerContribution = this.getCellValue(row, 13);
    rowData.esiApplicabilityLimit = this.getCellValue(row, 14);
  }

  /**
   * Parse Attendance Record row
   */
  private parseAttendanceRecordRow(row: ExcelJS.Row, rowData: IImportRow): void {
    rowData.userId = this.getCellValue(row, 1);
    rowData.shiftId = this.getCellValue(row, 2);
    rowData.shiftCode = this.getCellValue(row, 3);
    rowData.shiftDay = this.getCellValue(row, 4);
    rowData.shiftDayEnd = this.getCellValue(row, 5); // Column 5 - Range End Date
    rowData.shiftStart = this.getCellValue(row, 6); // Column 6
    rowData.shiftEnd = this.getCellValue(row, 7); // Column 7
    rowData.firstIn = null; // Not in simplified template
    rowData.lastOut = null; // Not in simplified template
    rowData.totalWorkHours = null; // Auto-calculated
    rowData.breakHours = null; // Auto-calculated
    rowData.actualWorkHours = null; // Auto-calculated
    rowData.shiftHours = null; // Auto-calculated
    rowData.shortfallHours = null; // Auto-calculated
    rowData.excessHours = null; // Auto-calculated
    rowData.status = null; // Auto-set
    rowData.isWithinWindow = false; // Default
    rowData.isLateEntry = false; // Default
    rowData.isEarlyExit = false; // Default
    rowData.attendanceType = this.getCellValue(row, 8); // Column 8
    rowData.halfType = this.getCellValue(row, 9); // Column 9
    rowData.isWFH = this.parseBoolean(this.getCellValue(row, 10), false); // Column 10
  }

  /**
   * Validate imported data
   */
  async validateImportData(
    parsedData: { [objectType: string]: IImportRow[] },
    objects: ExportableObject[]
  ): Promise<{ [objectType: string]: IValidationResult }> {
    const results: { [objectType: string]: IValidationResult } = {};

    console.log('🔍 [Validation Service] Starting validation for objects:', objects);

    for (const objectType of objects) {
      const rows = parsedData[objectType] || [];
      console.log(`🔍 [Validation Service] Validating ${objectType}: ${rows.length} rows`);

      switch (objectType) {
        case 'user':
          results[objectType] = await this.validateUsers(rows);
          break;
        case 'shift':
          results[objectType] = await this.validateShifts(rows);
          break;
        case 'leave':
          results[objectType] = await this.validateLeaves(rows);
          break;
        case 'salary-assignment':
          results[objectType] = await this.validateSalaryAssignments(rows);
          break;
        case 'salary-structure':
          results[objectType] = await this.validateSalaryStructures(rows);
          break;
        case 'attendance-record':
          results[objectType] = await this.validateAttendanceRecords(rows);
          break;
      }

      // Log validation result for this object type
      if (results[objectType]) {
        const result = results[objectType];
        console.log(`✅ [Validation Service] ${objectType} validation complete:`, {
          valid: result.summary.validRows,
          invalid: result.summary.invalidRows,
          errors: result.summary.errors,
          warnings: result.summary.warnings
        });
      }
    }

    console.log('✅ [Validation Service] All validations completed');
    return results;
  }

  /**
   * Validate User rows
   */
  private async validateUsers(rows: IImportRow[]): Promise<IValidationResult> {
    const validRows: IImportRow[] = [];
    const invalidRows: IImportRow[] = [];
    const errors: IValidationError[] = [];

    // Track duplicates within file
    const emailMap = new Map<string, number[]>();
    const employeeNoMap = new Map<string, number[]>();
    const checkinIdMap = new Map<string, number[]>();
    const biometricIdMap = new Map<string, number[]>();
    const userShiftMap = new Map<string, number[]>(); // Track user+shift combinations

    // First pass: Detect duplicates within file
    for (const row of rows) {
      if (row.email) {
        const email = row.email.toLowerCase().trim();
        if (!emailMap.has(email)) emailMap.set(email, []);
        emailMap.get(email)!.push(row.rowNumber);
      }
      if (row.employeeNo) {
        const empNo = row.employeeNo.trim();
        if (!employeeNoMap.has(empNo)) employeeNoMap.set(empNo, []);
        employeeNoMap.get(empNo)!.push(row.rowNumber);
      }
      if (row.checkinId) {
        const checkin = row.checkinId.trim();
        if (!checkinIdMap.has(checkin)) checkinIdMap.set(checkin, []);
        checkinIdMap.get(checkin)!.push(row.rowNumber);
      }
      if (row.biometricId && row.country?.trim() && row.country.trim() !== 'IN' && row.country.trim() !== 'AE') {
        const bio = row.biometricId.trim();
        if (!biometricIdMap.has(bio)) biometricIdMap.set(bio, []);
        biometricIdMap.get(bio)!.push(row.rowNumber);
      }
      // Track user+shift combinations for duplicate detection
      if (row.email && row.shiftId) {
        const email = row.email.toLowerCase().trim();
        const shiftId = row.shiftId.trim();
        const key = `${email}_${shiftId}`;
        if (!userShiftMap.has(key)) userShiftMap.set(key, []);
        userShiftMap.get(key)!.push(row.rowNumber);
      }
    }

    // Get all unique emails for batch database check (only for provided emails)
    const emails = [...new Set(rows.map(r => r.email?.toLowerCase().trim()).filter(Boolean))];
    const employeeNos = [...new Set(rows.map(r => r.employeeNo?.trim()).filter(Boolean))];
    const checkinIds = [...new Set(rows.map(r => r.checkinId?.trim()).filter(Boolean))];
    const biometricIds = [...new Set(rows.map(r => r.biometricId?.trim()).filter(Boolean))];

    // Batch check database for duplicates
    const existingUsers = await User.find({
      $or: [
        { email: { $in: emails } },
        { employeeCode: { $in: employeeNos } },
        { checkinId: { $in: checkinIds } },
        { biometricId: { $in: biometricIds } }
      ]
    }).select('email employeeCode checkinId biometricId portalAccess').lean();

    // Emails of users with portal access (true or missing); duplicate email allowed when row has Portal Access=No
    const existingEmailsPortalOnly = new Set(
      existingUsers.filter((u: any) => u.portalAccess !== false).map((u: any) => u.email?.toLowerCase()).filter(Boolean)
    );
    const existingEmployeeNos = new Set(existingUsers.map(u => u.employeeCode).filter(Boolean));
    const existingCheckinIds = new Set(existingUsers.map(u => u.checkinId).filter(Boolean));
    const existingBiometricIds = new Set(existingUsers.map(u => u.biometricId).filter(Boolean));

    // Batch check departments, managers, and holiday calendars
    const departmentIds = [...new Set(rows.map(r => r.departmentId?.trim()).filter(Boolean))];
    const managerIds = [...new Set(rows.map(r => r.managerId?.trim()).filter(Boolean).filter(id => this.isValidObjectId(id)))];
    const holidayCalendarIds = [...new Set(rows.map(r => r.holidayCalendarId?.trim()).filter(Boolean).filter(id => this.isValidObjectId(id)))];

    const validDepartmentIds = new Set<string>();
    if (departmentIds.length > 0) {
      const departments = await LOV.find({
        type: 'department',
        'values.value': { $in: departmentIds },
        'values.isActive': true
      }).lean();
      departments.forEach(d => {
        d.values.filter(v => v.isActive).forEach(v => validDepartmentIds.add(v.value));
      });
    }

    const validManagerIds = new Set<string>();
    if (managerIds.length > 0) {
      const managers = await User.find({
        _id: { $in: managerIds.map(id => new Types.ObjectId(id)) }
      }).select('_id').lean();
      managers.forEach(m => validManagerIds.add(m._id.toString()));
    }

    const validHolidayCalendarIds = new Set<string>();
    if (holidayCalendarIds.length > 0) {
      const calendars = await HolidayCalendar.find({
        _id: { $in: holidayCalendarIds.map(id => new Types.ObjectId(id)) }
      }).select('_id').lean();
      calendars.forEach(c => validHolidayCalendarIds.add(c._id.toString()));
    }

    // Batch check shift IDs (if provided for automatic shift assignment)
    const shiftIds = [...new Set(rows.map(r => r.shiftId?.trim()).filter(Boolean).filter(id => this.isValidObjectId(id)))];
    const validShiftIds = new Map<string, { id: string; code: string }>();
    if (shiftIds.length > 0) {
      const shifts = await Shift.find({
        _id: { $in: shiftIds.map(id => new Types.ObjectId(id)) }
      }).select('_id code').lean();
      shifts.forEach(s => {
        validShiftIds.set(s._id.toString(), { id: s._id.toString(), code: s.code });
      });
    }

    // Second pass: Validate each row
    for (const row of rows) {
      const rowErrors: IValidationError[] = [];

      // Required fields
      if (!row.name?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'name',
          message: 'Name is required',
          severity: 'error'
        });
      }

      // Email validation: Required for active users, optional for inactive users (historical data)
      const isActive = row.active !== undefined ? row.active : true; // Default to true if not specified

      if (!row.email?.trim()) {
        if (isActive) {
          // Email is required for active users
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'email',
            message: 'Email is required for active users (Active=Yes)',
            severity: 'error'
          });
        }
        // If inactive, email is optional - no error (for historical data migration)
      } else {
        // Email format validation - accepts formats like: user@domain.com, user@domain.ae, user@subdomain.domain.com
        // Examples: pravinraja@clouddesk.ae, john@example.com, user.name@company.co.uk
        // Supports: standard emails, .ae domains, subdomains, and multi-part TLDs
        const emailRegex = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const trimmedEmail = row.email.trim();

        // Log for debugging
        console.log(`🔍 [Email Validation] Row ${row.rowNumber}: Validating email: "${trimmedEmail}"`);

        if (!emailRegex.test(trimmedEmail)) {
          console.error(`❌ [Email Validation] Row ${row.rowNumber}: Email failed regex test: "${trimmedEmail}"`);
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'email',
            message: 'Invalid email format. Expected format: user@domain.com or user@domain.ae',
            severity: 'error'
          });
        } else {
          console.log(`✅ [Email Validation] Row ${row.rowNumber}: Email format is valid: "${trimmedEmail}"`);
          // Duplicate email: only reject when row has Portal Access=Yes and email exists for a portal user. Allow duplicate when Portal Access=No (payroll-only).
          const hasPortalAccess = row.portalAccess !== undefined ? row.portalAccess : true;
          if (hasPortalAccess && existingEmailsPortalOnly.has(row.email.toLowerCase().trim())) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'email',
              message: 'Email already exists for a user with portal access. Use Portal Access=No for payroll-only employee with same email.',
              severity: 'error'
            });
          }

          // Duplicate within file: same email allowed only if at most one row has Portal Access=Yes (Emp-1 + Emp-2)
          const email = row.email.toLowerCase().trim();
          const duplicateRows = emailMap.get(email);
          if (duplicateRows && duplicateRows.length > 1) {
            const rowsWithSameEmail = rows.filter((r: any) => duplicateRows.includes(r.rowNumber));
            const portalAccessTrueCount = rowsWithSameEmail.filter((r: any) => r.portalAccess !== false).length;
            if (portalAccessTrueCount > 1) {
              rowErrors.push({
                rowNumber: row.rowNumber,
                field: 'email',
                message: 'Duplicate email: only one row with this email can have Portal Access=Yes. Use Portal Access=No for payroll-only.',
                severity: 'error'
              });
            }
            // When same email has one Portal=Yes and one Portal=No, the Portal=Yes row must appear first so insert order creates portal user before payroll-only
            if (portalAccessTrueCount === 1) {
              const firstRowNumber = Math.min(...rowsWithSameEmail.map((r: any) => r.rowNumber));
              const firstRow = rowsWithSameEmail.find((r: any) => r.rowNumber === firstRowNumber);
              const hasPortalNoFirst = firstRow && firstRow.portalAccess === false;
              const thisRowIsPortalYes = row.portalAccess !== false;
              if (hasPortalNoFirst && thisRowIsPortalYes && row.rowNumber !== firstRowNumber) {
                rowErrors.push({
                  rowNumber: row.rowNumber,
                  field: 'email',
                  message: 'Duplicate email: the row with Portal Access=Yes must appear before the row with Portal Access=No (same email). Put the portal user row first.',
                  severity: 'error'
                });
              }
            }
          }
        }
      }

      if (!row.role?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'role',
          message: 'Role is required',
          severity: 'error'
        });
      } else {
        if (!CONSTANTS.VALID_ROLES.includes(row.role.toLowerCase() as any)) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'role',
            message: `Role must be one of: ${CONSTANTS.VALID_ROLES.join(', ')}`,
            severity: 'error'
          });
        }
      }

      if (!row.departmentId?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'departmentId',
          message: 'Department ID is required',
          severity: 'error'
        });
      } else if (!validDepartmentIds.has(row.departmentId.trim())) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'departmentId',
          message: 'Department not found or inactive',
          severity: 'error'
        });
      }

      // Manager validation (required)
      if (!row.managerId?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'managerId',
          message: 'Manager ID is required',
          severity: 'error'
        });
      } else {
        if (!this.isValidObjectId(row.managerId.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'managerId',
            message: 'Invalid Manager ID format',
            severity: 'error'
          });
        } else if (!validManagerIds.has(row.managerId.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'managerId',
            message: 'Manager not found',
            severity: 'error'
          });
        }
      }

      // Cost Center validation (required)
      if (!row.costCenter?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'costCenter',
          message: 'Cost Center is required',
          severity: 'error'
        });
      }

      // Employment Status validation (required)
      if (!row.employmentStatus?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'employmentStatus',
          message: 'Employment Status is required',
          severity: 'error'
        });
      }

      // Employee Number validation (Required)
      if (!row.employeeNo?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'employeeNo',
          message: 'Employee Number is required',
          severity: 'error'
        });
      } else {
        if (existingEmployeeNos.has(row.employeeNo.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'employeeNo',
            message: 'Employee number already exists in database',
            severity: 'error'
          });
        }

        const duplicateRows = employeeNoMap.get(row.employeeNo.trim());
        if (duplicateRows && duplicateRows.length > 1) {
          const isFirst = duplicateRows[0] === row.rowNumber;
          if (!isFirst) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'employeeNo',
              message: `Duplicate employee number found in row ${duplicateRows[0]}`,
              severity: 'error'
            });
          }
        }
      }

      // Notice Period validation (Required)
      if (row.noticePeriod === undefined || row.noticePeriod === null || row.noticePeriod === '') {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'noticePeriod',
          message: 'Notice Period is required',
          severity: 'error'
        });
      }

      // Check-in ID validation
      if (row.checkinId?.trim()) {
        if (existingCheckinIds.has(row.checkinId.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'checkinId',
            message: 'Check-in ID already exists in database',
            severity: 'error'
          });
        }

        const duplicateRows = checkinIdMap.get(row.checkinId.trim());
        if (duplicateRows && duplicateRows.length > 1) {
          const isFirst = duplicateRows[0] === row.rowNumber;
          if (!isFirst) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'checkinId',
              message: `Duplicate check-in ID found in row ${duplicateRows[0]}`,
              severity: 'error'
            });
          }
        }
      }

      // Biometric ID validation (only for non-IN/AE countries)
      if (row.biometricId?.trim() && row.country?.trim() && row.country.trim() !== 'IN' && row.country.trim() !== 'AE') {
        if (existingBiometricIds.has(row.biometricId.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'biometricId',
            message: 'Biometric ID already exists in database',
            severity: 'error'
          });
        }

        const duplicateRows = biometricIdMap.get(row.biometricId.trim());
        if (duplicateRows && duplicateRows.length > 1) {
          const isFirst = duplicateRows[0] === row.rowNumber;
          if (!isFirst) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'biometricId',
              message: `Duplicate biometric ID found in row ${duplicateRows[0]}`,
              severity: 'error'
            });
          }
        }
      }

      // Confirmation Date validation (optional)
      if (row.confirmationDate) {
        const confirmationDate = this.parseDate(row.confirmationDate);
        if (!confirmationDate) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'confirmationDate',
            message: 'Invalid confirmation date format. Expected: YYYY-MM-DD or DD/MM/YYYY',
            severity: 'error'
          });
        }
      }

      // Probation Date validation (optional)
      if (row.probationDate) {
        const probationDate = this.parseDate(row.probationDate);
        if (!probationDate) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'probationDate',
            message: 'Invalid probation date format. Expected: YYYY-MM-DD or DD/MM/YYYY',
            severity: 'error'
          });
        }
      }

      // Date of Birth validation (required)
      if (!row.dateOfBirth) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'dateOfBirth',
          message: 'Date of birth is required',
          severity: 'error'
        });
      } else {
        const dob = this.parseDate(row.dateOfBirth);
        if (!dob) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'dateOfBirth',
            message: 'Invalid date of birth format. Expected: YYYY-MM-DD or DD/MM/YYYY',
            severity: 'error'
          });
        }
      }

      // Joining Date validation (required)
      if (!row.joiningDate) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'joiningDate',
          message: 'Joining date is required',
          severity: 'error'
        });
      } else {
        const date = this.parseDate(row.joiningDate);
        if (!date) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'joiningDate',
            message: 'Invalid joining date format. Expected: YYYY-MM-DD or DD/MM/YYYY',
            severity: 'error'
          });
        }
      }

      // Country validation (required field)
      if (!row.country || !row.country.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'country',
          message: 'Country is required',
          severity: 'error'
        });
      } else if (!CONSTANTS.VALID_COUNTRIES.includes(row.country.trim())) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'country',
          message: `Country must be one of: ${CONSTANTS.VALID_COUNTRIES.join(', ')}`,
          severity: 'error'
        });
      }

      // Currency-country validation (country is required, so this will always run if currency is provided)
      if (row.country?.trim() && row.currency) {
        const expectedCurrency = row.country.trim() === 'AE' ? CONSTANTS.DEFAULT_CURRENCY_AED : CONSTANTS.DEFAULT_CURRENCY_INR;
        if (row.currency !== expectedCurrency) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'currency',
            message: `Currency ${row.currency} does not match country ${row.country.trim()}. Expected ${expectedCurrency}`,
            severity: 'warning'
          });
        }
      }

      // Holiday Calendar validation
      if (row.holidayCalendarId) {
        if (!this.isValidObjectId(row.holidayCalendarId.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'holidayCalendarId',
            message: 'Invalid Holiday Calendar ID format',
            severity: 'error'
          });
        } else if (!validHolidayCalendarIds.has(row.holidayCalendarId.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'holidayCalendarId',
            message: 'Holiday Calendar not found',
            severity: 'error'
          });
        }
      }

      // Shift ID validation (if provided - for automatic shift assignment)
      if (row.shiftId?.trim()) {
        if (!this.isValidObjectId(row.shiftId.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'shiftId',
            message: 'Invalid Shift ID format',
            severity: 'error'
          });
        } else if (!validShiftIds.has(row.shiftId.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'shiftId',
            message: 'Shift not found',
            severity: 'error'
          });
        } else {
          // Check for duplicate user+shift combination within file
          if (row.email) {
            const email = row.email.toLowerCase().trim();
            const shiftId = row.shiftId.trim();
            const key = `${email}_${shiftId}`;
            const duplicateRows = userShiftMap.get(key);
            if (duplicateRows && duplicateRows.length > 1) {
              const isFirst = duplicateRows[0] === row.rowNumber;
              if (!isFirst) {
                rowErrors.push({
                  rowNumber: row.rowNumber,
                  field: 'shiftId',
                  message: `Duplicate user+shift combination found in row ${duplicateRows[0]}. Same user cannot be assigned the same shift multiple times.`,
                  severity: 'error'
                });
              }
            }
          }

          // Store shift code for later use in shift assignment creation
          const shiftInfo = validShiftIds.get(row.shiftId.trim());
          if (shiftInfo) {
            (row as any).shiftCode = shiftInfo.code;
          }
        }
      }

      // Visa details validation (for AE users)
      const country = row.country?.trim() || '';
      const hasVisaType = row.visaType?.trim();
      const hasVisaExpiryDate = row.visaExpiryDate?.trim();

      if (country === 'AE') {
        // If any visa field is provided, all required fields must be present
        if (hasVisaType || hasVisaExpiryDate) {
          // If visa details are provided, both visaType and visaExpiryDate are required
          if (!hasVisaType) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'visaType',
              message: 'Visa type is required when visa details are provided for AE users',
              severity: 'error'
            });
          } else if (!CONSTANTS.VALID_VISA_TYPES.includes(hasVisaType)) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'visaType',
              message: `Visa type must be one of: ${CONSTANTS.VALID_VISA_TYPES.join(', ')}`,
              severity: 'error'
            });
          }

          if (!hasVisaExpiryDate) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'visaExpiryDate',
              message: 'Visa expiry date is required when visa details are provided for AE users',
              severity: 'error'
            });
          } else {
            const visaExpiryDate = this.parseDate(hasVisaExpiryDate);
            if (!visaExpiryDate) {
              rowErrors.push({
                rowNumber: row.rowNumber,
                field: 'visaExpiryDate',
                message: 'Invalid visa expiry date format (expected YYYY-MM-DD)',
                severity: 'error'
              });
            } else if (visaExpiryDate <= new Date()) {
              rowErrors.push({
                rowNumber: row.rowNumber,
                field: 'visaExpiryDate',
                message: 'Visa expiry date must be in the future',
                severity: 'error'
              });
            }
          }
        }
      } else {
        // For non-AE users, visa details should not be provided
        if (hasVisaType || hasVisaExpiryDate) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'visaDetails',
            message: 'Visa details are only applicable for AE (UAE) users',
            severity: 'warning'
          });
        }
      }

      // Optional date field validation
      if (row.dateOfBirth) {
        const date = this.parseDate(row.dateOfBirth);
        if (!date) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'dateOfBirth',
            message: 'Invalid date of birth format (expected YYYY-MM-DD or DD/MM/YYYY)',
            severity: 'error'
          });
        }
      }

      if (row.separationDate) {
        const date = this.parseDate(row.separationDate);
        if (!date) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'separationDate',
            message: 'Invalid separation date format (expected YYYY-MM-DD or DD/MM/YYYY)',
            severity: 'error'
          });
        }
      }

      // Marital Status validation
      if (row.maritalStatus?.trim()) {
        const validStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];
        if (!validStatuses.includes(row.maritalStatus.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'maritalStatus',
            message: `Marital status must be one of: ${validStatuses.join(', ')}`,
            severity: 'error'
          });
        }
      }

      // Notice Period validation
      if (row.noticePeriod) {
        const noticePeriod = Number(row.noticePeriod);
        if (isNaN(noticePeriod) || noticePeriod < 0) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'noticePeriod',
            message: 'Notice period must be a non-negative number',
            severity: 'error'
          });
        }
      }

      // Personal Mail ID validation
      if (row.personalMailId?.trim()) {
        const emailRegex = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(row.personalMailId.trim())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'personalMailId',
            message: 'Invalid personal email format. Expected format: user@domain.com',
            severity: 'error'
          });
        }
      }

      // Categorize row
      const hasErrors = rowErrors.some(e => e.severity === 'error');
      if (hasErrors) {
        invalidRows.push(row);
      } else {
        validRows.push(row);
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
        warnings: errors.filter(e => e.severity === 'warning').length
      }
    };
  }

  /**
   * Validate Shift rows
   */
  private async validateShifts(rows: IImportRow[]): Promise<IValidationResult> {
    const validRows: IImportRow[] = [];
    const invalidRows: IImportRow[] = [];
    const errors: IValidationError[] = [];

    // Track duplicates within file
    const codeMap = new Map<string, number[]>();

    for (const row of rows) {
      if (row.code) {
        const code = row.code.toUpperCase().trim();
        if (!codeMap.has(code)) codeMap.set(code, []);
        codeMap.get(code)!.push(row.rowNumber);
      }
    }

    // Batch check database
    const codes = [...new Set(rows.map(r => r.code?.toUpperCase().trim()).filter(Boolean))];
    const existingShifts = await Shift.find({ code: { $in: codes } }).select('code').lean();
    const existingCodes = new Set(existingShifts.map(s => s.code?.toUpperCase()));

    for (const row of rows) {
      const rowErrors: IValidationError[] = [];

      // Required fields
      if (!row.name?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'name',
          message: 'Name is required',
          severity: 'error'
        });
      }

      if (!row.code?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'code',
          message: 'Code is required',
          severity: 'error'
        });
      } else {
        const code = row.code.toUpperCase().trim();
        if (existingCodes.has(code)) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'code',
            message: 'Shift code already exists in database',
            severity: 'error'
          });
        }

        const duplicateRows = codeMap.get(code);
        if (duplicateRows && duplicateRows.length > 1) {
          const isFirst = duplicateRows[0] === row.rowNumber;
          if (!isFirst) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'code',
              message: `Duplicate shift code found in row ${duplicateRows[0]}`,
              severity: 'error'
            });
          }
        }
      }

      // Time format validation
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!row.startTime || !timeRegex.test(row.startTime)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'startTime',
          message: 'Start time must be in HH:mm format',
          severity: 'error'
        });
      }

      if (!row.endTime || !timeRegex.test(row.endTime)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'endTime',
          message: 'End time must be in HH:mm format',
          severity: 'error'
        });
      }

      // Validate shift window times (required fields)
      if (!row.shiftWindowStart?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftWindowStart',
          message: 'Shift window start time is required',
          severity: 'error'
        });
      } else if (!timeRegex.test(row.shiftWindowStart)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftWindowStart',
          message: 'Shift window start time must be in HH:mm format',
          severity: 'error'
        });
      }

      if (!row.shiftWindowEnd?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftWindowEnd',
          message: 'Shift window end time is required',
          severity: 'error'
        });
      } else if (!timeRegex.test(row.shiftWindowEnd)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftWindowEnd',
          message: 'Shift window end time must be in HH:mm format',
          severity: 'error'
        });
      }

      // Validate shift time logic (if all times are provided)
      if (row.startTime && row.endTime && row.shiftWindowStart && row.shiftWindowEnd &&
        timeRegex.test(row.startTime) && timeRegex.test(row.endTime) &&
        timeRegex.test(row.shiftWindowStart) && timeRegex.test(row.shiftWindowEnd)) {
        const startParts = row.startTime.split(':').map(Number);
        const endParts = row.endTime.split(':').map(Number);
        const windowStartParts = row.shiftWindowStart.split(':').map(Number);
        const windowEndParts = row.shiftWindowEnd.split(':').map(Number);

        const startMinutes = startParts[0] * 60 + startParts[1];
        const endMinutes = endParts[0] * 60 + endParts[1];
        const windowStartMinutes = windowStartParts[0] * 60 + windowStartParts[1];
        const windowEndMinutes = windowEndParts[0] * 60 + windowEndParts[1];

        const isOvernight = row.isOvernightShift !== undefined ? row.isOvernightShift : false;

        // Validate shift window start is before or equal to shift start
        if (windowStartMinutes > startMinutes) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'shiftWindowStart',
            message: 'Shift window start time must be before or equal to shift start time',
            severity: 'error'
          });
        }

        // Validate shift window end is after shift start
        if (windowEndMinutes < startMinutes) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'shiftWindowEnd',
            message: 'Shift window end time must be after shift start time',
            severity: 'error'
          });
        }

        // Validate shift end is after shift start for regular shifts
        if (!isOvernight && endMinutes <= startMinutes) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'endTime',
            message: 'Shift end time must be after shift start time for regular shifts',
            severity: 'error'
          });
        }

        // For overnight shifts, ensure end time is less than start time
        if (isOvernight && endMinutes > startMinutes) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'endTime',
            message: 'For overnight shifts, end time must be on the next day (less than start time)',
            severity: 'error'
          });
        }
      }

      // Date validation
      if (row.validFrom) {
        const date = this.parseDate(row.validFrom);
        if (!date) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'validFrom',
            message: 'Invalid valid from date format (expected YYYY-MM-DD)',
            severity: 'error'
          });
        }
      }

      const hasErrors = rowErrors.some(e => e.severity === 'error');
      if (hasErrors) {
        invalidRows.push(row);
      } else {
        validRows.push(row);
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
        warnings: errors.filter(e => e.severity === 'warning').length
      }
    };
  }

  /**
   * Validate Leave rows
   */
  private async validateLeaves(rows: IImportRow[]): Promise<IValidationResult> {
    const validRows: IImportRow[] = [];
    const invalidRows: IImportRow[] = [];
    const errors: IValidationError[] = [];

    // Batch validate user IDs and get User Joining Dates
    const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean).filter(id => this.isValidObjectId(id)))];

    // Ensure "Leave Types" LOV exists (for ID reference required by Leave Model)
    // Try to find 'leavetype' first (system standard), then fallback to 'leave_type'
    let leaveTypeLov = await LOV.findOne({ type: 'leavetype' });
    if (!leaveTypeLov) {
      leaveTypeLov = await LOV.findOne({ type: 'leave_type' });
    }

    if (!leaveTypeLov) {
      console.log('ℹ️ [Data Migration] Creating missing "leavetype" LOV document...');
      leaveTypeLov = await LOV.create({
        name: 'Leave Types',
        type: 'leavetype', // Use system default 'leavetype' 
        values: ALL_LEAVE_TYPES.map(t => ({
          label: LEAVE_TYPE_LABELS[t] || t,
          value: t,
          isActive: true
        }))
      });
    }
    const leaveTypeLovId = leaveTypeLov._id.toString();

    const [existingUsers, existingLeaves] = await Promise.all([
      userIds.length > 0
        ? User.find({ _id: { $in: userIds.map(id => new Types.ObjectId(id)) } })
          .select('_id joiningDate holidayCalendarId country')
          .lean()
        : Promise.resolve([]),
      userIds.length > 0
        ? Leave.find({
          userId: { $in: userIds.map(id => new Types.ObjectId(id)) },
          status: { $in: ['Approved', 'Pending'] }
        })
          .select('userId startDate endDate')
          .lean()
        : Promise.resolve([])
    ]);

    const validUserIds = new Set(existingUsers.map(u => u._id.toString()));
    const userMap = new Map<string, any>();
    existingUsers.forEach(u => userMap.set(u._id.toString(), u)); // Map full user obj for Holiday Cal check

    // ... (rest of caching)

    // Cache Holidays for relevant Calendars to minimize DB calls
    // We fetch calendars for all relevant years and all user assignments
    const yearsInImport = [...new Set(rows.map(r => {
      const d = this.parseDate(r.startDate || '');
      return d ? d.getFullYear() : null;
    }).filter(y => y !== null))] as number[];

    const currentCalendarIds = [...new Set(existingUsers.map(u => u.holidayCalendarId).filter(id => !!id).map(id => id!.toString()))];
    const holidaysMap = new Map<string, Array<{ originalDate: Date, type: string }>>(); // Key: CalendarID
    const userYearHolidaysMap = new Map<string, Array<{ originalDate: Date, type: string }>>(); // Key: userId_year

    if (currentCalendarIds.length > 0 || yearsInImport.length > 0) {
      const calendars = await HolidayCalendar.find({
        $or: [
          { _id: { $in: currentCalendarIds.map(id => new Types.ObjectId(id)) } },
          {
            year: { $in: yearsInImport },
            assignedTo: { $in: userIds.map(id => new Types.ObjectId(id)) }
          }
        ]
      }).select('_id year assignedTo holidays').lean();

      calendars.forEach(cal => {
        const hList = cal.holidays.map(h => ({
          originalDate: new Date(h.date),
          type: h.type
        }));

        // Cache by Calendar ID
        holidaysMap.set(cal._id.toString(), hList);

        // Cache by userId_year for precise lookup
        if (cal.assignedTo) {
          cal.assignedTo.forEach(uid => {
            userYearHolidaysMap.set(`${uid.toString()}_${cal.year}`, hList);
          });
        }
      });
    }
    console.log('DEBUG: Using Leave Type LOV ID:', leaveTypeLovId);

    // Map for Joining Date Check
    const userJoiningDateMap = new Map<string, Date>();
    existingUsers.forEach(u => {
      if (u.joiningDate) userJoiningDateMap.set(u._id.toString(), new Date(u.joiningDate));
    });

    // Map for Duplicate Check (userId -> list of existing leave ranges)
    const userLeavesMap = new Map<string, Array<{ start: number, end: number }>>();
    existingLeaves.forEach(l => {
      const uid = l.userId.toString();
      if (!userLeavesMap.has(uid)) userLeavesMap.set(uid, []);
      // Store as timestamps for easier comparison
      const s = new Date(l.startDate);
      const e = new Date(l.endDate);
      // Normalize time to handle full day overlaps correctly
      s.setUTCHours(0, 0, 0, 0);
      e.setUTCHours(23, 59, 59, 999);
      userLeavesMap.get(uid)?.push({ start: s.getTime(), end: e.getTime() });
    });

    for (const row of rows) {
      const rowErrors: IValidationError[] = [];

      // Required fields: UserId, LeaveTypeId, StartDate, EndDate
      if (!row.userId) {
        rowErrors.push({ rowNumber: row.rowNumber, field: 'userId', message: 'User ID is required', severity: 'error' });
      } else if (!this.isValidObjectId(row.userId)) {
        rowErrors.push({ rowNumber: row.rowNumber, field: 'userId', message: 'Invalid User ID format', severity: 'error' });
      } else {
        if (!validUserIds.has(row.userId)) {
          rowErrors.push({ rowNumber: row.rowNumber, field: 'userId', message: 'User not found', severity: 'error' });
        }
      }

      // Resolve Leave Type
      let inputTypeName = row.leaveTypeName?.toString().trim();
      let matchedType: string | undefined = undefined;

      if (inputTypeName) {
        matchedType = ALL_LEAVE_TYPES.find(t => t.toLowerCase() === inputTypeName!.toLowerCase());
      } else if (row.leaveTypeId) {
        const potentialType = row.leaveTypeId.toString().trim();
        matchedType = ALL_LEAVE_TYPES.find(t => t.toLowerCase() === potentialType.toLowerCase());
      }

      let isValidType = false;
      if (matchedType) {
        isValidType = true;
        row.leaveTypeId = leaveTypeLovId; // Set the LOV Group ID as required by Model
        row.leaveType = matchedType;      // Set the correctly cased type string (e.g., 'compOff')
      }

      if (!isValidType) {
        const displayValue = inputTypeName || row.leaveTypeId || 'Unknown';
        if (!displayValue || displayValue === 'Unknown') {
          rowErrors.push({ rowNumber: row.rowNumber, field: 'leaveTypeName', message: 'Leave Type Name is required', severity: 'error' });
        } else {
          rowErrors.push({ rowNumber: row.rowNumber, field: 'leaveTypeId', message: `Invalid Leave Type: '${displayValue}'. Allowed: ${ALL_LEAVE_TYPES.join(', ')}`, severity: 'error' });
        }
      }

      const startDate = row.startDate ? this.parseDate(row.startDate) : null;
      const endDate = row.endDate ? this.parseDate(row.endDate) : null;

      if (!startDate) {
        rowErrors.push({ rowNumber: row.rowNumber, field: 'startDate', message: 'Invalid start date format (expected YYYY-MM-DD)', severity: 'error' });
      }

      if (!endDate) {
        rowErrors.push({ rowNumber: row.rowNumber, field: 'endDate', message: 'Invalid end date format (expected YYYY-MM-DD)', severity: 'error' });
      }

      // VALIDATION 3: Check Shift Assignment Start Date
      // User cannot apply for leave BEFORE their shift assignment starts (similar to Joining Date check)
      if (row.userId && startDate) {
        // Find the shift assignment that covers this start date OR the first future one if none covers it yet?
        // Usually, we just want to ensure they HAVE a shift assignment active or past for this date.
        // If they try to apply for a date BEFORE their very first shift assignment, it should be blocked.

        // We can optimize this by caching shift starts, but for now, let's query.
        // We look for any assignment that starts ON or BEFORE the leave start date.
        const validAssignment = await ShiftAssignment.findOne({
          userId: row.userId,
          startDate: { $lte: new Date(startDate) }
        });

        if (!validAssignment) {
          // No assignment found on or before this date. 
          // Check if there is ANY assignment at all to give a better error message.
          const firstAssignment = await ShiftAssignment.findOne({ userId: row.userId }).sort({ startDate: 1 });

          if (firstAssignment) {
            const earliestDate = new Date(firstAssignment.startDate).toISOString().split('T')[0];
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'startDate',
              message: `Cannot apply leave before Shift Assignment Start Date (${earliestDate})`,
              severity: 'error'
            });
          } else {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'startDate',
              message: `No Shift Assignment found for this user.`,
              severity: 'error'
            });
          }
        }
      }
      // VALIDATION 1: Check Joining Date
      if (row.userId && validUserIds.has(row.userId) && startDate) {
        const joiningDate = userJoiningDateMap.get(row.userId);
        if (joiningDate) {
          // Normalize dates for comparison (ignore time)
          const checkStart = new Date(startDate);
          const checkJoin = new Date(joiningDate);
          checkStart.setUTCHours(0, 0, 0, 0);
          checkJoin.setUTCHours(0, 0, 0, 0);

          if (checkStart < checkJoin) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'startDate',
              message: `Cannot apply for leave before Joining Date (${joiningDate.toISOString().split('T')[0]})`,
              severity: 'error'
            });
          }
        }
      }

      // VALIDATION 2: Check Weekend and Holiday Restrictions
      // Only if basic date checks passed
      if (row.userId && startDate && endDate && !rowErrors.some(e => e.field === 'startDate' || e.field === 'endDate')) {
        const user = userMap.get(row.userId);
        const country = user?.country || 'IN';
        const countryOffsets: Record<string, number> = { 'IN': 5.5, 'AE': 4 };
        const offset = countryOffsets[country] || 5.5;

        const year = startDate.getFullYear();
        let holidays = userYearHolidaysMap.get(`${row.userId}_${year}`);

        // Fallback to currently assigned holidayCalendarId if no year-specific assignment found
        if (!holidays && user?.holidayCalendarId) {
          holidays = holidaysMap.get(user.holidayCalendarId.toString());
        }

        if (!holidays) holidays = [];

        // Check overlapping Shift Assignment for Weekend info
        const loopDate = new Date(startDate);
        const endLoop = new Date(endDate);
        loopDate.setUTCHours(0, 0, 0, 0);
        endLoop.setUTCHours(0, 0, 0, 0);

        while (loopDate <= endLoop) {
          const dateStr = loopDate.toISOString().split('T')[0];

          // STRICT VALIDATION
          // 1. Weekend Check (Universal - No exemptions)
          /*
          const assignment = await ShiftAssignment.findOne({
            userId: row.userId,
            startDate: { $lte: loopDate },
            $or: [{ endDate: { $gte: loopDate } }, { endDate: null }]
          });
  
          if (assignment && assignment.weekendDays && assignment.weekendDays.length > 0) {
            const dayOfWeek = loopDate.getUTCDay();
            if (assignment.weekendDays.includes(dayOfWeek)) {
              rowErrors.push({
                rowNumber: row.rowNumber,
                field: 'startDate',
                message: `Cannot apply '${row.leaveType}' on Weekend (${dateStr}). (Restricted)`,
                severity: 'error'
              });
              break;
            }
          }
          */

          // 2. Holiday Check
          const holiday = holidays?.find(h => {
            const logicalDate = new Date(h.originalDate.getTime() + (offset * 60 * 60 * 1000));
            return logicalDate.toISOString().split('T')[0] === dateStr;
          });

          if (row.leaveType === 'restricted_holiday') {
            if (!holiday) {
              rowErrors.push({
                rowNumber: row.rowNumber,
                field: 'startDate',
                message: `Cannot apply 'Restricted Holiday' on ${dateStr}. This date is NOT defined as an Optional Holiday in your calendar.`,
                severity: 'error'
              });
              break;
            }
            if (holiday.type === 'mandatory') {
              rowErrors.push({
                rowNumber: row.rowNumber,
                field: 'startDate',
                message: `Cannot apply 'Restricted Holiday' on a Mandatory Holiday (${dateStr}).`,
                severity: 'error'
              });
              break;
            }
            if (holiday.type !== 'optional') {
              rowErrors.push({
                rowNumber: row.rowNumber,
                field: 'startDate',
                message: `Date ${dateStr} is a '${holiday.type}' holiday, not an Optional/Restricted holiday.`,
                severity: 'error'
              });
              break;
            }
          }

          // General Rule: Removed to allow range imports.
          // We allow 'Annual' on a Holiday in the Excel, but we will SKIP creating an attendance record for it.
          /*
          const isExemptType = (row.leaveType === 'restricted_holiday' || row.leaveType === 'compensatory_off');
          if (!isExemptType) {
            rowErrors.push({
               rowNumber: row.rowNumber,
               field: 'startDate',
               message: `Cannot apply '${row.leaveType}' on Holiday (${dateStr} - ${holiday.type}). (Restricted)`,
               severity: 'error'
            });
            break;
          }
          */

          loopDate.setUTCDate(loopDate.getUTCDate() + 1);
        }
      }
      // VALIDATION 2: Check Duplicate / Overlapping Leave
      if (row.userId && validUserIds.has(row.userId) && startDate && endDate) {
        const existingUserLeaves = userLeavesMap.get(row.userId);
        if (existingUserLeaves && existingUserLeaves.length > 0) {
          const checkStart = new Date(startDate);
          const checkEnd = new Date(endDate);
          checkStart.setUTCHours(0, 0, 0, 0);
          checkEnd.setUTCHours(23, 59, 59, 999);

          const sTime = checkStart.getTime();
          const eTime = checkEnd.getTime();

          const conflictingLeave = existingUserLeaves.find(l => {
            // Standard overlap: (StartA <= EndB) and (EndA >= StartB)
            return (sTime <= l.end) && (eTime >= l.start);
          });

          if (conflictingLeave) {
            const conflictStart = new Date(conflictingLeave.start).toISOString().split('T')[0];
            const conflictEnd = new Date(conflictingLeave.end).toISOString().split('T')[0];
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'startDate',
              message: `Leave already exists for this date range (Conflict: ${conflictStart} to ${conflictEnd})`,
              severity: 'error'
            });
          }
        }
      }

      // Default values if not provided
      if (!row.leaveDuration) {
        row.leaveDuration = 'full-day';
      }
      if (!row.status) {
        row.status = 'Approved';
      }

      // Validation only if fields are explicitly provided
      if (row.leaveDuration === 'half-day') {
        if (startDate && endDate && startDate.toDateString() !== endDate.toDateString()) {
          // Warn logic...
        }
        if (!row.halfDayType) {
          row.halfDayType = 'first-half';
          // Warning moved or suppressed
        }
      }

      const hasErrors = rowErrors.some(e => e.severity === 'error');
      if (hasErrors) {
        invalidRows.push(row);
      } else {
        validRows.push(row);
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
        warnings: errors.filter(e => e.severity === 'warning').length
      }
    };
  }

  /**
   * Validate Salary Assignment rows
   */
  private async validateSalaryAssignments(rows: IImportRow[]): Promise<IValidationResult> {
    const validRows: IImportRow[] = [];
    const invalidRows: IImportRow[] = [];
    const errors: IValidationError[] = [];

    // Batch validate employee IDs and salary structure IDs
    const employeeIds = [...new Set(rows.map(r => r.employeeId).filter(Boolean).filter(id => this.isValidObjectId(id)))];
    const salaryStructureIds = [...new Set(rows.map(r => r.salaryStructureId).filter(Boolean).filter(id => this.isValidObjectId(id)))];

    const [existingEmployees, existingStructures] = await Promise.all([
      employeeIds.length > 0
        ? User.find({ _id: { $in: employeeIds.map(id => new Types.ObjectId(id)) } })
          .select('_id')
          .lean()
        : Promise.resolve([]),
      salaryStructureIds.length > 0
        ? SalaryStructure.find({ _id: { $in: salaryStructureIds.map(id => new Types.ObjectId(id)) } })
          .select('_id')
          .lean()
        : Promise.resolve([])
    ]);

    const validEmployeeIds = new Set(existingEmployees.map(e => e._id.toString()));
    const validSalaryStructureIds = new Set(existingStructures.map(s => s._id.toString()));

    // Validate each row
    for (const row of rows) {
      const rowErrors: IValidationError[] = [];

      if (!row.employeeId) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'employeeId',
          message: 'Employee ID is required',
          severity: 'error'
        });
      } else if (!this.isValidObjectId(row.employeeId)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'employeeId',
          message: 'Invalid Employee ID format',
          severity: 'error'
        });
      } else if (!validEmployeeIds.has(row.employeeId)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'employeeId',
          message: 'Employee not found',
          severity: 'error'
        });
      }

      if (!row.salaryStructureId) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'salaryStructureId',
          message: 'Salary Structure ID is required',
          severity: 'error'
        });
      } else if (!this.isValidObjectId(row.salaryStructureId)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'salaryStructureId',
          message: 'Invalid Salary Structure ID format',
          severity: 'error'
        });
      } else if (!validSalaryStructureIds.has(row.salaryStructureId)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'salaryStructureId',
          message: 'Salary Structure not found',
          severity: 'error'
        });
      }

      // Date validation
      const effectiveFrom = row.effectiveFrom ? this.parseDate(row.effectiveFrom) : null;
      const effectiveTo = row.effectiveTo ? this.parseDate(row.effectiveTo) : null;

      if (!effectiveFrom) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'effectiveFrom',
          message: 'Invalid effective from date format (expected YYYY-MM-DD)',
          severity: 'error'
        });
      }

      if (!effectiveTo) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'effectiveTo',
          message: 'Invalid effective to date format (expected YYYY-MM-DD)',
          severity: 'error'
        });
      }

      if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'effectiveTo',
          message: 'Effective to date must be after effective from date',
          severity: 'error'
        });
      }

      // Validate all numeric fields are non-negative
      const numericFields = [
        { field: 'monthlyGross', name: 'Monthly Gross' },
        { field: 'annualInsurance', name: 'Annual Insurance' },
        { field: 'reimbursement', name: 'Reimbursement' },
        { field: 'travelAllowance', name: 'Travel Allowance' },
        { field: 'airTicketAllowance', name: 'Air Ticket Allowance' },
        { field: 'medicalAllowance', name: 'Medical Allowance' }
      ];

      for (const { field, name } of numericFields) {
        if (row[field] !== undefined && row[field] !== '') {
          const value = this.parseNumeric(row[field]);
          if (value < 0) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field,
              message: `${name} cannot be negative`,
              severity: 'error'
            });
          }
        }
      }

      const hasErrors = rowErrors.some(e => e.severity === 'error');
      if (hasErrors) {
        invalidRows.push(row);
      } else {
        validRows.push(row);
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
        warnings: errors.filter(e => e.severity === 'warning').length
      }
    };
  }

  /**
   * Validate Salary Structure rows
   */
  private async validateSalaryStructures(rows: IImportRow[]): Promise<IValidationResult> {
    const validRows: IImportRow[] = [];
    const invalidRows: IImportRow[] = [];
    const errors: IValidationError[] = [];

    for (const row of rows) {
      const rowErrors: IValidationError[] = [];

      if (!row.name?.trim()) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'name',
          message: 'Name is required',
          severity: 'error'
        });
      }

      // Country is already validated in validateUsers, but double-check here for safety
      if (!row.country || !CONSTANTS.VALID_COUNTRIES.includes(row.country.trim())) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'country',
          message: `Country is required and must be one of: ${CONSTANTS.VALID_COUNTRIES.join(', ')}`,
          severity: 'error'
        });
      }

      // Percentage validation
      const percentageFields = ['basicPercentage', 'hraPercentage', 'daPercentage', 'otherAllowancePercentage'];
      for (const field of percentageFields) {
        const value = parseFloat(row[field]);
        if (isNaN(value) || value < 0 || value > 100) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field,
            message: `${field} must be a number between 0 and 100`,
            severity: 'error'
          });
        }
      }

      const hasErrors = rowErrors.some(e => e.severity === 'error');
      if (hasErrors) {
        invalidRows.push(row);
      } else {
        validRows.push(row);
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
        warnings: errors.filter(e => e.severity === 'warning').length
      }
    };
  }

  /**
   * Validate Attendance Record rows
   */
  private async validateAttendanceRecords(rows: IImportRow[]): Promise<IValidationResult> {
    const validRows: IImportRow[] = [];
    const invalidRows: IImportRow[] = [];
    const errors: IValidationError[] = [];

    // Batch validate user IDs and shift IDs
    const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean).filter(id => this.isValidObjectId(id)))];
    const shiftIds = [...new Set(rows.map(r => r.shiftId).filter(Boolean).filter(id => this.isValidObjectId(id)))];

    const [existingUsers, existingShifts] = await Promise.all([
      userIds.length > 0
        ? User.find({ _id: { $in: userIds.map(id => new Types.ObjectId(id)) } })
          .select('_id joiningDate separationDate')
          .lean()
        : Promise.resolve([]),
      shiftIds.length > 0
        ? Shift.find({ _id: { $in: shiftIds.map(id => new Types.ObjectId(id)) } })
          .select('_id code')
          .lean()
        : Promise.resolve([])
    ]);

    const validUserIds = new Set(existingUsers.map(u => u._id.toString()));
    const userJoiningDates = new Map(existingUsers.map(u => [u._id.toString(), u.joiningDate ? new Date(u.joiningDate) : null]));
    const userSeparationDates = new Map(existingUsers.map(u => [u._id.toString(), u.separationDate ? new Date(u.separationDate) : null]));
    const validShiftIds = new Set(existingShifts.map(s => s._id.toString()));

    // Track user+date combinations to prevent duplicates within the import file
    const seenRecords = new Set<string>();
    const shiftCodes = new Set(existingShifts.map(s => s.code?.toUpperCase()).filter(Boolean));

    for (const row of rows) {
      const rowErrors: IValidationError[] = [];

      if (!row.userId) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'userId',
          message: 'User ID is required',
          severity: 'error'
        });
      } else if (!this.isValidObjectId(row.userId)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'userId',
          message: 'Invalid User ID format',
          severity: 'error'
        });
      } else if (!validUserIds.has(row.userId)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'userId',
          message: 'User not found',
          severity: 'error'
        });
      }

      if (row.shiftId && !this.isValidObjectId(row.shiftId)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftId',
          message: 'Invalid Shift ID format',
          severity: 'error'
        });
      } else if (row.shiftId && !validShiftIds.has(row.shiftId)) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftId',
          message: 'Shift not found',
          severity: 'error'
        });
      }

      if (!row.shiftCode) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftCode',
          message: 'Shift Code is required',
          severity: 'error'
        });
      } else if (row.shiftId && shiftCodes.size > 0 && !shiftCodes.has(row.shiftCode.toUpperCase())) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftCode',
          message: 'Shift Code does not match Shift ID',
          severity: 'warning'
        });
      }

      // Date validation
      const shiftDay = row.shiftDay ? this.parseDate(row.shiftDay) : null;
      if (!shiftDay) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'shiftDay',
          message: 'Invalid shift day format (expected YYYY-MM-DD)',
          severity: 'error'
        });
      }

      // Joining Date Validation
      if (shiftDay && row.userId && userJoiningDates.get(row.userId)) {
        const joiningDate = userJoiningDates.get(row.userId)!;
        // Normalize time portion for comparison
        joiningDate.setHours(0, 0, 0, 0);
        const recordDay = new Date(shiftDay);
        recordDay.setHours(0, 0, 0, 0);

        if (recordDay < joiningDate) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'shiftDay',
            message: `Attendance date (${recordDay.toLocaleDateString()}) is before user joining date (${joiningDate.toLocaleDateString()})`,
            severity: 'error'
          });
        }
      }

      // Validate shiftStart and shiftEnd (Optional - Auto-fill based on day if missing)
      if (row.shiftStart) {
        const shiftStart = new Date(row.shiftStart);
        if (isNaN(shiftStart.getTime())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'shiftStart',
            message: 'Invalid shift start time format',
            severity: 'error'
          });
        }
      }

      if (row.shiftEnd) {
        const shiftEnd = new Date(row.shiftEnd);
        if (isNaN(shiftEnd.getTime())) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'shiftEnd',
            message: 'Invalid shift end time format',
            severity: 'error'
          });
        } else if (row.shiftStart) {
          const shiftStart = new Date(row.shiftStart);
          if (!isNaN(shiftStart.getTime()) && shiftEnd <= shiftStart) {
            rowErrors.push({
              rowNumber: row.rowNumber,
              field: 'shiftEnd',
              message: 'Shift end time must be after shift start time',
              severity: 'error'
            });
          }
        }
      }

      // Check for duplicates within the import file
      if (row.userId && shiftDay) {
        const recordKey = `${row.userId}_${shiftDay.toISOString().split('T')[0]}`;
        if (seenRecords.has(recordKey)) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'shiftDay',
            message: `Duplicate record: User ${row.userId} already has an attendance entry for ${shiftDay.toLocaleDateString()} in this import file`,
            severity: 'error'
          });
        } else {
          seenRecords.add(recordKey);
        }
      }

      // Post-Separation Date Validation
      if (shiftDay && row.userId && userSeparationDates.get(row.userId)) {
        const separationDate = userSeparationDates.get(row.userId)!;
        // Normalize time portion for comparison
        const sepDate = new Date(separationDate);
        sepDate.setHours(23, 59, 59, 999); // End of separation day
        const recordDay = new Date(shiftDay);
        recordDay.setHours(0, 0, 0, 0);

        if (recordDay > sepDate) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'shiftDay',
            message: `Attendance date (${recordDay.toLocaleDateString()}) is after user separation date (${separationDate.toLocaleDateString()})`,
            severity: 'error'
          });
        }
      }

      // Validate Attendance Type (Mandatory)
      if (!row.attendanceType) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'attendanceType',
          message: 'Attendance Type is required (Present / Half Day / Absent)',
          severity: 'error'
        });
      } else {
        const type = row.attendanceType.toString().trim().toLowerCase();
        const validTypes = ['present', 'full day', 'half day', 'half-day', 'absent'];
        if (!validTypes.includes(type)) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'attendanceType',
            message: `Invalid Attendance Type. Must be one of: Present, Full Day, Half Day, Absent`,
            severity: 'error'
          });
        }

        // Half Type Restrictions
        const halfTypeProvided = row.halfType && row.halfType.toString().trim() !== '';
        if ((type === 'present' || type === 'full day') && halfTypeProvided) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'halfType',
            message: "Half Type should not be provided when Attendance Type is 'Present' or 'Full Day'",
            severity: 'error'
          });
        } else if ((type === 'half day' || type === 'half-day') && !halfTypeProvided) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            field: 'halfType',
            message: "Half Type (First Half / Second Half) is required when Attendance Type is 'Half Day'",
            severity: 'error'
          });
        }
      }

      const hasErrors = rowErrors.some(e => e.severity === 'error');
      if (hasErrors) {
        invalidRows.push(row);
      } else {
        validRows.push(row);
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
        warnings: errors.filter(e => e.severity === 'warning').length
      }
    };
  }

  /**
   * Confirm and insert valid data
   */
  async confirmAndInsert(
    request: IImportRequest
  ): Promise<{ [objectType: string]: { created: number; errors: string[] } }> {
    const results: { [objectType: string]: { created: number; errors: string[] } } = {};

    console.log('🔄 [Data Migration Insert] Starting insert for objects:', request.objects);
    console.log('📋 [Data Migration Insert] Valid rows per object:',
      Object.keys(request.validRows).map(key => ({ [key]: request.validRows[key]?.length || 0 }))
    );

    for (const objectType of request.objects) {
      const rows = request.validRows[objectType] || [];
      console.log(`🔄 [Data Migration Insert] Processing ${objectType}: ${rows.length} rows`);

      try {
        switch (objectType) {
          case 'user':
            results[objectType] = await this.insertUsers(rows);
            break;
          case 'shift':
            results[objectType] = await this.insertShifts(rows);
            break;
          case 'leave':
            results[objectType] = await this.insertLeaves(rows);
            break;
          case 'salary-assignment':
            results[objectType] = await this.insertSalaryAssignments(rows);
            break;
          case 'salary-structure':
            results[objectType] = await this.insertSalaryStructures(rows);
            break;
          case 'attendance-record':
            results[objectType] = await this.insertAttendanceRecords(rows);
            break;
        }
        console.log(`✅ [Data Migration Insert] ${objectType} completed:`, results[objectType]);
      } catch (error: any) {
        console.error(`❌ [Data Migration Insert] Error processing ${objectType}:`, error);
        results[objectType] = {
          created: 0,
          errors: [`Failed to process ${objectType}: ${error.message}`]
        };
      }
    }

    console.log('✅ [Data Migration Insert] All inserts completed. Results:', results);
    return results;
  }

  /**
   * Insert User records
   */
  private async insertUsers(rows: IImportRow[]): Promise<{ created: number; errors: string[] }> {
    const errors: string[] = [];
    let created = 0;

    // Import UserService to use its create method
    const { UserService } = await import('./user.service');
    const userService = new UserService(this.context);

    for (const row of rows) {
      try {
        // Use default password for imported users (users should change it after first login)
        const defaultPassword = '123456';

        // During data migration, active can be set to false for historical data
        // This is different from manual API creation where active is always true
        const isActive = row.active !== undefined ? row.active : true; // Default to true if not specified

        // Handle email: required for active users, optional for inactive users (historical data)
        let userEmail = row.email?.toLowerCase().trim();
        if (!userEmail) {
          if (isActive) {
            // Email is required for active users
            throw new Error('Email is required for active users (Active=Yes)');
          } else {
            // For inactive users (historical data), generate placeholder email
            const timestamp = Date.now();
            const employeeCode = row.employeeNo?.trim() || 'user';
            userEmail = `inactive-${employeeCode}-${timestamp}@placeholder.local`;
          }
        }

        // Prepare user data
        const userData: any = {
          name: row.name?.trim(),
          email: userEmail,
          password: defaultPassword,
          role: row.role?.toLowerCase().trim(),
          specificRole: row.specificRole?.trim() || undefined,
          departmentId: row.departmentId?.trim(),
          costCenter: row.costCenter?.trim(),
          employmentStatus: row.employmentStatus?.trim(),
          employeeCode: row.employeeNo?.trim() || undefined,
          checkinId: row.checkinId?.trim() || undefined,
          active: isActive, // Can be false for historical data migration
          joiningDate: row.joiningDate ? this.parseDate(row.joiningDate)! : new Date(),
          confirmationDate: row.confirmationDate ? this.parseDate(row.confirmationDate) : undefined, // Optional
          probationDate: row.probationDate ? this.parseDate(row.probationDate) : undefined, // Optional
          location: row.location?.trim() || undefined,
          phone: row.phone?.trim() || undefined,
          emergencyContact: row.emergencyContact?.trim() || undefined,
          address: row.address?.trim() || undefined,
          bloodGroup: row.bloodGroup?.trim() || undefined,
          dateOfBirth: row.dateOfBirth ? this.parseDate(row.dateOfBirth)! : undefined, // Required - validated earlier
          fatherName: row.fatherName?.trim() || undefined,
          maritalStatus: row.maritalStatus?.trim() || undefined,
          spouseName: row.spouseName?.trim() || undefined,
          separationDate: row.separationDate ? this.parseDate(row.separationDate) : undefined,
          noticePeriod: row.noticePeriod ? Number(row.noticePeriod) : undefined,
          personalMailId: row.personalMailId?.toLowerCase().trim() || undefined,
          country: row.country?.trim(),
          currency: row.currency || (row.country?.trim() === 'AE' ? CONSTANTS.DEFAULT_CURRENCY_AED : CONSTANTS.DEFAULT_CURRENCY_INR),
          licenseType: row.licenseType || CONSTANTS.DEFAULT_LICENSE_TYPE,
          portalAccess: row.portalAccess !== undefined ? row.portalAccess : true,
          // When Portal Access=No, allow creating payroll-only user with same email (duplicate user allow)
          allowDuplicateEmail: row.portalAccess === false,
          client: row.client?.trim() || undefined,
          // Required fields for user creation - use empty strings as per UserService interface
          upcomingShiftAssignment: '',
          currentShiftAssignment: '',
          upcomingShiftAssignmentData: {},
          currentShiftAssignmentData: {}
        };

        // Get country once for use in multiple validations
        const country = row.country?.trim() || '';

        // Handle manager (required - validated earlier)
        if (!row.managerId || !this.isValidObjectId(row.managerId)) {
          throw new Error('Manager ID is required and must be valid');
        }
        const manager = await User.findById(row.managerId);
        if (!manager) {
          throw new Error('Manager not found');
        }
        userData.managerId = row.managerId;

        // Handle biometricId - UserService.create will handle IN/AE countries
        // Only set biometricId for non-IN/AE countries, UserService will remove it for IN/AE
        if (row.biometricId?.trim()) {
          if (country && country !== 'IN' && country !== 'AE') {
            userData.biometricId = row.biometricId.trim();
          }
          // For IN/AE, don't set biometricId at all - UserService will handle it
        }

        // Handle visa details (only for AE users, validated earlier)
        if (country === 'AE' && row.visaType && row.visaExpiryDate) {
          const visaExpiryDate = this.parseDate(row.visaExpiryDate);
          if (!visaExpiryDate) {
            throw new Error('Invalid visa expiry date format');
          }
          if (visaExpiryDate <= new Date()) {
            throw new Error('Visa expiry date must be in the future');
          }
          if (!CONSTANTS.VALID_VISA_TYPES.includes(row.visaType.trim())) {
            throw new Error(`Invalid visa type. Must be one of: ${CONSTANTS.VALID_VISA_TYPES.join(', ')}`);
          }

          userData.visaDetails = {
            visaType: row.visaType.trim(),
            visaExpiryDate: visaExpiryDate,
            isActive: row.visaIsActive !== undefined ? row.visaIsActive : true
          };
        }

        // Handle holiday calendar
        if (row.holidayCalendarId) {
          userData.holidayCalendarId = row.holidayCalendarId;
        }

        // Use UserService.create to ensure proper handling (biometricId, welcome email, etc.)
        const savedUser = await userService.create(userData);
        created++;

        // If shiftId is provided, create shift assignment automatically
        if (row.shiftId?.trim()) {
          try {
            const shiftId = row.shiftId.trim();
            const shift = await Shift.findById(shiftId).lean();

            if (!shift) {
              throw new Error(`Shift with ID ${shiftId} not found`);
            }

            const joiningDate = row.joiningDate ? this.parseDate(row.joiningDate) : new Date();
            if (!joiningDate) {
              throw new Error('Invalid joining date for shift assignment');
            }

            // Normalize joining date to start of day for comparison
            const normalizedJoiningDate = new Date(joiningDate);
            normalizedJoiningDate.setUTCHours(0, 0, 0, 0);
            const nextDay = new Date(normalizedJoiningDate);
            nextDay.setUTCDate(nextDay.getUTCDate() + 1);

            // Check if shift assignment already exists for this user, shift, and start date
            // Check for exact match on userId, shiftId, and startDate (within same day)
            const existingAssignment = await ShiftAssignment.findOne({
              userId: savedUser._id,
              shiftId: new Types.ObjectId(shiftId),
              startDate: {
                $gte: normalizedJoiningDate,
                $lt: nextDay
              }
            });

            if (existingAssignment) {
              console.log(`Shift assignment already exists for user ${savedUser._id.toString()} with shift ${shiftId} starting ${normalizedJoiningDate.toISOString()}, skipping creation`);
              // Skip creation but don't treat as error - assignment already exists
              // Continue to next iteration of the loop
            } else {

              // Calculate status based on start date
              const currentDate = new Date();
              const startDateTime = new Date(joiningDate);
              startDateTime.setHours(0, 0, 0, 0);

              let status: 'current' | 'upcoming' | 'past' = 'upcoming';
              if (startDateTime <= currentDate) {
                status = 'current';
              }

              // Create shift assignment with standard weekend [0, 6] (Sunday and Saturday)
              const shiftAssignment = new ShiftAssignment({
                userId: savedUser._id,
                shiftId: new Types.ObjectId(shiftId),
                shiftCode: shift.code,
                startDate: joiningDate,
                endDate: undefined, // No end date
                isActive: true,
                status: status,
                weekendDays: [0, 6], // Standard weekend: Sunday (0) and Saturday (6)
                assignedBy: this.context.user?._id || savedUser._id, // Use current admin user or the created user
                assignedAt: new Date()
              });

              await shiftAssignment.save();
            }
          } catch (shiftAssignmentError: any) {
            // Log error but don't fail user creation
            console.error(`Error creating shift assignment for user at row ${row.rowNumber}:`, shiftAssignmentError);
            errors.push(`Row ${row.rowNumber}: User created but shift assignment failed - ${shiftAssignmentError.message}`);
          }
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred';
        const errorDetails = error.stack ? `\nStack: ${error.stack.substring(0, 200)}` : '';
        errors.push(`Row ${row.rowNumber}: ${errorMessage}${errorDetails}`);
        console.error(`Error inserting user at row ${row.rowNumber}:`, error);
      }
    }

    return { created, errors };
  }

  /**
   * Insert Shift records
   */
  private async insertShifts(rows: IImportRow[]): Promise<{ created: number; errors: string[] }> {
    const errors: string[] = [];
    let created = 0;

    for (const row of rows) {
      try {
        const shiftData: any = {
          name: row.name?.trim(),
          code: row.code?.toUpperCase().trim(),
          startTime: row.startTime?.trim(),
          endTime: row.endTime?.trim(),
          shiftWindowStart: row.shiftWindowStart?.trim(),
          shiftWindowEnd: row.shiftWindowEnd?.trim(),
          applicableForRoles: [], // Required field - empty array by default, can be assigned later
          validFrom: row.validFrom ? this.parseDate(row.validFrom) : new Date(),
          validTill: row.validTill ? this.parseDate(row.validTill) : undefined,
          isActive: row.isActive !== undefined ? row.isActive : false,
          description: row.description?.trim(),
          graceTimeInMinutes: row.graceTimeInMinutes ? this.parseNumeric(row.graceTimeInMinutes, 15) : 15,
          isOvernightShift: row.isOvernightShift !== undefined ? row.isOvernightShift : false
        };

        const shift = new Shift(shiftData);
        await shift.save();
        created++;
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred';
        errors.push(`Row ${row.rowNumber}: ${errorMessage}`);
        console.error(`Error inserting shift at row ${row.rowNumber}:`, error);
      }
    }

    return { created, errors };
  }

  /**
   * Insert Leave records
   * After creating leaves, auto-creates "Present" attendance for balance days
   */
  private async insertLeaves(rows: IImportRow[]): Promise<{ created: number; errors: string[] }> {
    const errors: string[] = [];
    let created = 0;

    // Track users and date ranges for balance day creation
    const userDateRanges = new Map<string, { minDate: Date; maxDate: Date }>();

    for (const row of rows) {
      try {
        // Leave Type logic is handled in validation phase (validateLeaves)
        // row.leaveTypeId and row.leaveType should be correctly populated there.

        // SPECIAL CASE: FULL_MONTH_PRESENT - No actual leave, just create attendance
        // This is for employees with NO leaves in a month - creates "Present" for entire period
        if (row.leaveType === 'FULL_MONTH_PRESENT' || row.leaveType === 'NO_LEAVE' || row.leaveType === 'full_month_present') {
          console.log(`📅 [No Leave] Creating full period attendance for user ${row.userId}`);

          const startDate = this.parseDate(row.startDate!);
          const endDate = this.parseDate(row.endDate!);

          if (startDate && endDate) {
            const userId = row.userId.toString();

            // Auto-Expand to Full Month for attendance population
            const monthStart = new Date(startDate);
            monthStart.setUTCDate(1);
            monthStart.setUTCHours(0, 0, 0, 0);

            const monthEnd = new Date(endDate);
            monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
            monthEnd.setUTCDate(0); // Last day of month
            monthEnd.setUTCHours(23, 59, 59, 999);

            // Track date range for balance day creation
            if (!userDateRanges.has(userId)) {
              userDateRanges.set(userId, { minDate: monthStart, maxDate: monthEnd });
            } else {
              const range = userDateRanges.get(userId)!;
              if (monthStart < range.minDate) range.minDate = monthStart;
              if (monthEnd > range.maxDate) range.maxDate = monthEnd;
            }

            console.log(`✅ [No Leave] Queued full month attendance population for user ${userId} (${monthStart.toISOString().split('T')[0]} to ${monthEnd.toISOString().split('T')[0]})`);
          }

          // Don't create leave record, skip to next row
          continue;
        }

        // Safety check - rows should already be validated, but double-check ObjectId format
        if (!this.isValidObjectId(row.userId) || !this.isValidObjectId(row.leaveTypeId)) {
          throw new Error(`Invalid ObjectId format for UserID: ${row.userId} or LeaveTypeID: ${row.leaveTypeId}`);
        }

        // For half-day leaves, ensure noOfDays is 0.5
        let leaveDuration = row.leaveDuration || 'full-day';
        let noOfDays = row.noOfDays ? this.parseNumeric(row.noOfDays) : undefined;
        let halfDayType = row.halfDayType || undefined;

        // Auto-fix / Defaulting logic
        if (leaveDuration === 'half-day') {
          noOfDays = 0.5;
          if (!halfDayType) halfDayType = 'first-half'; // Default
        } else {
          // Full-Day
          leaveDuration = 'full-day';
          if (row.leaveType === 'restricted_holiday') {
            noOfDays = 1;
          }
          // If noOfDays is missing for full-day, calculate it
          if (!noOfDays && row.startDate && row.endDate) {
            const s = this.parseDate(row.startDate!);
            const e = this.parseDate(row.endDate!);
            if (s && e) {
              // Calculate days excluding weekends
              let count = 0;
              const loopDate = new Date(s);
              loopDate.setUTCHours(0, 0, 0, 0);
              const endDateUtc = new Date(e);
              endDateUtc.setUTCHours(0, 0, 0, 0);

              // Find Shift Assignment covering start date
              const assignment = await ShiftAssignment.findOne({
                userId: new Types.ObjectId(row.userId),
                startDate: { $lte: loopDate },
                $or: [{ endDate: { $gte: loopDate } }, { endDate: null }]
              });

              const weekendDays = assignment?.weekendDays || [];

              while (loopDate <= endDateUtc) {
                const dayOfWeek = loopDate.getUTCDay();
                if (!weekendDays.includes(dayOfWeek)) {
                  count++;
                }
                loopDate.setUTCDate(loopDate.getUTCDate() + 1);
              }
              noOfDays = count;
            }
          }
        }

        const leaveData: any = {
          userId: new Types.ObjectId(row.userId),
          leaveTypeId: new Types.ObjectId(row.leaveTypeId),
          leaveType: row.leaveType?.trim(),
          startDate: this.parseDate(row.startDate!),
          endDate: this.parseDate(row.endDate!),
          noOfDays: noOfDays,
          status: row.status || 'Approved',
          remarks: row.remarks?.trim(),
          reason: row.reason?.trim(),
          leaveDuration: leaveDuration,
          halfDayType: halfDayType
        };

        if (row.appliedToId) {
          leaveData.appliedTo = {
            _id: row.appliedToId,
            name: row.appliedToName || ''
          };
        }

        if (row.approvedById) {
          if (!this.isValidObjectId(row.approvedById)) {
            throw new Error('Invalid approvedById format');
          }
          leaveData.approvedById = new Types.ObjectId(row.approvedById);
          if (row.approvedAt) {
            leaveData.approvedAt = this.parseDate(row.approvedAt);
          }
        }

        const leave = new Leave(leaveData);
        await leave.save();
        console.log('✅ [Data Migration] Leave created successfully:', {
          id: leave._id,
          userId: leave.userId,
          status: leave.status,
          startDate: leave.startDate,
          endDate: leave.endDate
        });
        created++;

        // Track user date ranges for balance day creation
        const userId = row.userId.toString();
        const startDate = this.parseDate(row.startDate!);
        const endDate = this.parseDate(row.endDate!);

        if (startDate && endDate) {
          // Auto-Expand to Full Month for attendance population
          const monthStart = new Date(startDate);
          monthStart.setUTCDate(1);
          monthStart.setUTCHours(0, 0, 0, 0);

          const monthEnd = new Date(endDate);
          monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
          monthEnd.setUTCDate(0);
          monthEnd.setUTCHours(23, 59, 59, 999);

          if (!userDateRanges.has(userId)) {
            userDateRanges.set(userId, { minDate: monthStart, maxDate: monthEnd });
          } else {
            const range = userDateRanges.get(userId)!;
            if (monthStart < range.minDate) range.minDate = monthStart;
            if (monthEnd > range.maxDate) range.maxDate = monthEnd;
          }
        }

        // If leave is approved, update attendance records to reflect "On-Leave"
        if (leave.status === 'Approved') {
          await this.processLeaveAttendance(leave);
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred';
        errors.push(`Row ${row.rowNumber}: ${errorMessage}`);
        console.error(`Error inserting leave at row ${row.rowNumber}:`, error);
      }
    }

    // After all leaves are processed, create "Present" attendance for balance days
    console.log('🔄 [Data Migration] Creating balance day attendance for users:', userDateRanges.size);
    for (const [userId, dateRange] of userDateRanges) {
      try {
        await this.createBalanceDayAttendance(userId, dateRange.minDate, dateRange.maxDate);
      } catch (error: any) {
        console.error(`⚠️ [Data Migration] Error creating balance days for user ${userId}:`, error.message);
        errors.push(`Balance days for user ${userId}: ${error.message}`);
      }
    }

    return { created, errors };
  }

  /**
   * Create "Present" attendance for balance days (non-leave working days)
   * Excludes: weekends, holidays, and days with existing attendance
   */
  private async createBalanceDayAttendance(userId: string, startDate: Date, endDate: Date): Promise<void> {
    // 1. Fetch user to get country, joining date, separation date, and holiday calendar
    const user = await User.findById(userId).select('country joiningDate separationDate holidayCalendarId holidayCalendarHistory');
    if (!user) return;

    const joiningDate = user.joiningDate ? new Date(user.joiningDate) : null;
    if (joiningDate) joiningDate.setUTCHours(0, 0, 0, 0);

    const separationDate = user.separationDate ? new Date(user.separationDate) : null;
    if (separationDate) separationDate.setUTCHours(23, 59, 59, 999);

    const country = user.country || 'IN';
    const countryOffsets: Record<string, number> = { 'IN': 5.5, 'AE': 4 };
    const offset = countryOffsets[country] || 5.5;

    // 2. Batch fetch Holidays (Year-Aware)
    const years = [];
    for (let y = startDate.getUTCFullYear(); y <= endDate.getUTCFullYear(); y++) years.push(y);

    let allHolidays: Set<string> = new Set();
    const history = user.holidayCalendarHistory || [];

    for (const year of years) {
      // Find calendar ID for this specific year
      const yearEntry = history.find((h: any) => h.year === year);
      const calendarId = yearEntry ? yearEntry.calendarId : user.holidayCalendarId;

      if (calendarId) {
        const calendar = await HolidayCalendar.findById(calendarId).select('holidays').lean();
        if (calendar?.holidays) {
          calendar.holidays.forEach((h: any) => {
            const hDate = new Date(h.date);
            // Apply offset to get logical day (handle local midnight storage)
            const logicalDate = new Date(hDate.getTime() + (offset * 60 * 60 * 1000));
            allHolidays.add(logicalDate.toISOString().split('T')[0]);
          });
        }
      }
    }

    // 3. PERFORMANCE: Batch fetch all assignments and existing attendance for the range
    const allAssignments = await ShiftAssignment.find({
      userId: new Types.ObjectId(userId),
      startDate: { $lte: endDate },
      $or: [{ endDate: { $gte: startDate } }, { endDate: null }]
    }).lean();

    const existingAttendanceDates = new Set(
      (await AttendanceRecord.find({
        userId: new Types.ObjectId(userId),
        shiftDay: { $gte: startDate, $lte: endDate }
      }).select('shiftDay').lean()).map(a => a.shiftDay.toISOString().split('T')[0])
    );

    let balanceDaysCreated = 0;
    const loopDate = new Date(startDate);
    loopDate.setUTCHours(0, 0, 0, 0);

    while (loopDate <= endDate) {
      const currentDate = new Date(loopDate);
      const dateStr = currentDate.toISOString().split('T')[0];

      // A. Protective Checks (Dates)
      if (joiningDate && currentDate < joiningDate) {
        loopDate.setUTCDate(loopDate.getUTCDate() + 1);
        continue;
      }
      if (separationDate && currentDate > separationDate) {
        break; // Exit loop early if they have left the company
      }

      // B. Skip if attendance already exists
      if (existingAttendanceDates.has(dateStr)) {
        loopDate.setUTCDate(loopDate.getUTCDate() + 1);
        continue;
      }

      // C. Find correct assignment locally (NO DB CALL)
      const assignment = allAssignments.find(a => {
        const aStart = new Date(a.startDate);
        const aEnd = a.endDate ? new Date(a.endDate) : null;
        return currentDate >= aStart && (!aEnd || currentDate <= aEnd);
      });

      if (!assignment) {
        loopDate.setUTCDate(loopDate.getUTCDate() + 1);
        continue;
      }

      // D. Weekend & Holiday Checks
      const dayOfWeek = currentDate.getUTCDay();
      const weekendDays = assignment.weekendDays || [];
      if (weekendDays.includes(dayOfWeek) || allHolidays.has(dateStr)) {
        loopDate.setUTCDate(loopDate.getUTCDate() + 1);
        continue;
      }

      // E. Get Shift Info (Cached if possible, but shifts are few)
      const shift = await Shift.findById(assignment.shiftId).lean();
      if (!shift) {
        loopDate.setUTCDate(loopDate.getUTCDate() + 1);
        continue;
      }

      // F. Create Record (Same creation logic as before, but safer)
      try {
        const parseTimeWithOffset = (timeStr: string, baseDate: Date, countryOffset: number) => {
          const [h, m] = timeStr.split(':').map(Number);
          const d = new Date(baseDate);
          const totalMinutes = (h * 60) + m - (countryOffset * 60);
          d.setUTCHours(0, totalMinutes, 0, 0);
          return d;
        };

        const shiftStart = parseTimeWithOffset(shift.startTime, currentDate, offset);
        const shiftEnd = parseTimeWithOffset(shift.endTime, currentDate, offset);
        if (shift.isOvernightShift) shiftEnd.setUTCDate(shiftEnd.getUTCDate() + 1);

        const shiftDurationMs = shiftEnd.getTime() - shiftStart.getTime();
        const durationHours = Math.floor(shiftDurationMs / (1000 * 60 * 60));
        const durationMinutes = Math.floor((shiftDurationMs % (1000 * 60 * 60)) / (1000 * 60));
        const shiftHoursStr = `${durationHours}:${durationMinutes.toString().padStart(2, '0')}:00`;

        await AttendanceRecord.collection.insertOne({
          userId: new Types.ObjectId(userId),
          shiftId: shift._id,
          shiftCode: shift.code,
          shiftDay: currentDate,
          shiftStart,
          shiftEnd,
          status: 'complete',
          attendanceStatus: ['Present'],
          swipes: [],
          shiftHours: shiftHoursStr,
          totalWorkHours: shiftHoursStr,
          breakHours: '0:00:00',
          actualWorkHours: shiftHoursStr,
          shortfallHours: '0:00:00',
          excessHours: '0:00:00',
          isLateEntry: false,
          isEarlyExit: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        balanceDaysCreated++;
      } catch (e: any) {
        console.error(`Error on ${dateStr}:`, e.message);
      }

      loopDate.setUTCDate(loopDate.getUTCDate() + 1);
    }
    console.log(`✅ [Migration Complete] Generated ${balanceDaysCreated} attendance records for user ${userId}`);
  }

  /**
   * Process attendance records for approved leaves
   * Ensures attendance reflects "On-Leave" status for the leave duration
   */
  private async processLeaveAttendance(leave: any): Promise<void> {
    try {
      const startDate = new Date(leave.startDate);
      const endDate = new Date(leave.endDate);

      // Normalize to UTC 00:00:00 to iterate by day
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(0, 0, 0, 0);

      const loopDate = new Date(startDate);
      while (loopDate <= endDate) {
        // Handle specific date processing
        const currentDate = new Date(loopDate);

        // Find active shift assignment for this specific date
        const nextDay = new Date(currentDate);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);

        const assignment = await ShiftAssignment.findOne({
          userId: leave.userId,
          startDate: { $lte: currentDate },
          $or: [
            { endDate: { $gte: currentDate } },
            { endDate: null }
          ]
        });

        console.log(`[LeaveDebug] Processing date: ${currentDate.toISOString()}`);
        console.log(`[LeaveDebug] Found assignment: ${assignment ? 'Yes' : 'No'}`);
        if (assignment) {
          console.log(`[LeaveDebug] Assignment details: ${assignment._id}, Weekend Days: ${assignment.weekendDays}`);
        }

        // WEEKEND CHECK: If it's a weekend, SKIP attendance update
        if (assignment && assignment.weekendDays && assignment.weekendDays.length > 0) {
          const dayOfWeek = currentDate.getUTCDay(); // 0 = Sunday, 1 = Monday...
          if (assignment.weekendDays.includes(dayOfWeek)) {
            console.log(`ℹ️ [Leave Migration] Skipping Weekend for ${leave.userId} on ${currentDate.toISOString()}`);
            loopDate.setUTCDate(loopDate.getUTCDate() + 1);
            continue;
          }
        }

        // HOLIDAY CHECK: If it's a holiday, SKIP attendance update (unless RH)
        // Need to fetch user's holiday calendar
        // Optimization: Fetch User & Holiday only if not cached or do it simply here

        // Fetch User to get Calendar History (Year-Aware)
        const leaveUser = await User.findById(leave.userId).select('holidayCalendarId holidayCalendarHistory country');
        if (leaveUser) {
          const country = leaveUser.country || 'IN';
          const countryOffsets: Record<string, number> = { 'IN': 5.5, 'AE': 4 };
          const offset = countryOffsets[country] || 5.5;

          const dateStr = currentDate.toISOString().split('T')[0];
          const leaveYear = currentDate.getUTCFullYear();

          // Find specific calendar for this year
          const historyEntry = (leaveUser.holidayCalendarHistory || []).find((h: any) => h.year === leaveYear);
          const activeCalendarId = historyEntry ? historyEntry.calendarId : leaveUser.holidayCalendarId;

          if (activeCalendarId) {
            const calendar = await HolidayCalendar.findById(activeCalendarId).select('holidays').lean();

            if (calendar && calendar.holidays) {
              const holiday = calendar.holidays.find(h => {
                const hDate = new Date(h.date);
                const logicalDate = new Date(hDate.getTime() + (offset * 60 * 60 * 1000));
                return logicalDate.toISOString().split('T')[0] === dateStr;
              });

              if (holiday) {
                const isRestrictedLeave = (leave.leaveType === 'restricted_holiday' || leave.leaveType === 'compensatory_off');
                if (!isRestrictedLeave) {
                  console.log(`ℹ️ [Leave Migration] Skipping Holiday for ${leave.userId} on ${currentDate.toISOString()}`);
                  loopDate.setUTCDate(loopDate.getUTCDate() + 1);
                  continue;
                }
              }
            }
          }
        }

        // Find existing attendance record
        let attendanceRecord = await AttendanceRecord.findOne({
          userId: leave.userId,
          shiftDay: currentDate
        });

        // Determine status based on leave duration
        const isHalfDay = leave.leaveDuration === 'half-day';
        // 'Half-Day' is not a valid enum value in AttendanceRecord model. Use 'On-Leave'.
        const statusTag = 'On-Leave';

        if (attendanceRecord) {
          // Update existing record
          if (!isHalfDay) {
            // Full Day: Overwrite completely
            attendanceRecord.status = 'leave_swipe';
            attendanceRecord.attendanceStatus = [statusTag];
            attendanceRecord.shortfallHours = '0:00:00';
            attendanceRecord.isLateEntry = false;
            attendanceRecord.isEarlyExit = false;
          } else {
            // Half Day: Merge status, don't wipe work data
            attendanceRecord.status = 'leave_swipe'; // Mark as leave day
            // Add 'On-Leave' to attendanceStatus if not already present
            if (!attendanceRecord.attendanceStatus.includes(statusTag)) {
              attendanceRecord.attendanceStatus.push(statusTag);
            }

            // SPECIAL MIGRATION LOGIC:
            // If the record was previously "Absent" or empty, and this is a Half-Day leave,
            // we should assume the other half is "Present" (similar to new creation logic).
            if (attendanceRecord.attendanceStatus.includes('Absent')) {
              attendanceRecord.attendanceStatus = attendanceRecord.attendanceStatus.filter(s => s !== 'Absent');
              attendanceRecord.attendanceStatus.push('Present');

              // We should probably update hours here too, but updating existing records is risky.
              // Let's assume if it exists, it has data. 
            }
          }
          await attendanceRecord.save();
          console.log(`✅ Updated attendance for user ${leave.userId} on ${currentDate.toISOString()} to ${statusTag}`);
        } else {
          // No record exists, create one only if there is a valid shift
          // Use the assignment we found earlier for weekend check, or find a general one
          let shiftAssignment = assignment;

          if (!shiftAssignment) {
            // Fallback search if the specific date query didn't return (though it should have for weekend check logic)
            shiftAssignment = await ShiftAssignment.findOne({
              userId: leave.userId,
              isActive: true,
              startDate: { $lte: currentDate },
              $or: [
                { endDate: { $gte: currentDate } },
                { endDate: null }
              ]
            });
          }

          if (shiftAssignment) {
            const shift = await Shift.findById(shiftAssignment.shiftId);
            if (shift) {
              // ... (Start/End time parsing)
              const parseTime = (timeStr: string, baseDate: Date) => {
                const [h, m] = timeStr.split(':').map(Number);
                const d = new Date(baseDate);
                d.setUTCHours(h, m, 0, 0);
                return d;
              };

              const sStart = parseTime(shift.startTime, currentDate);
              const sEnd = parseTime(shift.endTime, currentDate);

              if (shift.isOvernightShift) {
                sEnd.setUTCDate(sEnd.getUTCDate() + 1);
              }

              const shiftDurationMs = sEnd.getTime() - sStart.getTime();
              let workHoursStr = '0:00:00';
              let shortfallStr = '0:00:00';
              const statuses = [statusTag];

              if (isHalfDay) {
                // For Half-Day, we assume the other half is Present
                statuses.push('Present');

                // Calculate half duration for work hours
                const halfDurationMs = shiftDurationMs / 2;
                const h = Math.floor(halfDurationMs / (1000 * 60 * 60));
                const m = Math.floor((halfDurationMs % (1000 * 60 * 60)) / (1000 * 60));
                workHoursStr = `${h}:${m.toString().padStart(2, '0')}:00`;

                // Techincally shortfall is the other half if we consider 'Present' implies work
                // But for migration, we usually just set work hours. 
                // Let's set shortfall as well since there are no swipes.
                shortfallStr = workHoursStr;
              }

              // Calculate full shift hours string for reference
              const fh = Math.floor(shiftDurationMs / (1000 * 60 * 60));
              const fm = Math.floor((shiftDurationMs % (1000 * 60 * 60)) / (1000 * 60));
              const shiftHoursStr = `${fh}:${fm.toString().padStart(2, '0')}:00`;

              // Resolve Half Type for Attendance Record
              // Maps 'first-half' (from Leave) -> 'First Half' (for Attendance Model)
              const recordHalfType = (isHalfDay && leave.halfDayType)
                ? (leave.halfDayType === 'first-half' ? 'First Half' : 'Second Half')
                : undefined;

              const newRecord = await AttendanceRecord.create({
                userId: leave.userId,
                shiftId: shift._id,
                shiftCode: shift.code,
                shiftDay: currentDate,
                shiftStart: sStart,
                shiftEnd: sEnd,
                status: 'leave_swipe', // Still marked as leave_swipe type
                attendanceStatus: statuses,
                swipes: [],
                shiftHours: shiftHoursStr,
                totalWorkHours: workHoursStr,
                breakHours: '0:00:00',
                actualWorkHours: workHoursStr,
                shortfallHours: shortfallStr,
                excessHours: '0:00:00',
                isLateEntry: false,
                isEarlyExit: false,
                halfType: recordHalfType
              });
              console.log(`✅ Created NEW attendance for user ${leave.userId} on ${currentDate.toISOString()}:`, JSON.stringify(newRecord.toJSON(), null, 2));
            } else {
              console.warn(`⚠️ [Data Migration] Skipped Attendance: Shift ID ${shiftAssignment.shiftId} not found in DB`);
            }
          } else {
            console.warn(`⚠️ [Data Migration] Skipped Attendance Creation: No Shift Assignment found for user ${leave.userId} on ${currentDate.toISOString()}`);
          }
        }
        // Move to next day
        loopDate.setUTCDate(loopDate.getUTCDate() + 1);
      }
    } catch (err) {
      console.error(`❌ Error processing leave attendance for leave ${leave._id}:`, err);
      // Don't fail the whole migration for this
    }
  }

  /**
   * Insert Salary Assignment records
   */
  private async insertSalaryAssignments(rows: IImportRow[]): Promise<{ created: number; errors: string[] }> {
    const errors: string[] = [];
    let created = 0;

    for (const row of rows) {
      try {
        // Safety check - rows should already be validated
        if (!this.isValidObjectId(row.employeeId) || !this.isValidObjectId(row.salaryStructureId)) {
          throw new Error('Invalid ObjectId format');
        }

        // If setting as active, deactivate other assignments
        if (row.isActive) {
          await SalaryAssignment.updateMany(
            { employeeId: new Types.ObjectId(row.employeeId), isActive: true },
            { isActive: false }
          );
        }

        const assignmentData: any = {
          employeeId: new Types.ObjectId(row.employeeId),
          salaryStructureId: new Types.ObjectId(row.salaryStructureId),
          monthlyGross: this.parseNumeric(row.monthlyGross),
          annualInsurance: this.parseNumeric(row.annualInsurance),
          reimbursement: this.parseNumeric(row.reimbursement),
          travelAllowance: this.parseNumeric(row.travelAllowance),
          airTicketAllowance: this.parseNumeric(row.airTicketAllowance),
          medicalAllowance: this.parseNumeric(row.medicalAllowance),
          isActive: row.isActive !== undefined ? row.isActive : false,
          effectiveFrom: this.parseDate(row.effectiveFrom!),
          effectiveTo: this.parseDate(row.effectiveTo!)
        };

        const assignment = new SalaryAssignment(assignmentData);
        await assignment.save();
        created++;
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred';
        errors.push(`Row ${row.rowNumber}: ${errorMessage}`);
        console.error(`Error inserting salary assignment at row ${row.rowNumber}:`, error);
      }
    }

    return { created, errors };
  }

  /**
   * Insert Salary Structure records
   */
  private async insertSalaryStructures(rows: IImportRow[]): Promise<{ created: number; errors: string[] }> {
    const errors: string[] = [];
    let created = 0;

    for (const row of rows) {
      try {
        const structureData: any = {
          name: row.name?.trim(),
          country: row.country || CONSTANTS.DEFAULT_COUNTRY,
          fixedEarnings: {
            basicPercentage: this.parseNumeric(row.basicPercentage),
            hraPercentage: this.parseNumeric(row.hraPercentage),
            daPercentage: this.parseNumeric(row.daPercentage),
            otherAllowancePercentage: this.parseNumeric(row.otherAllowancePercentage),
            travelAllowancePercentage: this.parseNumeric(row.travelAllowancePercentage),
            reimbursementPercentage: this.parseNumeric(row.reimbursementPercentage)
          },
          statutoryDeductions: {
            epf: {
              employeeContribution: this.parseNumeric(row.epfEmployeeContribution),
              employerContribution: this.parseNumeric(row.epfEmployerContribution),
              maxLimit: this.parseNumeric(row.epfMaxLimit)
            },
            esi: {
              employeeContribution: this.parseNumeric(row.esiEmployeeContribution),
              employerContribution: this.parseNumeric(row.esiEmployerContribution),
              applicabilityLimit: this.parseNumeric(row.esiApplicabilityLimit)
            },
            professionalTax: {
              state: '',
              term: '',
              slabs: []
            }
          }
        };

        const structure = new SalaryStructure(structureData);
        await structure.save();
        created++;
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred';
        errors.push(`Row ${row.rowNumber}: ${errorMessage}`);
        console.error(`Error inserting salary structure at row ${row.rowNumber}:`, error);
      }
    }

    return { created, errors };
  }

  /**
   * Insert Attendance Record records
   */
  private async insertAttendanceRecords(rows: IImportRow[]): Promise<{ created: number; errors: string[] }> {
    const errors: string[] = [];
    let created = 0;

    for (const row of rows) {
      try {
        // Safety check - rows should already be validated
        if (!this.isValidObjectId(row.userId) || !this.isValidObjectId(row.shiftId)) {
          throw new Error('Invalid ObjectId format');
        }

        // Parse and validate dates
        let shiftStart = row.shiftStart ? new Date(row.shiftStart) : null;
        let shiftEnd = row.shiftEnd ? new Date(row.shiftEnd) : null;
        const shiftDay = this.parseDate(row.shiftDay!);
        if (!shiftDay) {
          throw new Error(`Invalid shift day format at row ${row.rowNumber}`);
        }

        // If shift times not provided, fetch from Shift Master
        if ((!shiftStart || isNaN(shiftStart.getTime())) || (!shiftEnd || isNaN(shiftEnd.getTime()))) {
          // Fetch the actual shift details and user country
          const [shift, user] = await Promise.all([
            Shift.findById(row.shiftId).select('startTime endTime isOvernightShift').lean(),
            User.findById(row.userId).select('country').lean()
          ]);

          if (shift && shift.startTime && shift.endTime) {
            const country = user?.country || 'IN';
            const countryOffsets: Record<string, number> = { 'IN': 5.5, 'AE': 4 };
            const offset = countryOffsets[country] || 5.5;

            const parseTimeWithOffset = (timeStr: string, baseDate: Date, countryOffset: number) => {
              const [h, m] = timeStr.split(':').map(Number);
              const d = new Date(baseDate);
              const totalMinutes = (h * 60) + m - (countryOffset * 60);
              d.setUTCHours(0, totalMinutes, 0, 0);
              return d;
            };

            if (!shiftStart || isNaN(shiftStart.getTime())) {
              shiftStart = parseTimeWithOffset(shift.startTime, shiftDay, offset);
            }

            if (!shiftEnd || isNaN(shiftEnd.getTime())) {
              shiftEnd = parseTimeWithOffset(shift.endTime, shiftDay, offset);
              if (shift.isOvernightShift) {
                shiftEnd.setUTCDate(shiftEnd.getUTCDate() + 1);
              }
            }
          } else {
            throw new Error(`Shift timings not found for Shift ID: ${row.shiftId}`);
          }
        }

        // Final validation
        if (!shiftStart || isNaN(shiftStart.getTime())) {
          throw new Error('Invalid shift start time');
        }
        if (!shiftEnd || isNaN(shiftEnd.getTime())) {
          throw new Error('Invalid shift end time');
        }

        const firstIn = row.firstIn ? new Date(row.firstIn) : null;
        const lastOut = row.lastOut ? new Date(row.lastOut) : null;

        // Check if firstIn and lastOut are provided for automatic calculation
        const hasCheckInOut = firstIn && !isNaN(firstIn.getTime()) && lastOut && !isNaN(lastOut.getTime());

        // Validate check-in/out times if both are provided
        if (hasCheckInOut && lastOut.getTime() <= firstIn.getTime()) {
          throw new Error('Last Out time must be after First In time');
        }

        // Check if admin has provided values (non-default values)
        // Consider empty strings, null, undefined, '0:00:00', and whitespace as "not provided"
        const adminProvidedTotalWorkHours = row.totalWorkHours &&
          row.totalWorkHours !== '0:00:00' &&
          row.totalWorkHours.trim() !== '' &&
          row.totalWorkHours !== '00:00:00';
        const adminProvidedBreakHours = row.breakHours &&
          row.breakHours !== '0:00:00' &&
          row.breakHours.trim() !== '' &&
          row.breakHours !== '00:00:00';
        const adminProvidedActualWorkHours = row.actualWorkHours &&
          row.actualWorkHours !== '0:00:00' &&
          row.actualWorkHours.trim() !== '' &&
          row.actualWorkHours !== '00:00:00';
        const adminProvidedShiftHours = row.shiftHours &&
          row.shiftHours !== '0:00:00' &&
          row.shiftHours.trim() !== '' &&
          row.shiftHours !== '00:00:00';
        const adminProvidedShortfallHours = row.shortfallHours &&
          row.shortfallHours !== '0:00:00' &&
          row.shortfallHours.trim() !== '' &&
          row.shortfallHours !== '00:00:00';
        const adminProvidedExcessHours = row.excessHours &&
          row.excessHours !== '0:00:00' &&
          row.excessHours.trim() !== '' &&
          row.excessHours !== '00:00:00';

        // Calculate metrics automatically if check-in/out provided and admin hasn't entered values
        let calculatedMetrics: {
          totalWorkHours: string;
          breakHours: string;
          actualWorkHours: string;
          shiftHours: string;
          shortfallHours: string;
          excessHours: string;
        } | null = null;

        // Specialized logic for "Attendance Type" (Easy Entry Mode)
        let status = row.status || 'complete';
        let attendanceStatus: string[] = [];

        if (row.attendanceType) {
          const type = row.attendanceType.toString().trim().toLowerCase();
          if (type === 'present' || type === 'full day') {
            calculatedMetrics = {
              totalWorkHours: '09:00:00',
              breakHours: '00:00:00',
              actualWorkHours: '09:00:00',
              shiftHours: '09:00:00',
              shortfallHours: '00:00:00',
              excessHours: '00:00:00'
            };
            status = 'complete';
            attendanceStatus = ['Present'];
          } else if (type === 'half day' || type === 'half-day') {
            calculatedMetrics = {
              totalWorkHours: '04:30:00',
              breakHours: '00:00:00',
              actualWorkHours: '04:30:00',
              shiftHours: '09:00:00',
              shortfallHours: '04:30:00', // Shortfall reflects half day
              excessHours: '00:00:00'
            };
            status = 'incomplete';
            attendanceStatus = ['Present']; // Still present
          } else if (type === 'absent') {
            calculatedMetrics = {
              totalWorkHours: '00:00:00',
              breakHours: '00:00:00',
              actualWorkHours: '00:00:00',
              shiftHours: '09:00:00',
              shortfallHours: '09:00:00',
              excessHours: '00:00:00'
            };
            status = 'complete';
            attendanceStatus = ['Absent'];
          }
        }

        // Fallback to normal calculation if no Attendance Type provided
        if (!calculatedMetrics && hasCheckInOut) {
          try {
            calculatedMetrics = await this.calculateAttendanceMetrics(
              firstIn!,
              lastOut!,
              shiftStart,
              shiftEnd
            );
            console.log(`✅ Auto-calculated attendance metrics for row ${row.rowNumber}:`, calculatedMetrics);

            // Auto-tag Present if working > 0 hours and no tag exists
            if (calculatedMetrics && calculatedMetrics.actualWorkHours !== '00:00:00' && calculatedMetrics.actualWorkHours !== '0:00:00') {
              if (attendanceStatus.length === 0) attendanceStatus.push('Present');
            }
          } catch (calcError: any) {
            console.warn(`⚠️ Could not auto-calculate metrics for row ${row.rowNumber}: ${calcError.message}`);
            // Continue with default values if calculation fails
            calculatedMetrics = null;
          }
        }

        const recordData: any = {
          userId: new Types.ObjectId(row.userId),
          shiftId: new Types.ObjectId(row.shiftId),
          shiftCode: row.shiftCode?.trim(),
          shiftDay: this.parseDate(row.shiftDay!),
          shiftStart: shiftStart,
          shiftEnd: shiftEnd,
          firstIn: firstIn && !isNaN(firstIn.getTime()) ? firstIn : null,
          lastOut: lastOut && !isNaN(lastOut.getTime()) ? lastOut : null,
          // Use admin-provided values if available, otherwise use calculated values, otherwise default
          totalWorkHours: adminProvidedTotalWorkHours
            ? row.totalWorkHours
            : (calculatedMetrics?.totalWorkHours || '0:00:00'),
          breakHours: adminProvidedBreakHours
            ? row.breakHours
            : (calculatedMetrics?.breakHours || '0:00:00'),
          actualWorkHours: adminProvidedActualWorkHours
            ? row.actualWorkHours
            : (calculatedMetrics?.actualWorkHours || '0:00:00'),
          shiftHours: adminProvidedShiftHours
            ? row.shiftHours
            : (calculatedMetrics?.shiftHours || '0:00:00'),
          shortfallHours: adminProvidedShortfallHours
            ? row.shortfallHours
            : (calculatedMetrics?.shortfallHours || '0:00:00'),
          excessHours: adminProvidedExcessHours
            ? row.excessHours
            : (calculatedMetrics?.excessHours || '0:00:00'),
          status: status,
          attendanceStatus: attendanceStatus, // Add the populated status
          isWithinWindow: row.isWithinWindow !== undefined ? row.isWithinWindow : false,
          isLateEntry: row.isLateEntry !== undefined ? row.isLateEntry : false,
          isEarlyExit: row.isEarlyExit !== undefined ? row.isEarlyExit : false,
          isWFH: row.isWFH !== undefined ? row.isWFH : false,
          halfType: row.halfType && (row.halfType.toString().toLowerCase().includes('first')) ? 'First Half' :
            row.halfType && (row.halfType.toString().toLowerCase().includes('second')) ? 'Second Half' : undefined
        };

        // Check for existing record to handle updates/merges
        let record = await AttendanceRecord.findOne({
          userId: recordData.userId,
          shiftDay: recordData.shiftDay
        });

        // Check for approved leaves on this day to handle Half-Day + Leave joins
        const approvedLeave = await Leave.findOne({
          userId: recordData.userId,
          status: 'Approved',
          startDate: { $lte: recordData.shiftDay },
          endDate: { $gte: recordData.shiftDay }
        }).lean();

        const isLeaveHalfDay = approvedLeave && approvedLeave.leaveDuration === 'half-day';
        const isAttendanceHalfDay = row.attendanceType && (row.attendanceType.toString().toLowerCase().includes('half'));

        // Logic: If it's a Half-Day Leave AND a Half-Day Attendance import, 
        // the combined status should be 'leave_swipe' to avoid being marked 'incomplete'.
        if (approvedLeave && (isLeaveHalfDay || isAttendanceHalfDay)) {
          recordData.status = 'leave_swipe';
          if (!recordData.attendanceStatus.includes('On-Leave')) {
            recordData.attendanceStatus.push('On-Leave');
          }
        }

        if (record) {
          // DUPLICATE CHECK: Do NOT overwrite existing database records
          errors.push(`Row ${row.rowNumber}: Duplicate - Record already exists in database for User ${row.userId} on ${row.shiftDay}`);
          console.warn(`Skipping duplicate database record for User ${row.userId} on ${row.shiftDay}`);
          continue;
        } else {
          // Create new record
          record = new AttendanceRecord(recordData);
          await record.save();
        }
        created++;
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error occurred';
        errors.push(`Row ${row.rowNumber}: ${errorMessage}`);
        console.error(`Error inserting attendance record at row ${row.rowNumber}:`, error);
      }
    }

    return { created, errors };
  }

  /**
   * Calculate attendance metrics from check-in and check-out times
   * Handles edge cases: negative times, invalid dates, zero duration
   */
  private async calculateAttendanceMetrics(
    firstIn: Date,
    lastOut: Date,
    shiftStart: Date,
    shiftEnd: Date
  ): Promise<{
    totalWorkHours: string;
    breakHours: string;
    actualWorkHours: string;
    shiftHours: string;
    shortfallHours: string;
    excessHours: string;
  }> {
    // Validate dates
    if (!firstIn || !lastOut || !shiftStart || !shiftEnd) {
      throw new Error('All dates (firstIn, lastOut, shiftStart, shiftEnd) are required for calculation');
    }

    // Validate date validity
    if (isNaN(firstIn.getTime()) || isNaN(lastOut.getTime()) ||
      isNaN(shiftStart.getTime()) || isNaN(shiftEnd.getTime())) {
      throw new Error('Invalid date values provided');
    }

    // Validate lastOut is after firstIn
    if (lastOut.getTime() <= firstIn.getTime()) {
      throw new Error('Last Out time must be after First In time');
    }

    // Validate shiftEnd is after shiftStart
    if (shiftEnd.getTime() <= shiftStart.getTime()) {
      throw new Error('Shift End time must be after Shift Start time');
    }

    // Calculate shift duration first
    const shiftMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60);

    // For night shifts spanning multiple days, normalize to single day working hours
    // Check if shift spans multiple calendar days
    const shiftStartDate = new Date(shiftStart);
    const shiftEndDate = new Date(shiftEnd);
    const isNightShift = shiftStartDate.toDateString() !== shiftEndDate.toDateString();

    // Calculate actual time worked (for validation)
    const actualWorkedMinutes = (lastOut.getTime() - firstIn.getTime()) / (1000 * 60);

    // Handle negative or zero duration
    if (actualWorkedMinutes <= 0) {
      return {
        totalWorkHours: '00:00:00',
        breakHours: '00:00:00',
        actualWorkHours: '00:00:00',
        shiftHours: this.formatDuration(shiftMinutes),
        shortfallHours: '00:00:00',
        excessHours: '00:00:00',
      };
    }

    // For night shifts: Calculate based on time-of-day difference (normalize to single day)
    // Extract time portion and calculate hours worked within a day
    // Example: 03:30 to 12:30 = 9 hours (not 33 hours across days)
    let totalMinutes: number;
    if (isNightShift) {
      // Extract hours and minutes from shift times
      const startHour = shiftStart.getUTCHours();
      const startMin = shiftStart.getUTCMinutes();
      const endHour = shiftEnd.getUTCHours();
      const endMin = shiftEnd.getUTCMinutes();

      // Calculate time difference in minutes (normalized to same day)
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      // Handle case where end time is next day (e.g., 03:30 to 12:30)
      // If end time is less than start time, it means it's next day, so add 24 hours
      if (endMinutes < startMinutes) {
        totalMinutes = (24 * 60) - startMinutes + endMinutes;
      } else {
        totalMinutes = endMinutes - startMinutes;
      }

      // Use shift duration if calculated time seems unreasonable (fallback)
      if (totalMinutes > 1440 || totalMinutes <= 0) { // > 24 hours or invalid
        totalMinutes = shiftMinutes;
      }
    } else {
      // For regular shifts: Use actual time worked
      totalMinutes = actualWorkedMinutes;
    }

    // Improved break calculation that scales with work duration
    // Rules:
    // - ≤ 6 hours: 0 minutes break
    // - > 6 hours and ≤ 8 hours: 30 minutes break
    // - > 8 hours and ≤ 12 hours: 60 minutes break (1 hour)
    // - > 12 hours: 30 minutes per 6 hours worked (proportional)
    let breakMinutes = 0;
    if (totalMinutes > 360) { // > 6 hours
      if (totalMinutes <= 480) { // 6-8 hours
        breakMinutes = 30;
      } else if (totalMinutes <= 720) { // 8-12 hours
        breakMinutes = 60; // 1 hour break
      } else { // > 12 hours
        // Proportional: 30 minutes break per 6 hours worked
        // For 9 hours: (9 / 6) * 30 = 1.5 * 30 = 45 minutes
        breakMinutes = Math.floor((totalMinutes / 360) * 30);
        // Cap at reasonable maximum (e.g., 4 hours break for very long shifts)
        breakMinutes = Math.min(breakMinutes, 240); // Max 4 hours break
      }
    }

    // Calculate actual work minutes (total minus break)
    const actualWorkMinutes = Math.max(0, totalMinutes - breakMinutes);

    // For night shifts, also normalize shiftHours to match totalWorkHours calculation
    // This ensures shiftHours represents the actual working hours, not calendar time
    const normalizedShiftMinutes = isNightShift ? totalMinutes : shiftMinutes;

    // Calculate shortfall/excess by comparing actual work vs shift requirement
    const difference = actualWorkMinutes - normalizedShiftMinutes;

    return {
      totalWorkHours: this.formatDuration(totalMinutes),
      breakHours: this.formatDuration(breakMinutes),
      actualWorkHours: this.formatDuration(actualWorkMinutes),
      shiftHours: this.formatDuration(normalizedShiftMinutes),
      shortfallHours: difference < 0 ? this.formatDuration(Math.abs(difference)) : '00:00:00',
      excessHours: difference > 0 ? this.formatDuration(difference) : '00:00:00',
    };
  }

  /**
   * Format duration in minutes to HH:mm:ss string
   */
  private formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes % 1) * 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Helper methods
   */
  private getSheetName(objectType: ExportableObject): string {
    const names: { [key: string]: string } = {
      'user': 'Users',
      'shift': 'Shifts',
      'leave': 'Leaves',
      'salary-assignment': 'Salary Assignments',
      'salary-structure': 'Salary Structures',
      'attendance-record': 'Attendance Records'
    };
    return names[objectType] || objectType;
  }

  private styleHeaderRow(row: ExcelJS.Row): void {
    row.font = { bold: true };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
  }

  /**
   * Add field requirement notes to header cells
   */
  private addFieldRequirementNotes(worksheet: ExcelJS.Worksheet, fieldRequirements: { [columnIndex: number]: { required: boolean; note?: string } }): void {
    Object.entries(fieldRequirements).forEach(([colIndex, info]) => {
      const cell = worksheet.getCell(1, parseInt(colIndex));
      if (info.required) {
        cell.note = `Required field${info.note ? ` - ${info.note}` : ''}`;
        cell.font = { ...cell.font, color: { argb: 'FFFF0000' } }; // Red for required
      } else {
        cell.note = `Optional field${info.note ? ` - ${info.note}` : ''}`;
      }
    });
  }

  private autoFitColumns(worksheet: ExcelJS.Worksheet): void {
    worksheet.columns.forEach(column => {
      if (column.header) {
        column.width = Math.max(column.width || 0, column.header.toString().length + 2);
      }
    });
  }

  private getCellValue(row: ExcelJS.Row, columnIndex: number): string {
    const cell = row.getCell(columnIndex);

    // Use ExcelJS's text property which gives the formatted display value
    // This handles all cell types (string, number, date, formula, rich text, etc.)
    if (cell.text) {
      return cell.text.trim();
    }

    // Fallback to value if text is not available
    if (!cell.value) {
      return '';
    }

    // Handle different cell value types
    const value = cell.value;

    // If it's already a string, return it trimmed
    if (typeof value === 'string') {
      return value.trim();
    }

    // If it's a number, convert to string
    if (typeof value === 'number') {
      return value.toString().trim();
    }

    // If it's a boolean, convert to string
    if (typeof value === 'boolean') {
      return value.toString();
    }

    // If it's a Date object, format it
    if (value instanceof Date) {
      return value.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    }

    // If it's a rich text object (ExcelJS.RichText), extract the text
    if (value && typeof value === 'object' && 'richText' in value) {
      const richText = value as any;
      if (richText.richText && Array.isArray(richText.richText)) {
        return richText.richText.map((rt: any) => rt.text || '').join('').trim();
      }
    }

    // If it's an object with a text property (some ExcelJS cell types)
    if (value && typeof value === 'object' && 'text' in value) {
      return String((value as any).text).trim();
    }

    // Last resort: try toString, but check if it's [object Object]
    const stringValue = value.toString();
    if (stringValue === '[object Object]') {
      // Log warning for debugging
      console.warn(`⚠️ [Cell Value] Row ${row.number}, Column ${columnIndex}: Cell value is an object. Type:`, typeof value, 'Keys:', Object.keys(value || {}));
      return '';
    }

    return stringValue.trim();
  }

  /**
   * Safely parse a boolean value from cell
   */
  private parseBoolean(value: string, defaultValue: boolean = false): boolean {
    if (!value || typeof value !== 'string') return defaultValue;
    return value.toLowerCase().trim() === 'yes';
  }

  private parseDate(dateString: string): Date | null {
    if (!dateString || typeof dateString !== 'string') return null;

    const trimmed = dateString.trim();
    if (!trimmed) return null;

    // Try parsing as ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
    let date = new Date(trimmed);

    // If invalid, try common formats
    if (isNaN(date.getTime())) {
      // Try DD/MM/YYYY or MM/DD/YYYY
      const parts = trimmed.split(/[-\/]/);
      if (parts.length === 3) {
        // Assume YYYY-MM-DD format if first part is 4 digits
        if (parts[0].length === 4) {
          date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
        } else {
          // Assume DD/MM/YYYY
          date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
      }
    }

    // Final validation
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date format: ${dateString}`);
      return null;
    }

    return date;
  }

  /**
   * Validate if a string is a valid MongoDB ObjectId
   */
  private isValidObjectId(id: string): boolean {
    if (!id || typeof id !== 'string') return false;
    return Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;
  }

  /**
   * Safely parse a numeric value
   */
  private parseNumeric(value: any, defaultValue: number = 0): number {
    if (value === null || value === undefined || value === '') return defaultValue;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? defaultValue : parsed;
  }
}

