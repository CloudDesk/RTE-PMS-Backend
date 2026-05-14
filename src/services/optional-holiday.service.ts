import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { User } from '../models/user.model';
import { HolidayCalendar } from '../models/holiday-calendar.model';
import { AttendanceRecord } from '../models/attendance-record.model';
import { Types } from 'mongoose';
import { IOptionalHolidayRequest, OptionalHolidayRequest } from '../models/optional-holiday-request.model';
import { generateEmailTemplate } from '../emails/templates';
import { emailService } from './email.service';
import { LeaveSummaryService } from './leave-summary.service';

export interface IOptionalHolidayCreate {
  userId: string | Types.ObjectId;
  holidayDate: Date | string;
  holidayName: string;
  reason?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
}

export interface IOptionalHolidayQuery {
  userId?: string | Types.ObjectId;
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  startDate?: Date;
  endDate?: Date;
  year?: number;
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
  sortBy?: keyof IOptionalHolidayRequest;
  search?: string;
  appliedTo?: string;
}

export interface IOptionalHolidayStatusUpdate {
  status: 'Approved' | 'Rejected' | 'Cancelled';
  remarks?: string;
  approvedById: Types.ObjectId;
  approvedBy?: {
    _id: string | Types.ObjectId;
    name: string;
    email: string;
  };
}

export class OptionalHolidayService extends BaseService {
  private leaveSummaryService: LeaveSummaryService;

  constructor(context: RequestContext) {
    super(context);
    this.leaveSummaryService = new LeaveSummaryService(context);
  }

  /**
   * Get the maximum allowed optional holidays for a user in a year
   * Reads from leave-summary.restricted_holiday.alloted, defaults to 0 if not set
   */
  private async getMaxOptionalHolidays(userId: Types.ObjectId, year: number): Promise<number> {
    try {
      const leaveSummary = await this.leaveSummaryService.getLeaveSummary(userId, year);
      // Return allocated count from leave summary, default to 0 if not set
      const allocated = leaveSummary.restricted_holiday?.alloted;
      return allocated !== undefined && allocated !== null ? allocated : 0;
    } catch (error) {
      console.error(`Error getting max optional holidays for user ${userId}, year ${year}:`, error);
      // Fallback to 0 if there's an error
      return 0;
    }
  }

  /**
   * Check if employee has reached annual limit for optional holidays
   */
  async checkAnnualLimit(userId: Types.ObjectId, year: number): Promise<{ canRequest: boolean; used: number; remaining: number; total: number }> {
    const approvedCount = await OptionalHolidayRequest.countDocuments({
      userId: userId,
      year: year,
      status: 'Approved',
    });

    // Get max allowed from leave summary (dynamic per user)
    const maxAllowed = await this.getMaxOptionalHolidays(userId, year);
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
   * Validate that the holiday date is an optional holiday in the calendar
   */
  private async validateOptionalHoliday(userId: Types.ObjectId, holidayDate: Date): Promise<{ isValid: boolean; holidayName?: string; error?: string }> {
    const user = await User.findById(userId).select('holidayCalendarId').lean();
    if (!user) {
      return { isValid: false, error: 'User not found' };
    }
    if (!user.holidayCalendarId) {
      return { isValid: false, error: 'No holiday calendar assigned to your account. Please contact HR.' };
    }

    const calendar = await HolidayCalendar.findById(user.holidayCalendarId).lean();
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

  async findById(id: string | Types.ObjectId): Promise<IOptionalHolidayRequest> {
    const request = await OptionalHolidayRequest.findById(id);
    if (!request) {
      throw new Error('Optional holiday request not found');
    }

    const [user, approver] = await Promise.all([
      User.findById(request.userId).select('name email'),
      request.approvedById ? User.findById(request.approvedById).select('name email') : null,
    ]);

    if (user) {
      request.user = {
        name: user.name,
        email: user.email,
      };
    }

    if (approver) {
      request.approvedBy = {
        _id: approver._id,
        name: approver.name,
        email: approver.email,
      };
    }

    return request;
  }

  async findAll(query: IOptionalHolidayQuery): Promise<{
    requests: IOptionalHolidayRequest[];
    total: number;
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { userId, status, startDate, endDate, year, appliedTo, page = 1, limit = 10, sort = 'desc', sortBy = 'holidayDate', search } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    // ✅ FIX: Convert userId string to ObjectId for proper MongoDB query
    if (userId) {
      filter.userId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    }
    if (status) filter.status = status;
    if (year) filter.year = year;
    // ✅ FIX: appliedTo._id is stored as String in the model, so use it as string
    if (appliedTo) {
      filter['appliedTo._id'] = appliedTo;
    }

    // Search filter - search in holiday name, reason, status, and user name/email
    // Since user data is populated after query, we need to search users first
    if (search) {
      // Escape special regex characters in search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Search in holidayName, reason, status, user name and email (stored in document)
      const searchFilter: any[] = [
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { 'user.email': { $regex: escapedSearch, $options: 'i' } },
        { 'holidayName': { $regex: escapedSearch, $options: 'i' } },
        { 'reason': { $regex: escapedSearch, $options: 'i' } },
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

    // Date range filter - handle separately from search
    if (startDate || endDate) {
      const dateFilter: any = {
        holidayDate: {}
      };
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        dateFilter.holidayDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        dateFilter.holidayDate.$lte = end;
      }

      // Combine date filter with existing filters
      if (filter.$and) {
        filter.$and.push(dateFilter);
      } else {
        Object.assign(filter, dateFilter);
      }
    }

    const sortOrder = sort === 'asc' ? 1 : -1;
    const sortField = sortBy || 'holidayDate';

    const [requests, total] = await Promise.all([
      OptionalHolidayRequest.find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email employeeCode')
        .lean(),
      OptionalHolidayRequest.countDocuments(filter),
    ]);

    return {
      requests: requests as IOptionalHolidayRequest[],
      total,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Service method to get optional holiday requests by appliedTo
  async getOptionalHolidaysByAppliedTo(query: IOptionalHolidayQuery): Promise<{
    data: IOptionalHolidayRequest[],
    meta: {
      page: number,
      limit: number,
      total: number,
      totalPages: number
    }
  }> {
    const { appliedTo, userId, status, startDate, endDate, year, page = 1, limit = 5, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    // appliedTo._id is stored as String in the model
    if (appliedTo) {
      filter['appliedTo._id'] = appliedTo;
    }

    if (userId) {
      filter.userId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    }
    if (status) filter.status = status;
    if (year) filter.year = year;

    if (startDate || endDate) {
      const dateFilter: any = {
        holidayDate: {}
      };
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        dateFilter.holidayDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        dateFilter.holidayDate.$lte = end;
      }
      Object.assign(filter, dateFilter);
    }

    // Handle search filter
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const searchConditions: any[] = [
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { 'user.email': { $regex: escapedSearch, $options: 'i' } },
        { holidayName: { $regex: escapedSearch, $options: 'i' } },
        { reason: { $regex: escapedSearch, $options: 'i' } },
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
      if (filter.$or || filter.holidayDate) {
        const existingFilters: any = {};
        if (filter.holidayDate) {
          existingFilters.holidayDate = filter.holidayDate;
        }
        if (filter.status) {
          existingFilters.status = filter.status;
        }
        if (filter.year) {
          existingFilters.year = filter.year;
        }
        if (filter.userId) {
          existingFilters.userId = filter.userId;
        }
        if (filter['appliedTo._id']) {
          existingFilters['appliedTo._id'] = filter['appliedTo._id'];
        }

        filter.$and = [
          existingFilters,
          { $or: searchConditions }
        ];
        delete filter.holidayDate;
        delete filter.status;
        delete filter.year;
        delete filter.userId;
        delete filter['appliedTo._id'];
      } else {
        filter.$or = searchConditions;
      }
    }

    const [requests, total] = await Promise.all([
      OptionalHolidayRequest.find(filter)
        .sort({ holidayDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email employeeCode')
        .lean(),
      OptionalHolidayRequest.countDocuments(filter),
    ]);

    return {
      data: requests as IOptionalHolidayRequest[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(data: IOptionalHolidayCreate): Promise<IOptionalHolidayRequest> {
    const userId = typeof data.userId === 'string' ? new Types.ObjectId(data.userId) : data.userId;
    const holidayDate = new Date(data.holidayDate);
    const year = holidayDate.getFullYear();

    // Validate user exists and is active
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    if (!user.active) {
      throw new Error('User account is inactive');
    }

    // Validate that the date is an optional holiday in calendar
    const validation = await this.validateOptionalHoliday(userId, holidayDate);
    if (!validation.isValid) {
      throw new Error(validation.error || 'The selected date is not an optional holiday in your calendar');
    }

    // Use holiday name from calendar if not provided
    const holidayName = data.holidayName || validation.holidayName || 'Optional Holiday';

    // Check for duplicate request - same date, any status except Rejected/Cancelled
    const startOfDay = new Date(holidayDate);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(holidayDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingRequest = await OptionalHolidayRequest.findOne({
      userId: userId,
      holidayDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: { $nin: ['Rejected', 'Cancelled'] },
    });

    if (existingRequest) {
      throw new Error('You have already applied for this optional holiday');
    }

    // Check annual limit (only for new requests, not for pending)
    const limitCheck = await this.checkAnnualLimit(userId, year);
    if (!limitCheck.canRequest) {
      throw new Error(`Annual limit reached. You have already used ${limitCheck.used} out of ${limitCheck.total} optional holidays for ${year}`);
    }

    const request = new OptionalHolidayRequest({
      userId: userId,
      holidayDate: holidayDate,
      holidayName: holidayName,
      year: year,
      status: 'Pending',
      reason: data.reason,
      appliedTo: data.appliedTo,
      user: {
        name: user.name,
        email: user.email,
      },
    });

    await request.save();

    // Send email notification to manager/admin
    let manager: any = null;
    if (data.appliedTo && data.appliedTo._id && Types.ObjectId.isValid(data.appliedTo._id)) {
      manager = await User.findById(data.appliedTo._id).select('name email').lean();
      if (manager) {
        const htmlContent = generateEmailTemplate('optionalHolidayRequest', {
          employeeName: user.name,
          holidayName: holidayName,
          holidayDate: holidayDate.toLocaleDateString(),
          reason: data.reason || 'No reason provided',
          requestUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/optional-holidays/${request._id}`,
        });

        await emailService.sendEmail({
          body: {
            to: manager.email,
            subject: `Optional Holiday Request - ${user.name}`,
            text: `${user.name} has requested an optional holiday: ${holidayName} on ${holidayDate.toLocaleDateString()}`,
            html: htmlContent,
          },
        });
      }
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
          const holidayDateFormatted = holidayDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });

          const adminEmailText = `Dear Admin,

An optional holiday request has been submitted by ${user.name}.

Request Details:
- Employee: ${user.name} (${user.email || 'N/A'})
- Holiday Name: ${holidayName}
- Date: ${holidayDateFormatted}
- Year: ${year}
${data.reason ? `- Reason: ${data.reason}` : ''}
- Status: Pending
- Manager: ${manager?.name || 'N/A'}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `Optional Holiday Request Submitted - ${user.name}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for optional holiday request ${request._id}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for optional holiday request:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    return this.findById(request._id);
  }

  async updateStatus(id: string | Types.ObjectId, updateData: IOptionalHolidayStatusUpdate): Promise<IOptionalHolidayRequest> {
    const request = await OptionalHolidayRequest.findById(id);
    if (!request) {
      throw new Error('Optional holiday request not found');
    }

    if (request.status !== 'Pending') {
      throw new Error('Optional holiday request has already been processed');
    }

    // If approving, check annual limit
    if (updateData.status === 'Approved') {
      const limitCheck = await this.checkAnnualLimit(request.userId, request.year);
      if (!limitCheck.canRequest) {
        throw new Error(`Cannot approve: Employee has already used ${limitCheck.used} out of ${limitCheck.total} optional holidays for ${request.year}`);
      }
    }

    request.status = updateData.status;
    request.approvedById = updateData.approvedById;
    request.approvedBy = updateData.approvedBy
      ? {
        _id: typeof updateData.approvedBy._id === 'string' ? updateData.approvedBy._id : updateData.approvedBy._id.toString(),
        name: updateData.approvedBy.name,
        email: updateData.approvedBy.email,
      }
      : undefined;

    if (updateData.status === 'Approved') {
      request.approvedAt = new Date();
    } else if (updateData.status === 'Rejected') {
      request.rejectedAt = new Date();
    } else if (updateData.status === 'Cancelled') {
      request.cancelledAt = new Date();
    }

    if (updateData.remarks) request.remarks = updateData.remarks;
    await request.save();

    // If approved, retroactively update attendance records if swipes exist for that day
    if (updateData.status === 'Approved') {
      const existingRecord = await AttendanceRecord.findOne({
        userId: request.userId,
        shiftDay: request.holidayDate
      });

      if (existingRecord && existingRecord.swipes && existingRecord.swipes.length > 0) {
        console.log(`ℹ️ Retroactively updating attendance record for user ${request.userId} on ${request.holidayDate.toISOString()} to Holiday-Swipe`);

        existingRecord.status = 'holiday_swipe';
        if (!existingRecord.attendanceStatus.includes('Holiday-Swipe')) {
          existingRecord.attendanceStatus.push('Holiday-Swipe');
        }

        // Initialize or update regularization for holiday swipe
        if (!existingRecord.regularization) {
          existingRecord.regularization = {
            isRegularized: true,
            hasRegularizationRequest: false,
            regularizationType: ['Holiday-Swipe'],
            status: 'Approved',
            regularizationId: new Types.ObjectId(),
          };
        } else {
          // Update existing regularization safely
          const reg = existingRecord.regularization;
          reg.isRegularized = true;
          reg.status = 'Approved';

          if (!reg.regularizationType) {
            reg.regularizationType = ['Holiday-Swipe'];
          } else if (!reg.regularizationType.includes('Holiday-Swipe')) {
            reg.regularizationType.push('Holiday-Swipe');
          }

          existingRecord.regularization = reg;
        }

        await existingRecord.save();
      }
    }

    // Update restricted_holiday availed count in leave summary
    // This tracks how many optional holidays have been approved for the user in this year
    const year = request.year;
    const totalApprovedThisYear = await this.getTotalApprovedOptionalHolidays(
      request.userId,
      year
    );

    await this.leaveSummaryService.createOrUpdateLeaveSummary(
      request.userId,
      year,
      'restricted_holiday',
      updateData.status,
      {
        availed: totalApprovedThisYear,
      }
    );

    // Send email notification to employee (the person who applied)
    try {
      const employee = await User.findById(request.userId).select('name email').lean();
      const approver = await User.findById(updateData.approvedById).select('name email').lean();

      if (employee && employee.email) {
        const holidayDateFormatted = request.holidayDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        const htmlContent = generateEmailTemplate('optionalHolidayStatus', {
          employeeName: employee.name,
          approverName: approver?.name || 'Manager',
          holidayName: request.holidayName,
          holidayDate: holidayDateFormatted,
          status: updateData.status,
          remarks: updateData.remarks || '',
          companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
        });

        const emailText = `Dear ${employee.name},

Your optional holiday request has been ${updateData.status.toLowerCase()} by ${approver?.name || 'Manager'}.

Holiday Details:
- Holiday Name: ${request.holidayName}
- Date: ${holidayDateFormatted}
- Year: ${request.year}
${request.reason ? `- Reason: ${request.reason}` : ''}
${updateData.remarks ? `- Remarks: ${updateData.remarks}` : ''}

${updateData.status === 'Approved'
            ? '✅ Your optional holiday has been approved. This day will be counted as a holiday in your payroll.'
            : '❌ Your optional holiday request has been rejected. This day will be treated as a working day.'}

Thank you for your understanding.

Regards,
${approver?.name || 'Manager'}
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

        await emailService.sendEmail({
          body: {
            to: employee.email,
            subject: `Optional Holiday Request ${updateData.status} - ${request.holidayName}`,
            text: emailText,
            html: htmlContent,
          },
        });

        console.log(`Email notification sent to ${employee.email} for optional holiday request ${request._id} - Status: ${updateData.status}`);
      } else {
        console.warn(`Cannot send email: Employee not found or email missing for userId: ${request.userId}`);
      }
    } catch (emailError) {
      console.error('Failed to send email to employee for optional holiday request:', emailError);
      // Don't fail the request if email fails - log the error but continue
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
        const employee = await User.findById(request.userId).select('name email').lean();
        const approver = await User.findById(updateData.approvedById).select('name email').lean();

        const holidayDateFormatted = request.holidayDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        const adminEmails = admins.map(admin => admin.email).filter(Boolean);

        if (adminEmails.length > 0) {
          const adminEmailText = `Dear Admin,

An optional holiday request has been ${updateData.status.toLowerCase()} by ${approver?.name || 'Manager'}.

Request Details:
- Employee: ${employee?.name || 'N/A'} (${employee?.email || 'N/A'})
- Holiday Name: ${request.holidayName}
- Date: ${holidayDateFormatted}
- Year: ${request.year}
${request.reason ? `- Reason: ${request.reason}` : ''}
- Status: ${updateData.status}
${updateData.remarks ? `- Remarks: ${updateData.remarks}` : ''}
- Approved/Rejected By: ${approver?.name || 'Manager'}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `Optional Holiday Request ${updateData.status} - ${employee?.name || 'Employee'}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for optional holiday request ${request._id} - Status: ${updateData.status}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for optional holiday request:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    return this.findById(request._id);
  }

  async cancel(id: string | Types.ObjectId, userId: Types.ObjectId): Promise<IOptionalHolidayRequest> {
    const request = await OptionalHolidayRequest.findById(id);
    if (!request) {
      throw new Error('Optional holiday request not found');
    }

    if (request.userId.toString() !== userId.toString()) {
      throw new Error('You can only cancel your own optional holiday requests');
    }

    if (request.status !== 'Pending') {
      throw new Error('Only pending requests can be cancelled');
    }

    request.status = 'Cancelled';
    request.cancelledAt = new Date();
    await request.save();

    return this.findById(request._id);
  }

  /**
   * Get approved optional holidays for a user in a specific year/month
   * Used by payroll calculation
   */
  async getApprovedOptionalHolidays(
    userId: Types.ObjectId,
    year: number,
    monthNumber?: number,
  ): Promise<IOptionalHolidayRequest[]> {
    const filter: any = {
      userId: userId,
      year: year,
      status: 'Approved',
    };

    if (monthNumber !== undefined) {
      const firstDay = new Date(year, monthNumber - 1, 1);
      const lastDay = new Date(year, monthNumber, 0);
      filter.holidayDate = {
        $gte: firstDay,
        $lte: lastDay,
      };
    }

    return await OptionalHolidayRequest.find(filter).lean();
  }

  /**
   * Get total approved optional holidays count for a user in a year
   * Used to update availed count in leave summary
   */
  private async getTotalApprovedOptionalHolidays(
    userId: Types.ObjectId,
    year: number
  ): Promise<number> {
    const approvedCount = await OptionalHolidayRequest.countDocuments({
      userId: userId,
      year: year,
      status: 'Approved',
    });
    return approvedCount;
  }

  /**
   * Get optional holiday usage summary for a user
   */
  async getUsageSummary(userId: Types.ObjectId, year: number): Promise<{
    total: number;
    used: number;
    remaining: number;
    requests: IOptionalHolidayRequest[];
  }> {
    const requests = await OptionalHolidayRequest.find({
      userId: userId,
      year: year,
    })
      .sort({ holidayDate: 1 })
      .lean();

    const approvedCount = requests.filter((r) => r.status === 'Approved').length;

    // Get max allowed from leave summary (dynamic per user)
    const maxAllowed = await this.getMaxOptionalHolidays(userId, year);

    return {
      total: maxAllowed,
      used: approvedCount,
      remaining: Math.max(0, maxAllowed - approvedCount),
      requests: requests as IOptionalHolidayRequest[],
    };
  }
}

