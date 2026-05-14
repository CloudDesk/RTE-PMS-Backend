import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { IUser, User } from '../models';
import { FilterQuery, Types } from 'mongoose';
import { IWFH, WFH } from '../models/wfh.model';
import { LeaveSummaryService } from './leave-summary.service';
import { generateEmailTemplate } from '../emails/templates';
import { emailService } from './email.service';
import { calculateBusinessDays } from '../utilis/dates';
import { ShiftAssignment, IShiftAssignment } from '../models/shift.model';
import { HolidayCalendar } from '../models/holiday-calendar.model';

export interface IWFHCreate {
  userId: string | Types.ObjectId;
  startDate: Date;
  endDate: Date;
  noOfDays?: number;
  remarks?: string;
  reason?: string; // Optional field
  appliedTo?: {
    _id: string;
    name: string;
  };
  // Weekend and holiday exclusion – calculated by backend, never trusted from frontend
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

export interface IWFHQuery {
  userId?: string | Types.ObjectId;
  status?: 'Pending' | 'Approved' | 'Rejected';
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
  sortBy?: keyof IWFH;
  search?: string;
  appliedTo?: string;
}

export interface IWFHStatusUpdate {
  status: 'Approved' | 'Rejected' | 'Cancelled';
  remarks?: string;
  approvedById: Types.ObjectId;
  approvedBy?: {
    _id: string | Types.ObjectId;
    name: string;
    email: string;
  };
}

export class WFHService extends BaseService {
  private leaveSummaryService: LeaveSummaryService;

  constructor(context: RequestContext) {
    super(context);
    this.leaveSummaryService = new LeaveSummaryService(context);
  }

  // ─── Weekend / Holiday helpers (mirrors LeaveService) ────────────────────

  /**
   * Get active shift assignment for a user within a date range.
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

    return ShiftAssignment.findOne({
      userId,
      isActive: true,
      startDate: { $lte: endDateOnly },
      $or: [
        { endDate: { $gte: startDateOnly } },
        { endDate: null },
      ],
    }).sort({ startDate: -1 });
  }

  /**
   * Calculate total inclusive calendar days between startDate and endDate.
   */
  private calculateTotalCalendarDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
  }

  /**
   * Fetch mandatory holidays from the user's assigned HolidayCalendar
   * that fall within [startDate, endDate].
   * Optional / restricted holidays are NOT excluded from WFH days.
   */
  private async getMandatoryHolidays(
    userId: Types.ObjectId,
    startDate: Date,
    endDate: Date
  ): Promise<Date[]> {
    const user = await User.findById(userId)
      .select('holidayCalendarId holidayCalendarHistory')
      .lean();
    if (!user) return [];

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
    const startTime = start.getTime();
    const endTime = end.getTime();
    const year = new Date(startDate).getFullYear();

    // Resolve calendar: year-specific history first, then default
    let calendarId: Types.ObjectId | undefined;
    const history = (user as any).holidayCalendarHistory;
    if (history && Array.isArray(history)) {
      const entry = history.find((e: any) => e.year === year && e.isActive === true);
      if (entry?.calendarId) calendarId = entry.calendarId;
    }
    if (!calendarId && user.holidayCalendarId) {
      calendarId = new Types.ObjectId(user.holidayCalendarId);
    }
    if (!calendarId) return [];

    const holidayCalendar = await HolidayCalendar.findById(calendarId).lean();
    if (!holidayCalendar?.holidays) return [];

    const mandatoryList: Date[] = [];
    for (const holiday of holidayCalendar.holidays) {
      if (holiday.type === 'mandatory') {
        const d = new Date(holiday.date);
        d.setUTCHours(0, 0, 0, 0);
        const t = d.getTime();
        if (t >= startTime && t <= endTime) mandatoryList.push(d);
      }
    }
    return mandatoryList;
  }

  /**
   * Count working days excluding weekends and mandatory holidays.
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

    const holidayDatesSet = new Set(
      mandatoryHolidays.map(h => {
        const d = new Date(h);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime();
      })
    );

    let workingDays = 0;
    const current = new Date(start);
    while (current <= end) {
      if (!weekendDays.includes(current.getDay()) && !holidayDatesSet.has(current.getTime())) {
        workingDays++;
      }
      current.setDate(current.getDate() + 1);
    }
    return workingDays;
  }

  /**
   * Collect the individual dates that are excluded (weekend dates + mandatory holidays).
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

    const holidayDatesSet = new Set(
      mandatoryHolidays.map(h => {
        const d = new Date(h);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime();
      })
    );

    const excludedDates: Date[] = [];
    const excludedHolidays: Date[] = [];
    const current = new Date(start);

    while (current <= end) {
      const copy = new Date(current);
      if (weekendDays.includes(current.getDay())) {
        excludedDates.push(copy);
      }
      if (holidayDatesSet.has(current.getTime())) {
        excludedDates.push(copy);
        excludedHolidays.push(copy);
      }
      current.setDate(current.getDate() + 1);
    }
    return { excludedDates, excludedHolidays };
  }

  async findById(id: string | Types.ObjectId): Promise<IWFH> {
    const wfh = await WFH.findById(id);
    if (!wfh) {
      throw new Error('WFH request not found');
    }

    const [user, approver] = await Promise.all([
      User.findById(wfh.userId).select('name email'),
      wfh.approvedById ? User.findById(wfh.approvedById).select('name email') : null,
    ]);

    if (user) {
      wfh.user = {
        name: user.name,
        email: user.email,
      };
    }

    if (approver) {
      wfh.approvedBy = {
        _id: approver._id,
        name: approver.name,
        email: approver.email,
      };
    }

    return wfh;
  }

  async findAll(query: {
    userId?: string | Types.ObjectId;
    status?: string;
    startDate?: string;
    endDate?: string;
    appliedTo?: string; // Manager ID to filter by
    page?: number;
    limit?: number;
    search?: string; // Search in user name, reason, manager name, or status
  }): Promise<{ wfhs: IWFH[]; total: number; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const { userId, status, startDate, endDate, appliedTo, page = 1, limit = 10, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    // ✅ FIX: Convert userId string to ObjectId for proper MongoDB query
    if (userId) {
      filter.userId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    }
    if (status) filter.status = status;
    // ✅ FIX: appliedTo._id is stored as String in the model, so use it as string
    if (appliedTo) {
      filter['appliedTo._id'] = appliedTo;
    }

    // Search filter - search in user name, email, reason, remarks, and status
    // Since user data is populated after query, we need to search users first
    if (search) {
      // Escape special regex characters in search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Search in reason, remarks, status, user name and email (stored in document)
      const searchFilter: any[] = [
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { 'user.email': { $regex: escapedSearch, $options: 'i' } },
        { 'reason': { $regex: escapedSearch, $options: 'i' } },
        { 'remarks': { $regex: escapedSearch, $options: 'i' } },
        { 'status': { $regex: escapedSearch, $options: 'i' } },
      ];

      // Also search in user collection to find matching users
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
        searchFilter.push({ userId: { $in: userIds } });
      }

      // Combine search with existing filters using $and
      const existingFilters = { ...filter };
      filter.$and = [
        existingFilters,
        { $or: searchFilter }
      ];
    }

    if (startDate || endDate) {
      const dateFilter: any = {
        $and: [
          ...(endDate ? [{ startDate: { $lte: new Date(endDate) } }] : []),
          ...(startDate ? [{ endDate: { $gte: new Date(startDate) } }] : []),
        ],
      };

      // Combine date filter with existing filters
      if (filter.$and) {
        // If search is present, add date filter to $and array
        filter.$and.push(dateFilter);
      } else {
        // If no search, use $and to combine base filters with date filter
        const existingFilters = { ...filter };
        filter.$and = [
          existingFilters,
          dateFilter
        ];
      }
    }

    const [wfhs, total] = await Promise.all([
      WFH.find(filter as FilterQuery<IWFH>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WFH.countDocuments(filter as FilterQuery<IWFH>),
    ]);

    const populatedWFHs = await Promise.all(
      wfhs.map(async (wfh) => {
        const [user, approver] = await Promise.all([
          User.findById(wfh.userId).select('name email'),
          wfh.approvedById ? User.findById(wfh.approvedById).select('name email') : null,
        ]);

        if (user) {
          wfh.user = {
            name: user.name,
            email: user.email,
          };
        }

        if (approver) {
          wfh.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        return wfh;
      })
    );

    return {
      wfhs: populatedWFHs,
      total,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByUserId(
    userId: string | Types.ObjectId,
    filters: {
      search?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    } = {},
    options: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ wfhs: IWFH[]; total: number }> {
    const { search, status, startDate, endDate } = filters;
    const { page = 1, limit = 10, sortBy = 'startDate', sortOrder = 'desc' } = options;

    const query: any = { userId };
    const skip = (page - 1) * limit;

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { 'user.name': { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      query.$and = [
        ...(endDate ? [{ startDate: { $lte: new Date(endDate) } }] : []),
        ...(startDate ? [{ endDate: { $gte: new Date(startDate) } }] : []),
      ];
    }

    const [wfhs, total] = await Promise.all([
      WFH.find(query as FilterQuery<IWFH>)
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit),
      WFH.countDocuments(query as FilterQuery<IWFH>),
    ]);

    const populatedWFHs = await Promise.all(
      wfhs.map(async (wfh) => {
        const [user, approver] = await Promise.all([
          User.findById(wfh.userId).select('name email'),
          wfh.approvedById ? User.findById(wfh.approvedById).select('name email') : null,
        ]);

        if (user) {
          wfh.user = {
            name: user.name,
            email: user.email,
          };
        }

        if (approver) {
          wfh.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        return wfh;
      })
    );

    return {
      wfhs: populatedWFHs,
      total,
    };
  }

  async create(wfhData: IWFHCreate): Promise<IWFH> {
    // Always strip any weekendExclusion / noOfDays sent from the frontend –
    // they will be computed authoritatively by the backend.
    delete wfhData.weekendExclusion;
    delete wfhData.noOfDays;

    const user = await User.findById(wfhData.userId).select('name email');
    if (!user) {
      throw new Error('User not found');
    }

    // VALIDATION: 3-day rule for employee self-application (excluding weekends)
    const currentUser = this.context?.user;
    const isAdmin = currentUser && (currentUser.role === 'admin' || (currentUser as any).isSuperAdmin);
    const isApplyingForSelf = currentUser && currentUser._id.toString() === (typeof wfhData.userId === 'string' ? wfhData.userId : wfhData.userId.toString());

    if (!wfhData.appliedOnBehalf && !isAdmin && isApplyingForSelf) {
      const wfhStartDate = new Date(wfhData.startDate);
      wfhStartDate.setUTCHours(0, 0, 0, 0);

      const today = new Date();
      today.setUTCHours(23, 59, 59, 999);

      const userIdObj = typeof wfhData.userId === 'string'
        ? new Types.ObjectId(wfhData.userId)
        : wfhData.userId;

      const shiftAssignment = await this.getShiftAssignmentForDateRange(
        userIdObj,
        wfhStartDate,
        wfhStartDate
      );

      const weekendDays = shiftAssignment?.weekendDays && shiftAssignment.weekendDays.length > 0
        ? shiftAssignment.weekendDays
        : [0, 6];

      const businessDaysPassed = calculateBusinessDays(wfhStartDate, today, weekendDays);

      if (businessDaysPassed > 3) {
        throw new Error(
          `You cannot apply for WFH after 3 business days have passed. ` +
          `${businessDaysPassed} business days have passed since the WFH date. ` +
          `Please contact your admin to apply on your behalf.`
        );
      }
    }

    // Security check: Only admins can set appliedOnBehalf = true
    if (wfhData.appliedOnBehalf && !isAdmin) {
      throw new Error('Only admins can apply for WFH on behalf of employees. Please use the regular WFH application endpoint.');
    }

    // Set appliedBy
    if (wfhData.appliedOnBehalf && isAdmin && currentUser) {
      wfhData.appliedBy = {
        _id: currentUser._id,
        name: currentUser.name,
        email: currentUser.email || ''
      };
    } else if (!wfhData.appliedOnBehalf && currentUser) {
      wfhData.appliedBy = {
        _id: currentUser._id,
        name: currentUser.name,
        email: currentUser.email || ''
      };
    }

    // ── Weekend & mandatory-holiday exclusion (same logic as LeaveService) ──
    const userIdObj = typeof wfhData.userId === 'string'
      ? new Types.ObjectId(wfhData.userId)
      : wfhData.userId;

    const startDate = new Date(wfhData.startDate);
    const endDate   = new Date(wfhData.endDate);

    // Resolve weekendDays from the user's active ShiftAssignment
    const shiftAssignment = await this.getShiftAssignmentForDateRange(
      userIdObj,
      startDate,
      endDate
    );
    const weekendDays = shiftAssignment?.weekendDays && shiftAssignment.weekendDays.length > 0
      ? shiftAssignment.weekendDays
      : [0, 6]; // Default: Sunday (0) and Saturday (6)

    // Fetch mandatory holidays only (optional holidays do NOT block WFH days)
    const mandatoryHolidays = await this.getMandatoryHolidays(
      userIdObj,
      startDate,
      endDate
    );

    // Count actual working days after exclusions
    const workingDays = this.calculateWorkingDaysExcludingWeekendsAndHolidays(
      startDate,
      endDate,
      weekendDays,
      mandatoryHolidays
    );

    if (workingDays <= 0) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const weekendNames = weekendDays.map(d => dayNames[d]).join(', ');
      const holidayText = mandatoryHolidays.length > 0
        ? ` and ${mandatoryHolidays.length} mandatory holiday(s)`
        : '';
      throw new Error(
        `All days in the requested WFH date range fall on weekends (${weekendNames})${holidayText}. ` +
        `Please select dates that include at least one working day.`
      );
    }

    // Collect excluded dates for storage in weekendExclusion
    const { excludedDates, excludedHolidays } = this.getExcludedDatesWithHolidays(
      startDate,
      endDate,
      weekendDays,
      mandatoryHolidays
    );
    const totalCalendarDays = this.calculateTotalCalendarDays(startDate, endDate);

    // Store computed exclusion metadata and set noOfDays
    wfhData.weekendExclusion = {
      weekendDays,
      excludedDates,
      excludedHolidays,
      totalCalendarDays,
      actualDays: workingDays,
    };
    wfhData.noOfDays = workingDays;

    console.log(
      `✅ [WFH Weekend & Holiday Exclusion] ${workingDays} working day(s) ` +
      `(excluded weekends: [${weekendDays.join(', ')}], mandatory holidays: ${mandatoryHolidays.length}) ` +
      `for ${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]}`
    );

    // ── daysDiff is now workingDays (used for balance check below) ──
    const daysDiff = workingDays;

    // Check for overlapping WFH requests
    const overlappingWFH = await WFH.findOne({
      userId: wfhData.userId,
      status: { $nin: ['Rejected', 'Cancelled'] },
      $or: [
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        },
      ],
    });

    if (overlappingWFH) {
      throw new Error('WFH dates overlap with existing WFH request');
    }

    const year = startDate.getFullYear();

    // Get WFH balance for the year (from LeaveSummary workFromHome category)
    const leaveSummary = await this.leaveSummaryService.getLeaveSummary(
      new Types.ObjectId(wfhData.userId.toString()),
      year
    );
    const balance = {
      alloted: leaveSummary.workFromHome?.alloted || 0,
      availed: leaveSummary.workFromHome?.availed || 0,
      remaining: leaveSummary.workFromHome?.remaining || 0,
    };

    // Calculate total days used this year (only approved WFH)
    const totalUsedThisYear = await this.getTotalDaysUsedInYear(
      new Types.ObjectId(wfhData.userId.toString()),
      year
    );

    // Calculate pending days for the same year (excluding rejected and cancelled)
    const pendingDays = await this.getPendingDaysInYear(
      new Types.ObjectId(wfhData.userId.toString()),
      year
    );

    // Balance validation logic:
    // - If alloted = 0: No restriction (unlimited)
    // - If alloted > 0: Validate that requested days + availed + pending <= alloted
    if (balance.alloted > 0) {
      const requestedDays = daysDiff;
      const availableDays = balance.alloted - totalUsedThisYear - pendingDays;

      // Check if requested days exceed remaining balance
      if (requestedDays > availableDays) {
        throw new Error(
          `Insufficient WFH balance. ` +
          `Allocated: ${balance.alloted} days, ` +
          `Availed: ${totalUsedThisYear} days, ` +
          `Pending: ${pendingDays} days, ` +
          `Available: ${availableDays} days. ` +
          `Requested: ${requestedDays} days exceeds available balance.`
        );
      }
    }
    // If alloted = 0, allow unlimited (no validation needed)

    const wfh: IWFH = await WFH.create(wfhData);

    // Track WFH request (don't deduct yet - will deduct on approval)
    await this.leaveSummaryService.createOrUpdateLeaveSummary(
      new Types.ObjectId(wfh.userId.toString()),
      year,
      'workFromHome',
      'Pending',
      {
        leaveRequestId: wfh._id as Types.ObjectId,
      }
    );

    // Send email to manager (only if appliedTo._id is valid)
    let manager: IUser | null = null;
    if (wfh.appliedTo?._id && wfh.appliedTo._id.trim() !== '' && Types.ObjectId.isValid(wfh.appliedTo._id)) {
      manager = await User.findById(
        new Types.ObjectId(wfh.appliedTo._id)
      ).select('name email').lean();
    }

    if (manager) {
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const htmlContent = generateEmailTemplate('leaveApplyEmail', {
        managerName: manager.name,
        employeeName: user.name,
        leaveType: 'Work From Home',
        fromDate: wfh.startDate.toDateString(),
        toDate: wfh.endDate.toDateString(),
        totalDays: wfh.noOfDays,
        reason: wfh.reason,
        approvalLink: `${appUrl}/manager/actions/wfh/${wfh._id}`,
        companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
        appliedOnBehalf: wfh.appliedOnBehalf || false,
        appliedByName: wfh.appliedBy?.name || '',
      });

      await emailService.sendEmail({
        body: {
          to: manager.email,
          subject: `WFH Request from ${user.name}`,
          text: `${user.name} has requested WFH from ${wfh.startDate.toDateString()} to ${wfh.endDate.toDateString()} (${wfh.noOfDays} days).`,
          html: htmlContent,
        },
      });
    }

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

        if (adminEmails.length > 0 && user) {
          const fromDateFormatted = wfh.startDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          const toDateFormatted = wfh.endDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });

          const appliedOnBehalfText = wfh.appliedOnBehalf
            ? `\n- Applied On Behalf: Yes (Applied by: ${wfh.appliedBy?.name || 'Admin'})`
            : '';

          const adminEmailText = `Dear Admin,

A Work From Home (WFH) request has been submitted${wfh.appliedOnBehalf ? ' on behalf of' : ' by'} ${user.name}.

Request Details:
- Employee: ${user.name} (${user.email || 'N/A'})
- From Date: ${fromDateFormatted}
- To Date: ${toDateFormatted}
- Total Days: ${wfh.noOfDays}
- Reason: ${wfh.reason || 'N/A'}
- Status: Pending${wfh.appliedOnBehalf ? ' (Can be approved by Manager or Admin)' : ''}${appliedOnBehalfText}
- Manager: ${manager?.name || 'N/A'}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `WFH Request Submitted - ${user.name}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for WFH request ${wfh._id}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for WFH request:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    return this.findById(wfh._id as string);
  }

  async updateStatus(id: string | Types.ObjectId, updateData: IWFHStatusUpdate): Promise<IWFH> {
    const wfh = await WFH.findById(id);
    if (!wfh) {
      throw new Error('WFH request not found');
    }

    if (wfh.status !== 'Pending') {
      throw new Error('WFH request has already been processed');
    }

    const currentUser = this.context?.user;
    const isAdmin = currentUser && (currentUser.role === 'admin' || (currentUser as any).isSuperAdmin);
    const isManager = currentUser && wfh.appliedTo?._id === currentUser._id.toString();

    // Handle dual approval for applied on behalf
    if (wfh.appliedOnBehalf) {
      // If rejected, reject immediately
      if (updateData.status === 'Rejected') {
        wfh.status = 'Rejected';
        wfh.approvedById = updateData.approvedById;
        wfh.approvedBy = updateData.approvedBy
          ? {
            _id: typeof updateData.approvedBy._id === 'string'
              ? updateData.approvedBy._id
              : updateData.approvedBy._id.toString(),
            name: updateData.approvedBy.name,
            email: updateData.approvedBy.email,
          }
          : undefined;
        wfh.rejectedAt = new Date();
        if (updateData.remarks) wfh.remarks = updateData.remarks;

        // Set who rejected (manager or admin)
        if (isManager) {
          wfh.managerApproved = false;
          wfh.managerApprovedById = updateData.approvedById;
          wfh.managerApprovedAt = new Date();
        } else if (isAdmin) {
          wfh.adminApproved = false;
          wfh.adminApprovedById = updateData.approvedById;
          wfh.adminApprovedAt = new Date();
        }
      } else if (updateData.status === 'Approved') {
        // For approval, either manager OR admin can approve (single approval needed)
        if (isManager && !wfh.managerApproved) {
          // Manager approves - immediately approve
          wfh.managerApproved = true;
          wfh.managerApprovedById = updateData.approvedById;
          wfh.managerApprovedAt = new Date();
          wfh.status = 'Approved';
          wfh.approvedById = updateData.approvedById;
          wfh.approvedBy = updateData.approvedBy
            ? {
              _id: typeof updateData.approvedBy._id === 'string'
                ? updateData.approvedBy._id
                : updateData.approvedBy._id.toString(),
              name: updateData.approvedBy.name,
              email: updateData.approvedBy.email,
            }
            : undefined;
          wfh.approvedAt = new Date();
        } else if (isAdmin && !wfh.adminApproved) {
          // Admin approves - immediately approve
          wfh.adminApproved = true;
          wfh.adminApprovedById = updateData.approvedById;
          wfh.adminApprovedAt = new Date();
          wfh.status = 'Approved';
          wfh.approvedById = updateData.approvedById;
          wfh.approvedBy = updateData.approvedBy
            ? {
              _id: typeof updateData.approvedBy._id === 'string'
                ? updateData.approvedBy._id
                : updateData.approvedBy._id.toString(),
              name: updateData.approvedBy.name,
              email: updateData.approvedBy.email,
            }
            : undefined;
          wfh.approvedAt = new Date();
        } else {
          throw new Error('You have already approved this WFH request');
        }
      }
    } else {
      // Normal approval flow (not applied on behalf)
      wfh.status = updateData.status;
      wfh.approvedById = updateData.approvedById;
      wfh.approvedBy = updateData.approvedBy
        ? {
          _id: typeof updateData.approvedBy._id === 'string'
            ? updateData.approvedBy._id
            : updateData.approvedBy._id.toString(),
          name: updateData.approvedBy.name,
          email: updateData.approvedBy.email,
        }
        : undefined;

      if (updateData.status === 'Approved') {
        wfh.approvedAt = new Date();
      } else if (updateData.status === 'Rejected') {
        wfh.rejectedAt = new Date();
      } else if (updateData.status === 'Cancelled') {
        wfh.cancelledAt = new Date();
      }
    }

    if (updateData.remarks) wfh.remarks = updateData.remarks;
    await wfh.save();

    // Update WFH summary based on status change (using LeaveSummary workFromHome category)
    const year = new Date(wfh.startDate).getFullYear();
    const totalUsedThisYear = await this.getTotalDaysUsedInYear(
      new Types.ObjectId(wfh.userId.toString()),
      year
    );

    // Update summary only if status actually changed (not when manager approves first for applied on behalf)
    if (wfh.status === 'Approved' || wfh.status === 'Rejected' || wfh.status === 'Cancelled') {
      await this.leaveSummaryService.createOrUpdateLeaveSummary(
        new Types.ObjectId(wfh.userId.toString()),
        year,
        'workFromHome',
        wfh.status,
        {
          availed: totalUsedThisYear,
          leaveRequestId: wfh._id as Types.ObjectId,
        }
      );
    }

    // Send email notification to employee (the person who applied)
    // Only send email if status is 'Approved' or 'Rejected'
    // For applied on behalf: Either manager or admin can approve, and email is sent immediately
    const shouldSendEmail = wfh.status === 'Approved' || wfh.status === 'Rejected';

    if (shouldSendEmail) {
      try {
        const employee: IUser = await User.findById(new Types.ObjectId(wfh.userId)).select('name email');
        // For applied on behalf, get the approver (manager or admin who approved)
        // For rejected, get who rejected
        // For normal approval, get the approver
        let approver: IUser | null = null;
        if (wfh.appliedOnBehalf && wfh.status === 'Approved') {
          // Get who approved (manager or admin - either can approve)
          approver = wfh.adminApprovedById
            ? (await User.findById(wfh.adminApprovedById).select('name email')) as IUser | null
            : wfh.managerApprovedById
              ? (await User.findById(wfh.managerApprovedById).select('name email')) as IUser | null
              : null;
        } else if (wfh.appliedOnBehalf && wfh.status === 'Rejected') {
          // Get who rejected (manager or admin)
          approver = wfh.approvedById ? (await User.findById(wfh.approvedById).select('name email')) as IUser | null : null;
        } else {
          // Normal approval/rejection
          approver = wfh.approvedById ? (await User.findById(wfh.approvedById).select('name email')) as IUser | null : null;
        }

        if (employee && employee.email) {
          const fromDateFormatted = wfh.startDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          const toDateFormatted = wfh.endDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });

          const htmlContent = generateEmailTemplate('leaveApprovalEmail', {
            employeeName: employee.name,
            approverName: approver?.name || 'Manager',
            leaveType: 'Work From Home',
            fromDate: fromDateFormatted,
            toDate: toDateFormatted,
            totalDays: wfh.noOfDays,
            remarks: wfh.remarks || '',
            status: wfh.status,
            companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
            appliedOnBehalf: wfh.appliedOnBehalf || false,
            appliedByName: wfh.appliedBy?.name || '',
          });

          const appliedByText = wfh.appliedOnBehalf && wfh.appliedBy?.name
            ? `\n- Applied By: ${wfh.appliedBy.name} (on behalf)`
            : '';

          const emailText = `Dear ${employee.name},

Your Work From Home (WFH) request has been ${wfh.status.toLowerCase()} by ${approver?.name || 'Manager'}.
${wfh.appliedOnBehalf && wfh.appliedBy?.name ? `\nNote: This request was applied on your behalf by ${wfh.appliedBy.name}.` : ''}

WFH Details:
- From Date: ${fromDateFormatted}
- To Date: ${toDateFormatted}
- Total Days: ${wfh.noOfDays}
- Reason: ${wfh.reason || 'N/A'}${appliedByText}
- Approved By: ${approver?.name || 'Manager'}
${wfh.remarks ? `- Remarks: ${wfh.remarks}` : ''}

${wfh.status === 'Approved'
              ? 'Your WFH request has been approved. Please ensure you have a proper workspace setup and maintain regular communication with your team during the WFH period.'
              : 'Unfortunately, your WFH request has been rejected. If you have any questions, please contact your manager.'}

Thank you for your understanding.

Regards,
${approver?.name || 'Manager'}
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: employee.email,
              subject: `Your WFH Request has been ${wfh.status}`,
              text: emailText,
              html: htmlContent,
            },
          });

          console.log(`Email notification sent to ${employee.email} for WFH request ${wfh._id} - Status: ${wfh.status}`);
        } else {
          console.warn(`Cannot send email: Employee not found or email missing for userId: ${wfh.userId}`);
        }
      } catch (emailError) {
        console.error('Failed to send email to employee for WFH request:', emailError);
        // Don't fail the request if email fails - log the error but continue
      }
    } else {
      // Manager approved first (for applied on behalf) - don't send email yet, wait for admin approval
      console.log(`Manager approved WFH ${wfh._id} (applied on behalf). Waiting for admin approval before sending email.`);
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
        const employee: IUser = await User.findById(new Types.ObjectId(wfh.userId)).select('name email');
        const approver: IUser = await User.findById(wfh.approvedById).select('name email');

        const fromDateFormatted = wfh.startDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const toDateFormatted = wfh.endDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        const adminEmails = admins.map(admin => admin.email).filter(Boolean);

        if (adminEmails.length > 0) {
          const adminEmailText = `Dear Admin,

A Work From Home (WFH) request has been ${wfh.status.toLowerCase()} by ${approver?.name || 'Manager'}.

Request Details:
- Employee: ${employee?.name || 'N/A'} (${employee?.email || 'N/A'})
- From Date: ${fromDateFormatted}
- To Date: ${toDateFormatted}
- Total Days: ${wfh.noOfDays}
- Reason: ${wfh.reason || 'N/A'}
- Status: ${wfh.status}
${wfh.remarks ? `- Remarks: ${wfh.remarks}` : ''}
- Approved/Rejected By: ${approver?.name || 'Manager'}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `WFH Request ${wfh.status} - ${employee?.name || 'Employee'}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for WFH request ${wfh._id} - Status: ${wfh.status}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for WFH request:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    return this.findById(wfh._id as string);
  }

  async cancel(id: string | Types.ObjectId, userId: Types.ObjectId): Promise<{ message: string }> {
    const wfh = await WFH.findById(id);
    if (!wfh) {
      throw new Error('WFH request not found');
    }

    if (wfh.userId.toString() !== userId.toString()) {
      throw new Error('You can only cancel your own WFH requests');
    }

    if (wfh.status !== 'Pending') {
      throw new Error('Only pending WFH requests can be cancelled');
    }

    wfh.status = 'Cancelled';
    wfh.cancelledAt = new Date();
    await wfh.save();

    // Update summary (using LeaveSummary workFromHome category)
    const year = new Date(wfh.startDate).getFullYear();
    const totalUsedThisYear = await this.getTotalDaysUsedInYear(
      new Types.ObjectId(wfh.userId.toString()),
      year
    );

    await this.leaveSummaryService.createOrUpdateLeaveSummary(
      new Types.ObjectId(wfh.userId.toString()),
      year,
      'workFromHome',
      'Cancelled',
      {
        availed: totalUsedThisYear,
        leaveRequestId: wfh._id as Types.ObjectId,
      }
    );

    return { message: 'WFH request cancelled successfully' };
  }

  async getWFHBalance(userId: Types.ObjectId, year: number): Promise<{
    alloted: number;
    availed: number;
    remaining: number;
  }> {
    const leaveSummary = await this.leaveSummaryService.getLeaveSummary(userId, year);
    return {
      alloted: leaveSummary.workFromHome?.alloted || 0,
      availed: leaveSummary.workFromHome?.availed || 0,
      remaining: leaveSummary.workFromHome?.remaining || 0,
    };
  }

  private async getTotalDaysUsedInYear(userId: Types.ObjectId, year: number): Promise<number> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

    const approvedWFHs = await WFH.find({
      userId,
      startDate: { $gte: startDate },
      endDate: { $lte: endDate },
      status: 'Approved',
    });

    return approvedWFHs.reduce((total, wfh) => total + wfh.noOfDays, 0);
  }

  /**
   * Get total pending days for a user in a specific year
   * Excludes Rejected and Cancelled WFH requests
   */
  private async getPendingDaysInYear(
    userId: Types.ObjectId,
    year: number
  ): Promise<number> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);

    const pendingWFHs = await WFH.find({
      userId,
      startDate: { $gte: startDate },
      endDate: { $lte: endDate },
      status: 'Pending',
    });

    return pendingWFHs.reduce((total, wfh) => total + wfh.noOfDays, 0);
  }

  // Service method to get WFH requests by appliedTo
  async getWFHsByAppliedTo(query: IWFHQuery): Promise<{
    data: IWFH[],
    meta: {
      page: number,
      limit: number,
      total: number,
      totalPages: number
    }
  }> {
    const { appliedTo, userId, status, startDate, endDate, page = 1, limit = 5, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = { 'appliedTo._id': appliedTo }; // Initialize filter with appliedTo

    if (userId) {
      filter.userId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    }
    if (status) filter.status = status;

    if (startDate || endDate) {
      const dateFilter: any = {
        $and: [
          ...(endDate ? [{ startDate: { $lte: new Date(endDate) } }] : []),
          ...(startDate ? [{ endDate: { $gte: new Date(startDate) } }] : []),
        ],
      };

      if (filter.$or) {
        filter.$and = [
          { 'appliedTo._id': appliedTo },
          ...(status ? [{ status }] : []),
          ...(userId ? [{ userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId }] : []),
          dateFilter
        ];
        delete filter.$or;
      } else {
        Object.assign(filter, dateFilter);
      }
    }

    // Handle search filter
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const searchConditions: any[] = [
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { 'user.email': { $regex: escapedSearch, $options: 'i' } },
        { reason: { $regex: escapedSearch, $options: 'i' } },
        { remarks: { $regex: escapedSearch, $options: 'i' } },
        { status: { $regex: escapedSearch, $options: 'i' } },
      ];

      const userSearchFilter: any = {
        $or: [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } },
        ]
      };

      if (userId) {
        userSearchFilter._id = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
      }

      const matchingUsers = await User.find(userSearchFilter).select('_id').lean();

      if (matchingUsers.length > 0) {
        const userIds = matchingUsers.map(u => u._id);
        searchConditions.push({ userId: { $in: userIds } });
      }

      // Combine search with existing filters
      if (filter.$or || filter.$and) {
        const existingFilters: any = { 'appliedTo._id': appliedTo };
        if (status) existingFilters.status = status;
        if (userId) {
          existingFilters.userId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
        }

        filter.$and = [
          existingFilters,
          ...(filter.$or ? [filter.$or] : []),
          { $or: searchConditions }
        ];
        delete filter.$or;
        delete filter.status;
        delete filter.userId;
        delete filter['appliedTo._id'];
      } else {
        filter.$or = searchConditions;
      }
    }

    const [wfhs, total] = await Promise.all([
      WFH.find(filter as FilterQuery<IWFH>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WFH.countDocuments(filter as FilterQuery<IWFH>),
    ]);

    const populatedWFHs = await Promise.all(
      wfhs.map(async (wfh) => {
        const [user, approver] = await Promise.all([
          User.findById(wfh.userId).select('name email'),
          wfh.approvedById ? User.findById(wfh.approvedById).select('name email') : null,
        ]);

        if (user) {
          wfh.user = {
            name: user.name,
            email: user.email,
          };
        }

        if (approver) {
          wfh.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        return wfh;
      })
    );

    return {
      data: populatedWFHs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

