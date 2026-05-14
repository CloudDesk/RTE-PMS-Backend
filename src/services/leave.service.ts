import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { IUser, User } from '../models/user.model';
import { Leave } from '../models/leave.model';
import { LOV } from '../models/lov.model';
import { FilterQuery, Types } from 'mongoose';
import { ILeave } from '../models/leave.model';
import { LeaveSummaryService } from './leave-summary.service';
import { AttendanceRecord } from '../models/attendance-record.model';
import { generateEmailTemplate } from '../emails/templates';
import { emailService } from './email.service';
import { validateLeaveTypeForCountry } from '../utilis/leave-type-constants';
import { ShiftAssignment, IShiftAssignment } from '../models/shift.model';
import { HolidayCalendar } from '../models/holiday-calendar.model';
import { calculateBusinessDays } from '../utilis/dates';

export interface ILeaveCreate {
  userId: string | Types.ObjectId;
  leaveTypeId: string | Types.ObjectId;
  startDate: Date;
  endDate: Date;
  remarks?: string;
  leaveType?: string;
  noOfDays?: number;
  reason?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
  // India-specific: Half-day leave support
  leaveDuration?: 'full-day' | 'half-day';
  halfDayType?: 'first-half' | 'second-half';
  // Weekend and holiday exclusion information for UI display
  weekendExclusion?: {
    weekendDays: number[];
    excludedDates: Date[];
    excludedHolidays?: Date[];
    totalCalendarDays: number;
    actualDays: number;
  };
  // Apply on behalf feature
  appliedOnBehalf?: boolean;
  appliedBy?: {
    _id: string | Types.ObjectId;
    name: string;
    email: string;
  };
  // Document attachments (optional, for apply on behalf)
  documents?: Array<{
    fileName: string;
    filePath: string;
    uploadDate?: Date;
    uploadedBy?: Types.ObjectId;
  }>;
}

export interface ILeaveQuery {
  userId?: string | Types.ObjectId;
  status?: 'Pending' | 'Approved' | 'Rejected';
  leaveType?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
  sortBy?: keyof ILeave;
  search?: string;
  searchBy?: keyof ILeave;
  $or?: unknown;
  appliedTo?: string
}

export interface ILeaveStatusUpdate {
  status: 'Approved' | 'Rejected' | 'Cancelled';
  remarks?: string;
  approvedById: Types.ObjectId;
  rejectedById?: Types.ObjectId;
  noOfDays?: number;
  approvedBy?: {
    _id: string | Types.ObjectId;
    name: string;
    email: string;
  };
}

export class LeaveService extends BaseService {
  private leaveSummaryService: LeaveSummaryService;
  constructor(context: RequestContext) {
    super(context);
    this.leaveSummaryService = new LeaveSummaryService(context);
  }

  /**
   * Validate that the holiday date is an optional holiday in the calendar
   * Used for restricted_holiday leave type
   */
  private async validateOptionalHoliday(
    userId: Types.ObjectId,
    holidayDate: Date
  ): Promise<{ isValid: boolean; holidayName?: string; error?: string }> {
    const user = await User.findById(userId).select('holidayCalendarId holidayCalendarHistory').lean();
    if (!user) {
      return { isValid: false, error: 'User not found' };
    }

    // Determine target year from the holiday date
    const targetYear = new Date(holidayDate).getFullYear();
    let targetCalendarId = user.holidayCalendarId;

    // Check history for specific year
    if (user.holidayCalendarHistory && user.holidayCalendarHistory.length > 0) {
      const historicEntry = user.holidayCalendarHistory.find(h => h.year === targetYear);
      if (historicEntry) {
        targetCalendarId = historicEntry.calendarId.toString();
      }
    }

    if (!targetCalendarId) {
      return { isValid: false, error: 'No holiday calendar assigned to your account for this year. Please contact HR.' };
    }

    const calendar = await HolidayCalendar.findById(targetCalendarId).lean();
    if (!calendar) {
      return { isValid: false, error: 'Holiday calendar not found. Please contact HR.' };
    }

    // Normalize dates to YYYY-MM-DD format for comparison (ignore time)
    const holidayDateObj = new Date(holidayDate);
    const holidayDateStr = holidayDateObj.toISOString().split('T')[0];

    const matchingHoliday = calendar.holidays.find((h) => {
      const hDateObj = new Date(h.date);
      const hDateStr = hDateObj.toISOString().split('T')[0];
      return hDateStr === holidayDateStr && h.type === 'optional';
    });

    if (!matchingHoliday) {
      // Check if the date exists in calendar but is not optional
      const dateExists = calendar.holidays.find((h) => {
        const hDateObj = new Date(h.date);
        const hDateStr = hDateObj.toISOString().split('T')[0];
        return hDateStr === holidayDateStr;
      });

      if (dateExists) {
        return { isValid: false, error: `The selected date (${holidayDateStr}) exists in your calendar but is not marked as an optional holiday. Only dates marked as "optional" in the holiday calendar can be requested.` };
      } else {
        return { isValid: false, error: `The selected date (${holidayDateStr}) is not found in your holiday calendar as an optional holiday. Please select a date that is marked as optional in your calendar.` };
      }
    }

    return { isValid: true, holidayName: matchingHoliday.name };
  }

  /**
   * Check if employee has reached annual limit for restricted holidays
   * Used for restricted_holiday leave type
   */
  private async checkRestrictedHolidayAnnualLimit(
    userId: Types.ObjectId,
    year: number
  ): Promise<{ canRequest: boolean; used: number; remaining: number; total: number }> {
    // Count approved restricted_holiday leaves for this year
    const approvedCount = await Leave.countDocuments({
      userId: userId,
      leaveType: 'restricted_holiday',
      status: 'Approved',
      $expr: {
        $eq: [{ $year: '$startDate' }, year]
      }
    });

    // Get max allowed from leave summary (dynamic per user)
    const leaveSummary = await this.leaveSummaryService.getLeaveSummary(userId, year);
    const maxAllowed = leaveSummary.restricted_holiday?.alloted || 0;
    const canRequest = approvedCount < maxAllowed;
    const remaining = Math.max(0, maxAllowed - approvedCount);

    return {
      canRequest,
      used: approvedCount,
      remaining,
      total: maxAllowed,
    };
  }

  /**
   * Get active shift assignment for a user within a date range
   * Returns the shift assignment that is active during the requested date range
   */
  private async getShiftAssignmentForDateRange(
    userId: Types.ObjectId,
    startDate: Date,
    endDate: Date
  ): Promise<IShiftAssignment | null> {
    const startDateOnly = new Date(startDate);
    startDateOnly.setUTCHours(0, 0, 0, 0);

    const endDateOnly = new Date(endDate);
    endDateOnly.setUTCHours(23, 59, 59, 999);

    // Find active shift assignment that overlaps with the leave date range
    const shiftAssignment = await ShiftAssignment.findOne({
      userId,
      isActive: true,
      startDate: { $lte: endDateOnly },
      $or: [
        { endDate: { $gte: startDateOnly } },
        { endDate: null },
      ],
    }).sort({ startDate: -1 }); // Get the most recent assignment

    return shiftAssignment;
  }

  /**
   * Calculate total calendar days in a date range
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Total calendar days (inclusive)
   */
  private calculateTotalCalendarDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates

    return diffDays;
  }

  /**
   * Get all holidays (mandatory + optional) for a date range from user's holiday calendar
   * ✅ FIX: Include ALL holidays (not just mandatory) because optional holidays are applied separately
   * and attendance records may already be marked for those days
   * @param userId - User ID
   * @param startDate - Start date of leave
   * @param endDate - End date of leave
   * @returns Array of mandatory holiday dates only (optional/restricted holidays excluded)
   */
  private async getMandatoryHolidays(
    userId: Types.ObjectId,
    startDate: Date,
    endDate: Date
  ): Promise<Date[]> {
    const user = await User.findById(userId).select('holidayCalendarId holidayCalendarHistory').lean();
    if (!user) {
      return [];
    }

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
    const startTime = start.getTime();
    const endTime = end.getTime();

    const mandatoryHolidaysList: Date[] = [];
    const year = new Date(startDate).getFullYear();

    // Resolve calendar: holidayCalendarHistory (year-specific) or holidayCalendarId
    let calendarId: Types.ObjectId | undefined;
    const history = (user as any).holidayCalendarHistory;
    if (history && Array.isArray(history)) {
      const entry = history.find((e: any) => e.year === year && e.isActive === true);
      if (entry && entry.calendarId) {
        calendarId = entry.calendarId;
      }
    }
    if (!calendarId && user.holidayCalendarId) {
      calendarId = new Types.ObjectId(user.holidayCalendarId);
    }
    if (!calendarId) {
      return [];
    }

    const holidayCalendar = await HolidayCalendar.findById(calendarId).lean();
    if (!holidayCalendar || !holidayCalendar.holidays) {
      return mandatoryHolidaysList;
    }

    // Only mandatory holidays block leave. Optional/restricted holidays allow leave (e.g. annual leave on Dec 25).
    for (const holiday of holidayCalendar.holidays) {
      if (holiday.type === 'mandatory') {
        const holidayDate = new Date(holiday.date);
        holidayDate.setUTCHours(0, 0, 0, 0);
        const holidayTime = holidayDate.getTime();
        if (holidayTime >= startTime && holidayTime <= endTime) {
          mandatoryHolidaysList.push(holidayDate);
        }
      }
    }

    return mandatoryHolidaysList;
  }

  /**
   * Calculate working days excluding weekends and mandatory holidays
   * @param startDate - Start date of leave
   * @param endDate - End date of leave
   * @param weekendDays - Array of weekend day numbers (0=Sunday, 6=Saturday)
   * @param mandatoryHolidays - Array of mandatory holiday dates
   * @returns Number of working days (excluding weekends and holidays)
   */
  private calculateWorkingDaysExcludingWeekendsAndHolidays(
    startDate: Date,
    endDate: Date,
    weekendDays: number[],
    mandatoryHolidays: Date[]
  ): number {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    // Create a Set of holiday dates for quick lookup (normalize to date string for comparison)
    const holidayDatesSet = new Set(
      mandatoryHolidays.map(holiday => {
        const d = new Date(holiday);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime();
      })
    );

    let workingDays = 0;
    const currentDate = new Date(start);

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
      const currentTime = currentDate.getTime();

      // Check if the day is not a weekend and not a mandatory holiday
      if (!weekendDays.includes(dayOfWeek) && !holidayDatesSet.has(currentTime)) {
        workingDays++;
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDays;
  }

  /**
   * Get excluded dates (weekend dates and mandatory holidays) within a date range
   * @param startDate - Start date of leave
   * @param endDate - End date of leave
   * @param weekendDays - Array of weekend day numbers (0=Sunday, 6=Saturday)
   * @param mandatoryHolidays - Array of mandatory holiday dates
   * @returns Object with excludedDates (weekends + holidays) and excludedHolidays
   */
  private getExcludedDatesWithHolidays(
    startDate: Date,
    endDate: Date,
    weekendDays: number[],
    mandatoryHolidays: Date[]
  ): { excludedDates: Date[]; excludedHolidays: Date[] } {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    const excludedDates: Date[] = [];
    const excludedHolidays: Date[] = [];
    const currentDate = new Date(start);

    // Create a Set of holiday dates for quick lookup
    const holidayDatesSet = new Set(
      mandatoryHolidays.map(holiday => {
        const d = new Date(holiday);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime();
      })
    );

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      const currentTime = currentDate.getTime();
      const currentDateCopy = new Date(currentDate);

      // Check if it's a weekend
      if (weekendDays.includes(dayOfWeek)) {
        excludedDates.push(currentDateCopy);
      }

      // Check if it's a mandatory holiday
      if (holidayDatesSet.has(currentTime)) {
        excludedDates.push(currentDateCopy);
        excludedHolidays.push(currentDateCopy);
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return { excludedDates, excludedHolidays };
  }

  async findById(id: string | Types.ObjectId): Promise<ILeave> {
    console.log(id, 'ID IS ==>>> ');
    const leave = await Leave.findById(id);
    console.log(leave, 'Leave data');
    if (!leave) {
      throw new Error('Leave request not found');
    }

    // Populate user details
    const [user, approver] = await Promise.all([
      User.findById(leave.userId).select('name email'),
      leave.approvedById ? User.findById(leave.approvedById).select('name email') : null,
    ]);

    if (user) {
      leave.user = {
        name: user.name,
        email: user.email,
      };
    }

    if (approver) {
      leave.approvedBy = {
        _id: approver._id,
        name: approver.name,
        email: approver.email,
      };
    }

    // Ensure appliedOnBehalf and related fields are explicitly set (for consistency with WFH)
    // This ensures these fields are always included in the JSON response
    // Mongoose/JSON.stringify omits undefined values, so we set them to false explicitly if undefined
    if (leave.appliedOnBehalf === undefined) {
      leave.appliedOnBehalf = false;
    }
    if (leave.managerApproved === undefined) {
      leave.managerApproved = false;
    }
    if (leave.adminApproved === undefined) {
      leave.adminApproved = false;
    }

    return leave;
  }


  async findByUserId(userId: string | Types.ObjectId,
    filters: {
      search?: string;
      status?: string;
      leaveType?: string;
      startDate?: string; // YYYY-MM-DD
      endDate?: string;   // YYYY-MM-DD
    } = {},
    options: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ leaves: ILeave[]; total: number }> {
    console.log(userId, 'USER ID IS ==>>>');
    const { search, status, leaveType, startDate, endDate } = filters;
    const { page = 1, limit = 10, sortBy = 'startDate', sortOrder = 'desc' } = options;
    // Build query
    const query: any = { userId };

    if (status) {
      query.status = status;
    }

    if (leaveType) {
      query.leaveType = { $regex: leaveType, $options: 'i' }; // Case-insensitive search
    }

    // Handle date filters first
    if (startDate) {
      const start = new Date(startDate);
      start.setUTCHours(0, 0, 0, 0);
      query.startDate = { $gte: start };
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      query.endDate = { $lte: end };
    }

    // Handle search filter
    if (search) {
      // Escape special regex characters in search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Search in document fields (leaveType, reason, status)
      const searchConditions: any[] = [
        { leaveType: { $regex: escapedSearch, $options: 'i' } },
        { reason: { $regex: escapedSearch, $options: 'i' } },
        { status: { $regex: escapedSearch, $options: 'i' } },
      ];

      // Search in User collection to find matching users
      // Since user data is populated after query, we need to search users first
      const userSearchFilter: any = {
        $or: [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } },
        ]
      };

      // Combine with userId filter since we're already filtering by userId
      userSearchFilter._id = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

      const matchingUsers = await User.find(userSearchFilter).select('_id').lean();

      // If users found, add userId filter (though it should match since we're already filtering by userId)
      if (matchingUsers.length > 0) {
        const userIds = matchingUsers.map(u => u._id);
        searchConditions.push({ userId: { $in: userIds } });
      }

      // Combine search with existing filters using $and
      // This ensures search works correctly with date filters and other filters
      const existingFilters = { ...query };
      delete existingFilters.$or;

      query.$and = [
        existingFilters,
        { $or: searchConditions }
      ];
    }

    // Fetch leaves and total count concurrently
    const [leaves, total] = await Promise.all([
      Leave.find(query)
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Leave.countDocuments(query),
    ]);

    if (!leaves.length) {
      return { leaves: [], total: 0 };
    }

    // Populate user and approver details
    const populatedLeaves = await Promise.all(
      leaves.map(async (leave) => {
        const [user, approver] = await Promise.all([
          User.findById(leave.userId).select('name email').lean(),
          leave.approvedById ? User.findById(leave.approvedById).select('name email').lean() : null,
        ]);

        if (user) {
          leave.user = {
            name: user.name,
            email: user.email,
          };
        }

        if (approver) {
          leave.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        // Ensure appliedOnBehalf fields are always present (for consistency with WFH)
        if (leave.appliedOnBehalf === undefined) {
          leave.appliedOnBehalf = false;
        }
        if (leave.managerApproved === undefined) {
          leave.managerApproved = false;
        }
        if (leave.adminApproved === undefined) {
          leave.adminApproved = false;
        }

        return leave;
      })
    );

    return { leaves: populatedLeaves, total };
  }


  async findAll(query: ILeaveQuery): Promise<{ leaves: ILeave[], meta: { page: number, limit: number, total: number, totalPages: number } }> {
    const { userId, status, leaveType, startDate, endDate, page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (leaveType) filter.leaveType = { $regex: `^${leaveType}$`, $options: 'i' }; // Case-insensitive exact match

    // Handle date filters
    if (startDate || endDate) {
      filter.$or = [
        {
          startDate: {
            ...(startDate && { $gte: startDate }),
            ...(endDate && { $lte: endDate }),
          },
        },
        {
          endDate: {
            ...(startDate && { $gte: startDate }),
            ...(endDate && { $lte: endDate }),
          },
        },
      ];
    }

    // Handle search filter
    if (search) {
      // Escape special regex characters in search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Search in document fields (user.name, user.email, user.employeeCode, leaveType, reason, status)
      const searchConditions: any[] = [
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { 'user.email': { $regex: escapedSearch, $options: 'i' } },
        { leaveType: { $regex: escapedSearch, $options: 'i' } },
        { reason: { $regex: escapedSearch, $options: 'i' } },
        { status: { $regex: escapedSearch, $options: 'i' } },
      ];

      // Search in User collection to find matching users
      const userSearchFilter: any = {
        $or: [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } },
        ]
      };

      // If userId is already filtered, combine with user search
      if (userId) {
        userSearchFilter._id = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
      }

      const matchingUsers = await User.find(userSearchFilter).select('_id').lean();

      // If users found, add userId filter
      if (matchingUsers.length > 0) {
        const userIds = matchingUsers.map(u => u._id);
        searchConditions.push({ userId: { $in: userIds } });
      }

      // If there's already a $or for dates, we need to combine them properly
      if (filter.$or) {
        // We need to use $and to combine date filter with search filter
        filter.$and = [
          { $or: filter.$or },
          { $or: searchConditions }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    console.log(filter);
    const [leaves, total] = await Promise.all([
      Leave.find(filter as FilterQuery<ILeave>).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Leave.countDocuments(filter as FilterQuery<ILeave>),
    ]);

    // Populate all references in parallel for better performance
    const populatedLeaves = await Promise.all(
      leaves.map(async (leave) => {
        const [user, approver] = await Promise.all([
          User.findById(leave.userId).select('name email'),
          leave.approvedById ? User.findById(leave.approvedById).select('name email') : null,
        ]);

        if (user) {
          leave.user = {
            name: user.name,
            email: user.email,
          };
        }



        if (approver) {
          leave.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        // Ensure appliedOnBehalf fields are always present (for consistency with WFH)
        if (leave.appliedOnBehalf === undefined) {
          leave.appliedOnBehalf = false;
        }
        if (leave.managerApproved === undefined) {
          leave.managerApproved = false;
        }
        if (leave.adminApproved === undefined) {
          leave.adminApproved = false;
        }

        // Convert to plain object to ensure proper JSON serialization
        // This fixes issues with appliedTo showing as "[object Object]" and ensures all fields are included
        const leaveObj: any = leave.toObject ? leave.toObject() : { ...leave };

        // Ensure appliedTo is properly serialized (it's stored as an object in the model)
        if (leaveObj.appliedTo && typeof leaveObj.appliedTo === 'object') {
          leaveObj.appliedTo = {
            _id: leaveObj.appliedTo._id?.toString() || leaveObj.appliedTo._id || '',
            name: leaveObj.appliedTo.name || ''
          };
        }

        // Ensure appliedBy is properly serialized if it exists
        if (leaveObj.appliedBy && typeof leaveObj.appliedBy === 'object') {
          leaveObj.appliedBy = {
            _id: leaveObj.appliedBy._id?.toString() || leaveObj.appliedBy._id || '',
            name: leaveObj.appliedBy.name || '',
            email: leaveObj.appliedBy.email || ''
          };
        }

        // Ensure user field is included
        if (!leaveObj.user && user) {
          leaveObj.user = {
            name: user.name,
            email: user.email
          };
        }

        // Ensure all date fields are properly formatted (convert Date to string for JSON)
        if (leaveObj.startDate) {
          leaveObj.startDate = leaveObj.startDate instanceof Date
            ? leaveObj.startDate.toISOString().split('T')[0]
            : leaveObj.startDate;
        }
        if (leaveObj.endDate) {
          leaveObj.endDate = leaveObj.endDate instanceof Date
            ? leaveObj.endDate.toISOString().split('T')[0]
            : leaveObj.endDate;
        }

        return leaveObj as ILeave;
      })
    );
    console.log(populatedLeaves);
    return {
      leaves: populatedLeaves,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(leaveData: ILeaveCreate): Promise<ILeave> {
    // Ensure weekendExclusion is not passed from frontend - it will be calculated by backend
    // Remove any weekendExclusion that might have been passed
    delete leaveData.weekendExclusion;

    // noOfDays will be calculated by backend - ignore any value passed from frontend
    // It will be set based on:
    // - Half-day leaves: 0.5
    // - Full-day leaves: working days excluding weekends and mandatory holidays

    // VALIDATION 1: Check if leave type is valid for employee's country
    const user = await User.findById(leaveData.userId).select('country name email holidayCalendarId');
    if (!user) {
      throw new Error('User not found');
    }

    // VALIDATION: 3-day rule for employee self-application (excluding weekends)
    // If employee is applying themselves (not admin on behalf), check if > 3 business days have passed
    const currentUser = this.context?.user;
    const isAdmin = currentUser && (currentUser.role === 'admin' || (currentUser as any).isSuperAdmin);
    const isApplyingForSelf = currentUser && currentUser._id.toString() === (typeof leaveData.userId === 'string' ? leaveData.userId : leaveData.userId.toString());

    // Only validate 3-day rule if employee is applying for themselves (not admin applying on behalf)
    if (!leaveData.appliedOnBehalf && !isAdmin && isApplyingForSelf) {
      const leaveStartDate = new Date(leaveData.startDate);
      leaveStartDate.setUTCHours(0, 0, 0, 0);

      const today = new Date();
      today.setUTCHours(23, 59, 59, 999);

      // Get shift assignment to determine weekend days
      const userIdObj = typeof leaveData.userId === 'string'
        ? new Types.ObjectId(leaveData.userId)
        : leaveData.userId;

      const shiftAssignment = await this.getShiftAssignmentForDateRange(
        userIdObj,
        leaveStartDate,
        leaveStartDate
      );

      const weekendDays = shiftAssignment?.weekendDays && shiftAssignment.weekendDays.length > 0
        ? shiftAssignment.weekendDays
        : [0, 6]; // Default: Sunday and Saturday

      // Calculate business days from leave start date to today (excluding weekends)
      const businessDaysPassed = calculateBusinessDays(leaveStartDate, today, weekendDays);

      if (businessDaysPassed > 3) {
        throw new Error(
          `You cannot apply for leave after 3 business days have passed. ` +
          `${businessDaysPassed} business days have passed since the leave date. ` +
          `Please contact your admin to apply on your behalf.`
        );
      }
    }

    // Security check: Only admins can set appliedOnBehalf = true
    if (leaveData.appliedOnBehalf && !isAdmin) {
      throw new Error('Only admins can apply for leave on behalf of employees. Please use the regular leave application endpoint.');
    }

    // If applied on behalf, set the appliedBy information
    if (leaveData.appliedOnBehalf && isAdmin && currentUser) {
      leaveData.appliedBy = {
        _id: currentUser._id,
        name: currentUser.name,
        email: currentUser.email || ''
      };
    } else if (!leaveData.appliedOnBehalf && currentUser) {
      // If not applied on behalf, set appliedBy to the employee themselves
      leaveData.appliedBy = {
        _id: currentUser._id,
        name: currentUser.name,
        email: currentUser.email || ''
      };
    }

    // If leaveType is not provided, fetch it from Lov using leaveTypeId
    // Note: leaveTypeId points to a Lov document with values array
    if (!leaveData.leaveType && leaveData.leaveTypeId) {
      const lov = await LOV.findById(leaveData.leaveTypeId);
      if (!lov) {
        throw new Error(`Leave type Lov not found for ID: ${leaveData.leaveTypeId}`);
      }

      // Find the first active value
      let selectedValue = lov.values.find(v => v.isActive !== false);

      // Fallback to first value if no active value found
      if (!selectedValue && lov.values.length > 0) {
        selectedValue = lov.values[0];
      }

      if (!selectedValue) {
        throw new Error('No leave type value found in Lov document');
      }

      leaveData.leaveType = selectedValue.value; // Set the value (e.g., "annual", "sick")
      console.log(`✅ [Leave Type] Fetched from Lov: ${leaveData.leaveType} for leaveTypeId: ${leaveData.leaveTypeId}`);
    }

    // Ensure leaveType is set before proceeding
    if (!leaveData.leaveType) {
      throw new Error('Leave type is required. Please provide leaveType or ensure leaveTypeId points to a valid Lov with values.');
    }

    // SPECIAL HANDLING FOR restricted_holiday (Optional Holiday)
    if (leaveData.leaveType === 'restricted_holiday') {
      // Validate that startDate and endDate are the same (single date only)
      const startDateStr = new Date(leaveData.startDate).toDateString();
      const endDateStr = new Date(leaveData.endDate).toDateString();

      if (startDateStr !== endDateStr) {
        throw new Error('Restricted holiday must be for a single date (startDate must equal endDate)');
      }

      // Validate that the date is an optional holiday in the calendar
      const userIdObj = typeof leaveData.userId === 'string'
        ? new Types.ObjectId(leaveData.userId)
        : leaveData.userId;

      const validation = await this.validateOptionalHoliday(userIdObj, leaveData.startDate);
      if (!validation.isValid) {
        throw new Error(validation.error || 'The selected date is not an optional holiday in your calendar');
      }

      // Check annual limit
      const year = new Date(leaveData.startDate).getFullYear();
      const limitCheck = await this.checkRestrictedHolidayAnnualLimit(userIdObj, year);
      if (!limitCheck.canRequest) {
        throw new Error(`Annual limit reached. You have already used ${limitCheck.used} out of ${limitCheck.total} restricted holidays for ${year}`);
      }

      // Check for duplicate request - same date, any status except Rejected/Cancelled
      const startOfDay = new Date(leaveData.startDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(leaveData.startDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const existingRequest = await Leave.findOne({
        userId: userIdObj,
        leaveType: 'restricted_holiday',
        startDate: { $gte: startOfDay, $lte: endOfDay },
        endDate: { $gte: startOfDay, $lte: endOfDay },
        status: { $nin: ['Rejected', 'Cancelled'] },
      });

      if (existingRequest) {
        throw new Error('You have already applied for this restricted holiday');
      }

      // Set noOfDays to 1 for restricted holiday (single day)
      leaveData.noOfDays = 1;
      // Ensure it's full-day (not half-day)
      leaveData.leaveDuration = 'full-day';
      leaveData.halfDayType = undefined;

      // Skip weekend/holiday exclusion for restricted holidays
      // They are treated as regular working days that can be taken off
      console.log(`✅ [Restricted Holiday] Validated optional holiday: ${validation.holidayName} on ${leaveData.startDate.toISOString().split('T')[0]}`);
    } else {
      // VALIDATION: Check that startDate and endDate are in the same year
      // Leave cannot span across multiple years - user must apply for separate leaves for each year
      const startYear = new Date(leaveData.startDate).getFullYear();
      const endYear = new Date(leaveData.endDate).getFullYear();

      if (startYear !== endYear) {
        throw new Error(
          `Leave cannot span across multiple years. ` +
          `Start date (${startYear}) and end date (${endYear}) must be in the same year. ` +
          `Please apply for separate leaves for each year.`
        );
      }

      // India-specific: Validate half-day leave restrictions
      if (leaveData.leaveDuration === 'half-day') {
        if (user.country !== 'IN') {
          throw new Error('Half-day leaves are only available for India employees');
        }

        // Validate half-day specific rules
        const startDateStr = new Date(leaveData.startDate).toDateString();
        const endDateStr = new Date(leaveData.endDate).toDateString();

        if (startDateStr !== endDateStr) {
          throw new Error('Half-day leaves must be on the same day (startDate = endDate)');
        }

        if (!leaveData.halfDayType) {
          throw new Error('halfDayType is required for half-day leaves');
        }

        // Set noOfDays to 0.5 for half-day leaves
        leaveData.noOfDays = 0.5;
      } else {
        // Default to full-day if not specified
        leaveData.leaveDuration = leaveData.leaveDuration || 'full-day';
        // Clear halfDayType for full-day leaves
        if (leaveData.leaveDuration === 'full-day') {
          leaveData.halfDayType = undefined;
        }
      }
    }

    // Validate leave type against country
    if (leaveData.leaveType) {
      try {
        validateLeaveTypeForCountry(user.country, leaveData.leaveType);
        console.log(`✅ [Leave Validation] ${leaveData.leaveType} is valid for ${user.country} employee: ${user.name}`);
      } catch (error: any) {
        console.error(`❌ [Leave Validation] ${error.message}`);
        throw error;
      }
    }

    // Check for overlapping leaves (handle half-day leaves and restricted_holiday)
    // Exclude 'Rejected' and 'Cancelled' statuses - cancelled leaves can be re-applied
    // Note: Overlap check is based on calendar dates, not working days
    // Skip overlap check for restricted_holiday as it's already validated above
    if (leaveData.leaveType !== 'restricted_holiday') {
      const baseQuery: any = {
        userId: leaveData.userId,
        status: { $nin: ['Rejected', 'Cancelled'] },
      };

      if (leaveData.leaveDuration === 'half-day') {
        // For half-day leaves:
        // 1. Check if same halfDayType exists on same date
        // 2. Check if full-day leave exists on same date
        const leaveDate = new Date(leaveData.startDate);
        const dayStart = new Date(leaveDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(leaveDate);
        dayEnd.setHours(23, 59, 59, 999);

        // Check 1: Same halfDayType on same date
        const sameHalfDayQuery = {
          ...baseQuery,
          $and: [
            {
              startDate: { $gte: dayStart, $lte: dayEnd }
            },
            {
              endDate: { $gte: dayStart, $lte: dayEnd }
            },
            {
              halfDayType: leaveData.halfDayType
            },
            {
              leaveDuration: 'half-day'
            }
          ]
        };

        // Check 2: Full-day leave on same date
        // Check if any full-day leave (or leave without leaveDuration field) overlaps with the half-day date
        const fullDayQuery = {
          ...baseQuery,
          startDate: { $lte: dayEnd },
          endDate: { $gte: dayStart },
          $or: [
            { leaveDuration: { $ne: 'half-day' } },
            { leaveDuration: { $exists: false } } // Old leaves without leaveDuration field are treated as full-day
          ]
        };

        const sameHalfDayLeave = await Leave.findOne(sameHalfDayQuery);
        const fullDayLeave = await Leave.findOne(fullDayQuery);

        if (sameHalfDayLeave) {
          const sessionName = leaveData.halfDayType === 'first-half' ? 'morning' : 'afternoon';
          throw new Error(`A ${sessionName} half-day leave already exists for this date`);
        }

        if (fullDayLeave) {
          throw new Error('A full-day leave already exists for this date. Cannot apply half-day leave.');
        }
      } else {
        // For full-day leaves:
        // 1. Check if any full-day leave overlaps with date range (calendar dates)
        // 2. Check if any half-day leave exists on any date in the range (calendar dates)
        const startDate = new Date(leaveData.startDate);
        const endDate = new Date(leaveData.endDate);

        // Check 1: Full-day leave overlap (based on calendar dates)
        // Check if any full-day leave (or leave without leaveDuration field) overlaps with the date range
        const fullDayOverlapQuery = {
          ...baseQuery,
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
          $or: [
            { leaveDuration: { $ne: 'half-day' } },
            { leaveDuration: { $exists: false } } // Old leaves without leaveDuration field are treated as full-day
          ]
        };

        // Check 2: Any half-day leave in the date range (based on calendar dates)
        // For each day in the range, check if any half-day exists
        const halfDayOverlapQuery = {
          ...baseQuery,
          leaveDuration: 'half-day',
          $and: [
            {
              startDate: { $lte: endDate }
            },
            {
              endDate: { $gte: startDate }
            }
          ]
        };

        const fullDayOverlap = await Leave.findOne(fullDayOverlapQuery);
        const halfDayOverlap = await Leave.findOne(halfDayOverlapQuery);

        if (fullDayOverlap) {
          throw new Error('Leave dates overlap with existing full-day leave request');
        }

        if (halfDayOverlap) {
          throw new Error('A half-day leave already exists in the selected date range. Cannot apply full-day leave.');
        }
      }
    }

    // Calculate noOfDays excluding weekends and mandatory holidays for full-day leaves.
    // Scenario: optional/restricted holiday → ALLOW leave (e.g. annual leave on Dec 25). Weekend/mandatory → NOT allow (existing).
    // getMandatoryHolidays returns only type === 'mandatory'; optional holidays are not excluded.
    // Skip calculation for restricted_holiday (already set to 1) and half-day leaves (already set to 0.5)
    if (leaveData.leaveType !== 'restricted_holiday' && leaveData.leaveDuration !== 'half-day') {
      const userIdObj = typeof leaveData.userId === 'string'
        ? new Types.ObjectId(leaveData.userId)
        : leaveData.userId;

      // Get active shift assignment for the date range
      const shiftAssignment = await this.getShiftAssignmentForDateRange(
        userIdObj,
        leaveData.startDate,
        leaveData.endDate
      );

      // Get weekendDays from shift assignment, or default to [0, 6] (Sunday and Saturday)
      const weekendDays = shiftAssignment?.weekendDays && shiftAssignment.weekendDays.length > 0
        ? shiftAssignment.weekendDays
        : [0, 6]; // Default: Sunday (0) and Saturday (6)

      // Get mandatory holidays only; optional/restricted holidays allow leave (e.g. annual leave on restricted holiday)
      const mandatoryHolidays = await this.getMandatoryHolidays(
        userIdObj,
        leaveData.startDate,
        leaveData.endDate
      );

      // Calculate working days excluding weekends and mandatory holidays only
      const workingDays = this.calculateWorkingDaysExcludingWeekendsAndHolidays(
        leaveData.startDate,
        leaveData.endDate,
        weekendDays,
        mandatoryHolidays
      );

      // Validate that there's at least one working day
      if (workingDays <= 0) {
        const weekendNames = weekendDays.map(day => {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          return days[day];
        }).join(', ');
        const holidayCount = mandatoryHolidays.length;
        const holidayText = holidayCount > 0 ? ` and ${holidayCount} holiday(s)` : '';
        throw new Error(`All days in the requested date range fall on weekends (${weekendNames})${holidayText}. Please select dates that include at least one working day.`);
      }

      // Get excluded dates (weekend dates and mandatory holidays only)
      const { excludedDates, excludedHolidays } = this.getExcludedDatesWithHolidays(
        leaveData.startDate,
        leaveData.endDate,
        weekendDays,
        mandatoryHolidays
      );

      // Calculate total calendar days
      const totalCalendarDays = this.calculateTotalCalendarDays(
        leaveData.startDate,
        leaveData.endDate
      );

      // Update noOfDays to exclude weekends and mandatory holidays only
      leaveData.noOfDays = workingDays;

      // Store weekend and holiday exclusion information for UI display
      leaveData.weekendExclusion = {
        weekendDays: weekendDays,
        excludedDates: excludedDates,
        excludedHolidays: excludedHolidays,
        totalCalendarDays: totalCalendarDays,
        actualDays: workingDays
      };

      console.log(`✅ [Weekend & Holiday Exclusion] Calculated ${workingDays} working days (excluding weekends: ${weekendDays.join(', ')} and ${mandatoryHolidays.length} mandatory holiday(s)) for leave from ${leaveData.startDate.toISOString().split('T')[0]} to ${leaveData.endDate.toISOString().split('T')[0]}`);
      console.log(`📅 [Exclusion] Excluded ${excludedDates.length} date(s) total (${excludedDates.length - excludedHolidays.length} weekend(s) + ${excludedHolidays.length} mandatory holiday(s))`);
    }

    // VALIDATION: Check leave balance BEFORE creating the leave (for leave types that require balance)
    // This check happens AFTER noOfDays is calculated so we can validate against the actual days requested
    // Skip balance check for leave types that don't require balance: lossOfPay, otherUnpaid
    // Skip balance check for restricted_holiday (has its own annual limit check)
    const leaveTypesRequiringBalance = ['annual', 'sick', 'compOff', 'otherPaid', 'maternity', 'work_from_home'];
    if (leaveTypesRequiringBalance.includes(leaveData.leaveType)) {
      const userIdObj = typeof leaveData.userId === 'string'
        ? new Types.ObjectId(leaveData.userId)
        : leaveData.userId;
      const year = new Date(leaveData.startDate).getFullYear();

      // Get leave summary to check balance
      const leaveSummary = await this.leaveSummaryService.getLeaveSummary(userIdObj, year);

      // Map leave type to category key (handle work_from_home -> workFromHome)
      const categoryTypeKey = leaveData.leaveType === 'work_from_home'
        ? 'workFromHome'
        : leaveData.leaveType;

      const category = leaveSummary[categoryTypeKey as keyof typeof leaveSummary] as any;

      if (!category) {
        throw new Error(`Leave category '${leaveData.leaveType}' not found in leave summary`);
      }

      const alloted = category.alloted || 0;
      const availed = category.availed || 0;
      const remaining = alloted - availed;
      const requestedDays = leaveData.noOfDays || 0;

      // Check if sufficient balance exists
      if (remaining < requestedDays) {
        const leaveTypeLabel = leaveData.leaveType === 'work_from_home'
          ? 'Work From Home'
          : leaveData.leaveType.charAt(0).toUpperCase() + leaveData.leaveType.slice(1);
        throw new Error(
          `Insufficient ${leaveTypeLabel} leave balance. ` +
          `Available: ${remaining.toFixed(1)} days, Requested: ${requestedDays.toFixed(1)} days. ` +
          `Please check your leave balance or contact your admin.`
        );
      }

      console.log(`✅ [Balance Check] ${leaveData.leaveType}: Available ${remaining.toFixed(1)} days, Requested ${requestedDays.toFixed(1)} days - Sufficient balance`);
    }

    console.log(leaveData, 'leaveData 2 data');
    const leave: ILeave = await Leave.create(leaveData);
    // Update leave summary when leave is created
    console.log(leave, 'leave data 2 final');


    //Email to Manager 
    const manager: IUser = await User.findById(
      new Types.ObjectId(leave.appliedTo?._id)
    ).select('name email');
    const applier: IUser = await User.findById(new Types.ObjectId(leave.userId)).select('name email');
    //get the Recipient Email
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    console.log(manager, "manager")

    // For restricted_holiday, use "holiday" terminology instead of "leave"
    const isRestrictedHoliday = leave.leaveType === 'restricted_holiday';
    const requestType = isRestrictedHoliday ? 'holiday' : 'leave';
    const requestTypeCapitalized = isRestrictedHoliday ? 'Holiday' : 'Leave';

    const htmlContent = generateEmailTemplate('leaveApplyEmail', {
      managerName: manager.name,
      employeeName: applier.name,
      leaveType: leave.leaveType,
      fromDate: leave.startDate.toDateString(),
      toDate: leave.endDate.toDateString(),
      totalDays: leave.noOfDays,
      reason: leave.reason,
      approvalLink: `${appUrl}/manager/actions/leaves/${leave._id}`,
      companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
      appliedOnBehalf: leave.appliedOnBehalf || false,
      appliedByName: leave.appliedBy?.name || '',
    });

    await emailService.sendEmail({
      body: {
        to: manager.email,
        subject: `${requestTypeCapitalized} Request from ${applier.name}`,
        text: `${applier.name} has requested ${requestType} from ${leave.startDate.toDateString()} to ${leave.endDate.toDateString()} for ${leave.leaveType}.`,
        html: htmlContent,
      }
    });

    // Send Email Notification to All Admins
    try {
      const admins = await User.find({
        $or: [
          { role: 'admin' },
          { isSuperAdmin: true }
        ],
        active: true
      }).select('name email').lean();

      if (admins && admins.length > 0) {
        const adminEmails = admins.map(admin => admin.email).filter(Boolean);

        if (adminEmails.length > 0 && applier) {
          const fromDateFormatted = leave.startDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          const toDateFormatted = leave.endDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });

          // For restricted_holiday, use "holiday" terminology instead of "leave"
          const isRestrictedHoliday = leave.leaveType === 'restricted_holiday';
          const requestType = isRestrictedHoliday ? 'holiday' : 'leave';
          const requestTypeCapitalized = isRestrictedHoliday ? 'Holiday' : 'Leave';

          const appliedOnBehalfText = leave.appliedOnBehalf
            ? `\n- Applied On Behalf: Yes (Applied by: ${leave.appliedBy?.name || 'Admin'})`
            : '';

          const adminEmailText = `Dear Admin,

A ${requestType} request has been submitted${leave.appliedOnBehalf ? ' on behalf of' : ' by'} ${applier.name}.

Request Details:
- Employee: ${applier.name} (${applier.email || 'N/A'})
- ${requestTypeCapitalized} Type: ${leave.leaveType}
- From Date: ${fromDateFormatted}
- To Date: ${toDateFormatted}
- Total Days: ${leave.noOfDays}
- Reason: ${leave.reason || 'N/A'}
- Status: Pending${leave.appliedOnBehalf ? ' (Can be approved by Manager or Admin)' : ''}${appliedOnBehalfText}
- Manager: ${manager?.name || 'N/A'}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `${requestTypeCapitalized} Request Submitted - ${applier.name}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for leave request ${leave._id}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for leave request:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    console.log("first")
    // Pass leaveType as-is to updateLeaveBalance - it will handle the mapping to camelCase
    // The leaveType from frontend is already in camelCase (e.g., "lossOfPay")
    await this.leaveSummaryService.updateLeaveBalance(
      leave.userId as Types.ObjectId,
      new Date(leave.startDate).getFullYear(),
      leave.leaveType || '',
      leave.noOfDays as number,
      leave._id as Types.ObjectId
    );

    return this.findById(leave._id as string);
  }

  async updateStatus(id: string | Types.ObjectId, updateData: ILeaveStatusUpdate): Promise<ILeave> {
    console.log("updateStatus 1", id);
    const leave = await Leave.findById(id);
    console.log(leave, "updatestatus 2")
    if (!leave) {
      throw new Error('Leave request not found');
    }

    if (leave.status !== 'Pending') {
      throw new Error('Leave request has already been processed');
    }

    const currentUser = this.context?.user;
    const isAdmin = currentUser && (currentUser.role === 'admin' || (currentUser as any).isSuperAdmin);
    const isManager = currentUser && leave.appliedTo?._id === currentUser._id.toString();

    // Handle dual approval for applied on behalf
    if (leave.appliedOnBehalf) {
      // If rejected, reject immediately
      if (updateData.status === 'Rejected') {
        leave.status = 'Rejected';
        leave.approvedById = updateData.approvedById;
        leave.approvedBy = updateData.approvedBy
          ? {
            _id: typeof updateData.approvedBy._id === 'string'
              ? updateData.approvedBy._id
              : updateData.approvedBy._id.toString(),
            name: updateData.approvedBy.name,
            email: updateData.approvedBy.email,
          }
          : undefined;
        leave.approvedAt = new Date();
        if (updateData.remarks) leave.remarks = updateData.remarks;

        // Set who rejected (manager or admin)
        if (isManager) {
          leave.managerApproved = false;
          leave.managerApprovedById = updateData.approvedById;
          leave.managerApprovedAt = new Date();
        } else if (isAdmin) {
          leave.adminApproved = false;
          leave.adminApprovedById = updateData.approvedById;
          leave.adminApprovedAt = new Date();
        }
      } else if (updateData.status === 'Approved') {
        // For approval, either manager OR admin can approve (single approval needed)
        if (isManager && !leave.managerApproved) {
          // Manager approves - immediately approve
          leave.managerApproved = true;
          leave.managerApprovedById = updateData.approvedById;
          leave.managerApprovedAt = new Date();
          leave.status = 'Approved';
          leave.approvedById = updateData.approvedById;
          leave.approvedBy = updateData.approvedBy
            ? {
              _id: typeof updateData.approvedBy._id === 'string'
                ? updateData.approvedBy._id
                : updateData.approvedBy._id.toString(),
              name: updateData.approvedBy.name,
              email: updateData.approvedBy.email,
            }
            : undefined;
          leave.approvedAt = new Date();
        } else if (isAdmin && !leave.adminApproved) {
          // Admin approves - immediately approve
          leave.adminApproved = true;
          leave.adminApprovedById = updateData.approvedById;
          leave.adminApprovedAt = new Date();
          leave.status = 'Approved';
          leave.approvedById = updateData.approvedById;
          leave.approvedBy = updateData.approvedBy
            ? {
              _id: typeof updateData.approvedBy._id === 'string'
                ? updateData.approvedBy._id
                : updateData.approvedBy._id.toString(),
              name: updateData.approvedBy.name,
              email: updateData.approvedBy.email,
            }
            : undefined;
          leave.approvedAt = new Date();
        } else {
          throw new Error('You have already approved this leave request');
        }
      }
    } else {
      // Normal approval flow (not applied on behalf)
      console.log(updateData, 'updateData in update Status');
      leave.status = updateData.status;
      leave.approvedById = updateData.approvedById;
      console.log(updateData.approvedBy, 'updateData.approvedBy');
      console.log(updateData.approvedBy?._id, 'updateData.approvedBy?.id');
      console.log(updateData.approvedBy?.name, 'updateData.approvedBy?.name');
      console.log(updateData.approvedBy?.email, 'updateData.approvedBy?.email');
      leave.approvedBy = updateData.approvedBy
        ? {
          _id: typeof updateData.approvedBy._id === 'string'
            ? updateData.approvedBy._id
            : updateData.approvedBy._id.toString(),
          name: updateData.approvedBy.name,
          email: updateData.approvedBy.email,
        }
        : undefined;

      leave.approvedAt = new Date();
    }

    // leave.noOfDays = updateData.noOfDays;
    if (updateData.remarks) leave.remarks = updateData.remarks;
    await leave.save();

    // Send email notification to employee (the person who applied)
    // Only send email if status is 'Approved' or 'Rejected'
    // For applied on behalf: Either manager or admin can approve, and email is sent immediately
    const shouldSendEmail = leave.status === 'Approved' || leave.status === 'Rejected';

    if (shouldSendEmail) {
      try {
        const employee: IUser = await User.findById(new Types.ObjectId(leave.userId)).select('name email');
        // For applied on behalf, get the approver (manager or admin who approved)
        // For rejected, get who rejected
        // For normal approval, get the approver
        let approver: IUser | null = null;
        if (leave.appliedOnBehalf && leave.status === 'Approved') {
          // Get who approved (manager or admin - either can approve)
          approver = leave.adminApprovedById
            ? (await User.findById(leave.adminApprovedById).select('name email')) as IUser | null
            : leave.managerApprovedById
              ? (await User.findById(leave.managerApprovedById).select('name email')) as IUser | null
              : null;
        } else if (leave.appliedOnBehalf && leave.status === 'Rejected') {
          // Get who rejected (manager or admin)
          approver = leave.approvedById ? (await User.findById(leave.approvedById).select('name email')) as IUser | null : null;
        } else {
          // Normal approval/rejection
          approver = leave.approvedById ? (await User.findById(leave.approvedById).select('name email')) as IUser | null : null;
        }

        if (employee && employee.email) {
          const fromDateFormatted = leave.startDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          const toDateFormatted = leave.endDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });

          // For restricted_holiday, use "holiday" terminology instead of "leave"
          const isRestrictedHoliday = leave.leaveType === 'restricted_holiday';
          const requestType = isRestrictedHoliday ? 'holiday' : 'leave';
          const requestTypeCapitalized = isRestrictedHoliday ? 'Holiday' : 'Leave';

          const htmlContent = generateEmailTemplate('leaveApprovalEmail', {
            employeeName: employee.name,
            approverName: approver?.name || 'Manager',
            leaveType: leave.leaveType,
            fromDate: fromDateFormatted,
            toDate: toDateFormatted,
            totalDays: leave.noOfDays,
            remarks: leave.remarks || '',
            status: leave.status, // 'Approved' or 'Rejected'
            companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
            appliedOnBehalf: leave.appliedOnBehalf || false,
            appliedByName: leave.appliedBy?.name || '',
          });

          const appliedByText = leave.appliedOnBehalf && leave.appliedBy?.name
            ? `\n- Applied By: ${leave.appliedBy.name} (on behalf)`
            : '';

          const emailText = `Dear ${employee.name},

Your ${requestType} request has been ${leave.status.toLowerCase()} by ${approver?.name || 'Manager'}.
${leave.appliedOnBehalf && leave.appliedBy?.name ? `\nNote: This request was applied on your behalf by ${leave.appliedBy.name}.` : ''}

${requestTypeCapitalized} Details:
- ${requestTypeCapitalized} Type: ${leave.leaveType}
- From Date: ${fromDateFormatted}
- To Date: ${toDateFormatted}
- Total Days: ${leave.noOfDays}
- Reason: ${leave.reason || 'N/A'}${appliedByText}
- Approved By: ${approver?.name || 'Manager'}
${leave.remarks ? `- Remarks: ${leave.remarks}` : ''}

${leave.status === 'Approved'
              ? `Your ${requestType} request has been approved. ${isRestrictedHoliday ? 'Enjoy your holiday!' : 'Please ensure you have completed all pending work before your leave period.'}`
              : `Unfortunately, your ${requestType} request has been rejected. If you have any questions, please contact your manager.`}

Thank you for your understanding.

Regards,
${approver?.name || 'Manager'}
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: employee.email,
              subject: `Your ${requestTypeCapitalized} Request has been ${leave.status}`,
              text: emailText,
              html: htmlContent,
            }
          });

          console.log(`Email notification sent to ${employee.email} for leave request ${leave._id} - Status: ${leave.status}`);
        } else {
          console.warn(`Cannot send email: Employee not found or email missing for userId: ${leave.userId}`);
        }
      } catch (emailError) {
        console.error('Failed to send email to employee for leave request:', emailError);
        // Don't fail the request if email fails - log the error but continue
      }
    } else {
      // Manager approved first (for applied on behalf) - don't send email yet, wait for admin approval
      console.log(`Manager approved leave ${leave._id} (applied on behalf). Waiting for admin approval before sending email.`);
    }

    // Send email notification to all admins
    try {
      const admins = await User.find({
        $or: [
          { role: 'admin' },
          { isSuperAdmin: true }
        ],
        active: true
      }).select('name email').lean();

      if (admins && admins.length > 0) {
        const employee: IUser = await User.findById(new Types.ObjectId(leave.userId)).select('name email');
        const approver: IUser = await User.findById((leave.approvedBy?._id)).select('name email');

        const fromDateFormatted = leave.startDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const toDateFormatted = leave.endDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        const adminEmails = admins.map(admin => admin.email).filter(Boolean);

        if (adminEmails.length > 0) {
          // For restricted_holiday, use "holiday" terminology instead of "leave"
          const isRestrictedHoliday = leave.leaveType === 'restricted_holiday';
          const requestType = isRestrictedHoliday ? 'holiday' : 'leave';
          const requestTypeCapitalized = isRestrictedHoliday ? 'Holiday' : 'Leave';

          const adminEmailText = `Dear Admin,

A ${requestType} request has been ${leave.status.toLowerCase()} by ${approver?.name || 'Manager'}.

Request Details:
- Employee: ${employee?.name || 'N/A'} (${employee?.email || 'N/A'})
- ${requestTypeCapitalized} Type: ${leave.leaveType}
- From Date: ${fromDateFormatted}
- To Date: ${toDateFormatted}
- Total Days: ${leave.noOfDays}
- Reason: ${leave.reason || 'N/A'}
- Status: ${leave.status}
${leave.remarks ? `- Remarks: ${leave.remarks}` : ''}
- Approved/Rejected By: ${approver?.name || 'Manager'}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `${requestTypeCapitalized} Request ${leave.status} - ${employee?.name || 'Employee'}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for leave request ${leave._id} - Status: ${leave.status}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for leave request:', adminEmailError);
      // Don't fail the request if admin email fails
    }


    // If leave is approved, mark attendance records
    if (updateData.status === 'Approved') {
      const startDate = new Date(leave.startDate);
      const endDate = new Date(leave.endDate);

      // ✅ FIX: Get excluded dates (weekends and holidays) from weekendExclusion
      // Only create attendance records for working days, not weekends/holidays
      const excludedDatesSet = new Set<number>();
      if (leave.weekendExclusion && leave.weekendExclusion.excludedDates) {
        // Create a Set of excluded date timestamps for quick lookup
        leave.weekendExclusion.excludedDates.forEach((excludedDate: Date) => {
          const date = new Date(excludedDate);
          date.setUTCHours(0, 0, 0, 0);
          excludedDatesSet.add(date.getTime());
        });
      }

      // Create/update attendance records for each day of leave (excluding weekends and holidays)
      const currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0);

      while (currentDate <= endDate) {
        // ✅ FIX: Skip weekends and holidays - only create attendance records for working days
        const currentDateTimestamp = currentDate.getTime();
        if (excludedDatesSet.has(currentDateTimestamp)) {
          // This is a weekend or holiday - skip creating attendance record
          console.log(`⏭️ [Leave Approval] Skipping excluded date (weekend/holiday): ${currentDate.toISOString().split('T')[0]}`);
          currentDate.setDate(currentDate.getDate() + 1);
          currentDate.setUTCHours(0, 0, 0, 0); // Normalize time for consistent comparison
          continue;
        }

        // Find existing record to check for swipes
        const existingRecord = await AttendanceRecord.findOne({
          userId: leave.userId,
          shiftDay: currentDate,
        });

        const hasSwipes = existingRecord && existingRecord.swipes && existingRecord.swipes.length > 0;
        const isRestrictedHoliday = leave.leaveType === 'restricted_holiday';

        let updateFields: any = {
          updatedAt: new Date(),
          updatedBy: updateData.approvedById
        };

        if (isRestrictedHoliday && hasSwipes) {
          updateFields.status = 'holiday_swipe';
          updateFields.attendanceStatus = ['Holiday-Swipe'];

          // Initialize or update regularization for holiday swipe
          if (!existingRecord.regularization) {
            updateFields.regularization = {
              isRegularized: true,
              hasRegularizationRequest: false,
              regularizationType: ['Holiday-Swipe'],
              status: 'Approved',
              regularizationId: new Types.ObjectId(),
            };
          } else {
            // Create a safe copy of the regularization object
            const reg = JSON.parse(JSON.stringify(existingRecord.regularization));
            reg.isRegularized = true;

            const regTypes = reg.regularizationType || [];
            if (!regTypes.includes('Holiday-Swipe')) {
              regTypes.push('Holiday-Swipe');
            }
            reg.regularizationType = regTypes;
            reg.status = 'Approved';
            updateFields.regularization = reg;
          }
        } else if (leave.leaveType && (leave.leaveType.toLowerCase() === 'wfh' || leave.leaveType.toLowerCase() === 'work from home' || leave.leaveType.toLowerCase() === 'work_from_home' || leave.leaveType.toLowerCase() === 'work-from-home')) {
          // Work From Home Logic
          updateFields.isWFH = true;
          // WFH counts as Present, not On-Leave
          // We check if there are existing statuses to preserve
          updateFields.attendanceStatus = ['Present'];

          // If half-day WFH (rare but possible)
          if (leave.leaveDuration === 'half-day' && leave.halfDayType) {
            updateFields.halfType = leave.halfDayType === 'first-half' ? 'First Half' : 'Second Half';
            // You might want to handle 'Half Day' status here if needed, but usually WFH is treated as full presence or handled via half-day flags
          }
        } else {
          // All other leave cases (Regular leaves or Restricted Holiday without swipes)

          // India-specific: Handle half-day leave type
          if (leave.leaveDuration === 'half-day' && leave.halfDayType) {
            // ✅ halfType is SET ONLY for half-day leaves
            updateFields.halfType = leave.halfDayType === 'first-half' ? 'First Half' : 'Second Half';

            // For half-day leave: Check if employee has swipes (worked the other half)
            // If swipes exist, add both 'On-Leave' and 'Present' to attendanceStatus
            if (hasSwipes && existingRecord) {
              // Employee worked one half and took leave for the other half
              const currentStatus = existingRecord.attendanceStatus || [];
              updateFields.attendanceStatus = [...currentStatus];

              // Add 'On-Leave' if not already present
              if (!updateFields.attendanceStatus.includes('On-Leave')) {
                updateFields.attendanceStatus.push('On-Leave');
              }

              // Add 'Present' if not already present (employee worked the other half)
              if (!updateFields.attendanceStatus.includes('Present')) {
                updateFields.attendanceStatus.push('Present');
              }

              // Preserve other statuses like 'Late', 'Early-Exit', etc.
            } else {
              // No swipes - full half-day leave only
              // ✅ halfType is still set (line 1684) even with no swipes
              updateFields.attendanceStatus = ['On-Leave'];
            }
          } else {
            // Full-day leave
            // ✅ halfType is NOT set for full-day leaves (only set inside the if block above)
            updateFields.attendanceStatus = ['On-Leave'];
          }
        }

        await AttendanceRecord.findOneAndUpdate(
          {
            userId: leave.userId,
            shiftDay: currentDate,
          },
          {
            $set: updateFields
          },
          { upsert: true, strict: false }
        );

        // Move to next day and normalize time for consistent comparison
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setUTCHours(0, 0, 0, 0);
      }
    }

    if (updateData.status === 'Rejected' || updateData.status === 'Cancelled') {
      console.log("3, rejected or cancelled");
      const startDate = new Date(leave.startDate);
      const endDate = new Date(leave.endDate);

      // Iterate through each day of the leave period
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        console.log(leave.userId);
        console.log(leave, 'leave updated ==>> ');

        // Find existing attendance record to check for swipes
        const existingRecord = await AttendanceRecord.findOne({
          userId: leave.userId,
          shiftDay: currentDate,
          leaveRequestId: leave._id,
        });

        const hasSwipes = existingRecord && existingRecord.swipes && existingRecord.swipes.length > 0;
        const isHalfDayLeave = leave.leaveDuration === 'half-day';

        let attendanceStatusUpdate: string[];

        if (isHalfDayLeave && hasSwipes) {
          // Half-day leave rejected but employee has swipes (worked the other half)
          // Check if employee has leave balance to cover the rejected half-day
          // For now, if rejected and no balance, it's 0.5 days LOP (Absent)
          // If has balance, we could potentially auto-apply, but that's complex
          // So for rejection: If swipes exist, preserve Present status but mark as Absent for the rejected half
          // This indicates: worked one half, but rejected half = 0.5 LOP
          const currentStatus = existingRecord.attendanceStatus || [];
          attendanceStatusUpdate = [...currentStatus];

          // Remove 'On-Leave' if present
          attendanceStatusUpdate = attendanceStatusUpdate.filter(s => s !== 'On-Leave');

          // Add 'Absent' to indicate the rejected half-day (0.5 LOP)
          if (!attendanceStatusUpdate.includes('Absent')) {
            attendanceStatusUpdate.push('Absent');
          }

          // Keep 'Present' if it exists (employee worked the other half)
          // This allows payroll to calculate: 0.5 Present + 0.5 Absent (LOP)
        } else {
          // Full-day leave rejected or half-day with no swipes
          attendanceStatusUpdate = ["Absent"];
        }

        // Revert attendance records for the leave period
        let resatten = await AttendanceRecord.findOneAndUpdate(
          {
            userId: leave.userId,
            shiftDay: currentDate,
            leaveRequestId: leave._id,
          },
          {
            $set: {
              attendanceStatus: attendanceStatusUpdate,
              updatedAt: new Date(),
              updatedBy: updateData.rejectedById || updateData.approvedById,
              // Clear halfType if it was set
              ...(isHalfDayLeave ? { halfType: undefined } : {}),
            },
            $unset: {
              leaveRequestId: '',
            },
          },
          { strict: false }
        );

        console.log(resatten, 'resatten');
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Decrease leave balance and remove leaveRequestId from leave summary
      // This reverses the effect of creating the leave request
      // The balance was increased when the leave was created (even if Pending),
      // so we need to decrease it when rejected/cancelled
      // NOTE: This is ONLY called for Rejected/Cancelled, NOT for Approved
      try {
        await this.leaveSummaryService.decreaseLeaveBalance(
          leave.userId as Types.ObjectId,
          startDate.getFullYear(),
          leave.leaveType || '',
          leave.noOfDays as number,
          leave._id as Types.ObjectId
        );
        console.log(`✅ [Leave ${updateData.status}] Decreased leave balance by ${leave.noOfDays} days for leave ${leave._id}`);
      } catch (error: any) {
        console.error(`❌ [Leave ${updateData.status}] Failed to update leave summary: ${error.message}`);
        // Continue even if summary update fails
      }

      // Optionally log the rejection/cancellation event
      console.log(`Leave request ${leave._id} ${updateData.status.toLowerCase()} by user ${updateData.rejectedById || updateData.approvedById}`);
    }

    // NOTE: When status is 'Approved', we do NOT call decreaseLeaveBalance
    // because the balance was already increased when the leave was created,
    // and we want to keep it that way for approved leaves


    return this.findById(id);
  }

  async cancel(id: string | Types.ObjectId, userId: Types.ObjectId): Promise<{ message: string }> {
    const leave = await Leave.findOne({
      _id: id,
      userId,
    });

    if (!leave) {
      throw new Error('Leave request not found');
    }

    if (leave.status !== 'Pending') {
      throw new Error('Cannot cancel processed leave request');
    }

    // Decrease leave balance and remove leaveRequestId from leave summary
    // This reverses the effect of creating the leave request
    try {
      await this.leaveSummaryService.decreaseLeaveBalance(
        leave.userId as Types.ObjectId,
        new Date(leave.startDate).getFullYear(),
        leave.leaveType || '',
        leave.noOfDays as number,
        leave._id as Types.ObjectId
      );
      console.log(`✅ [Leave Cancel] Decreased leave balance by ${leave.noOfDays} days for leave ${leave._id}`);
    } catch (error: any) {
      console.error(`❌ [Leave Cancel] Failed to update leave summary: ${error.message}`);
      // Continue with deletion even if summary update fails
    }

    await leave.deleteOne();
    return { message: 'Leave request cancelled successfully' };
  }

  async getLeaveBalance(userId: Types.ObjectId, leaveTypeId: Types.ObjectId | string): Promise<{
    total: number;
    used: number;
    remaining: number;
  }> {
    // This is a placeholder for leave balance calculation
    // In a real application, this would involve more complex logic
    const approvedLeaves = await Leave.countDocuments({
      userId,
      leaveTypeId,
      status: 'Approved',
      startDate: {
        $gte: new Date(new Date().getFullYear(), 0, 1),
      },
    });

    return {
      total: 20, // This should come from configuration
      used: approvedLeaves,
      remaining: 20 - approvedLeaves,
    };
  }

  // Service method
  async getLeavesByAppliedTo(query: ILeaveQuery): Promise<{
    data: ILeave[],
    meta: {
      page: number,
      limit: number,
      total: number,
      totalPages: number
    }
  }> {
    console.log(query, "2, query")
    const { appliedTo, userId, status, startDate, endDate, page = 1, limit = 5, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = { 'appliedTo._id': appliedTo }; // Initialize filter with appliedTo

    if (userId) filter.userId = userId;
    if (status) filter.status = status; // Only filter by status if explicitly provided
    if (startDate || endDate) {
      filter.$or = [
        {
          startDate: {
            ...(startDate && { $gte: startDate }),
            ...(endDate && { $lte: endDate }),
          },
        },
        {
          endDate: {
            ...(startDate && { $gte: startDate }),
            ...(endDate && { $lte: endDate }),
          },
        },
      ];
    }

    // Handle search filter
    if (search) {
      // Escape special regex characters in search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Search in document fields (user.name, user.email, user.employeeCode, leaveType, reason, status)
      const searchConditions: any[] = [
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { 'user.email': { $regex: escapedSearch, $options: 'i' } },
        { leaveType: { $regex: escapedSearch, $options: 'i' } },
        { reason: { $regex: escapedSearch, $options: 'i' } },
        { status: { $regex: escapedSearch, $options: 'i' } },
      ];

      // Search in User collection to find matching users
      const userSearchFilter: any = {
        $or: [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } },
        ]
      };

      // If userId is already filtered, combine with user search
      if (userId) {
        userSearchFilter._id = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
      }

      const matchingUsers = await User.find(userSearchFilter).select('_id').lean();

      // If users found, add userId filter
      if (matchingUsers.length > 0) {
        const userIds = matchingUsers.map(u => u._id);
        searchConditions.push({ userId: { $in: userIds } });
      }

      // If there's already a $or for dates, we need to combine them properly
      if (filter.$or) {
        // We need to use $and to combine date filter with search filter
        filter.$and = [
          { $or: filter.$or },
          { $or: searchConditions }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    console.log('Filter:', filter);

    const [leaves, total] = await Promise.all([
      Leave.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Leave.countDocuments(filter),
    ]);
    console.log(leaves, "2. leaves")
    // Populate all references in parallel for better performance
    const populatedLeaves = await Promise.all(
      leaves.map(async (leave) => {
        const [user, approver] = await Promise.all([
          User.findById(leave.userId).select('name email'),
          leave.approvedById ? User.findById(leave.approvedById).select('name email') : null,
        ]);

        if (user) {
          leave.user = {
            name: user.name,
            email: user.email,
          };
        }

        if (approver) {
          leave.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        // Ensure appliedOnBehalf fields are always present (for consistency with WFH)
        if (leave.appliedOnBehalf === undefined) {
          leave.appliedOnBehalf = false;
        }
        if (leave.managerApproved === undefined) {
          leave.managerApproved = false;
        }
        if (leave.adminApproved === undefined) {
          leave.adminApproved = false;
        }

        return leave;
      })
    );

    console.log(populatedLeaves, "3. populatedLeaves")
    return {
      data: populatedLeaves,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  };

}
