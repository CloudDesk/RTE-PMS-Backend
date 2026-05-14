import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { LeaveRelease, ILeaveRelease } from '../models/leave-release.model';
import { LeaveSummaryService } from './leave-summary.service';
import { User } from '../models';
import { Types } from 'mongoose';
import { emailService } from './email.service';
import { generateEmailTemplate } from '../emails/templates';

export interface ILeaveReleaseCreate {
  employeeIds: string[]; // Array of employee IDs
  releaseType: 'monthly' | 'quarterly' | 'annual';
  period: {
    month?: number;    // 1-12 (required for monthly, except restricted_holiday)
    quarter?: number;  // 1-4 (required for quarterly: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)
    year: number;      // Required for all types
  };
  leaveType: 'annual' | 'sick' | 'compOff' | 'lossOfPay' | 'otherPaid' | 'otherUnpaid' | 'restricted_holiday';
  daysReleased: number; // Can be decimal (e.g., 4.5)
  notes?: string;
}

export class LeaveReleaseService extends BaseService {
  private leaveSummaryService: LeaveSummaryService;

  constructor(context: RequestContext) {
    super(context);
    this.leaveSummaryService = new LeaveSummaryService(context);
  }

  /**
   * Release leaves to one or multiple employees (India only)
   * Adds to existing leave balance
   */
  async releaseLeaves(releaseData: ILeaveReleaseCreate): Promise<{
    success: number;
    failed: Array<{ employeeId: string; error: string }>;
    releases: ILeaveRelease[];
  }> {
    const { employeeIds, releaseType, period, leaveType, daysReleased, notes } = releaseData;
    const releasedBy = this.context.user?._id;

    if (!releasedBy) {
      throw new Error('User not authenticated');
    }

    // Validate period
    if (releaseType === 'monthly' && leaveType !== 'restricted_holiday' && !period.month) {
      throw new Error('Month is required for monthly release');
    }
    if (releaseType === 'quarterly' && !period.quarter) {
      throw new Error('Quarter is required for quarterly release');
    }
    if (releaseType === 'annual') {
      // For annual release, only year is required, month and quarter should not be provided
      if (period.month) {
        throw new Error('Month should not be set for annual release');
      }
      if (period.quarter) {
        throw new Error('Quarter should not be set for annual release');
      }
    }
    if (daysReleased <= 0) {
      throw new Error('daysReleased must be greater than 0');
    }

    const success: string[] = [];
    const failed: Array<{ employeeId: string; error: string }> = [];
    const releases: ILeaveRelease[] = [];

    // Process each employee
    for (const employeeId of employeeIds) {
      try {
        // Check if employee is from India
        const employee = await User.findById(employeeId).select('country name email');
        if (!employee) {
          failed.push({ employeeId, error: 'Employee not found' });
          continue;
        }

        if (employee.country !== 'IN') {
          failed.push({ employeeId, error: 'Leave releases are only available for India employees' });
          continue;
        }

        // Get current leave summary for the year
        const currentSummary = await this.leaveSummaryService.getLeaveSummary(
          new Types.ObjectId(employeeId),
          period.year
        );

        // Get current allotted balance
        const currentAlloted = currentSummary[leaveType as keyof typeof currentSummary]?.alloted || 0;

        // Add daysReleased to existing balance
        const newAlloted = currentAlloted + daysReleased;

        // Update leave summary - ADD to existing balance (skip email, we'll send release-specific email)
        const updatedSummary = await this.leaveSummaryService.updateLeaveAllotments(
          new Types.ObjectId(employeeId),
          period.year,
          {
            [leaveType]: newAlloted
          },
          { skipEmail: true }  // Skip allotment email, send release-specific email instead
        );

        // Create leave release record
        const release = await LeaveRelease.create({
          employeeId: new Types.ObjectId(employeeId),
          releaseType,
          period,
          leaveType,
          daysReleased,
          releasedBy,
          notes
        });

        releases.push(release);
        success.push(employeeId);

        // Send email notification to employee
        try {
          const periodDescription = releaseType === 'monthly'
            ? `${this.getMonthName(period.month!)} ${period.year}`
            : releaseType === 'quarterly'
              ? `Q${period.quarter} ${period.year}`
              : `${period.year}`; // annual release

          // Check if only restricted_holiday is non-zero (all other leave types are 0)
          const restrictedHolidayCount = updatedSummary.restricted_holiday?.alloted || 0;
          const hasOnlyRestrictedHoliday = leaveType === 'restricted_holiday' &&
            restrictedHolidayCount > 0 &&
            (updatedSummary.annual?.alloted || 0) === 0 &&
            (updatedSummary.sick?.alloted || 0) === 0 &&
            (updatedSummary.compOff?.alloted || 0) === 0 &&
            (updatedSummary.otherPaid?.alloted || 0) === 0 &&
            (updatedSummary.otherUnpaid?.alloted || 0) === 0 &&
            ((updatedSummary.maternity?.alloted || 0) === 0) &&
            ((updatedSummary.workFromHome?.alloted || 0) === 0);

          const html = generateEmailTemplate('leaveBalanceAllotmentEmail', {
            userName: employee.name,
            year: period.year,
            releaseInfo: `${daysReleased} days released for ${periodDescription}`,
            leaveType,
            // Include all leave type values for the email template
            annual: updatedSummary.annual?.alloted || 0,
            sick: updatedSummary.sick?.alloted || 0,
            compOff: updatedSummary.compOff?.alloted || 0,
            otherPaid: updatedSummary.otherPaid?.alloted || 0,
            otherUnpaid: updatedSummary.otherUnpaid?.alloted || 0,
            maternity: updatedSummary.maternity?.alloted || 0,
            workFromHome: updatedSummary.workFromHome?.alloted || 0,
            restricted_holiday: restrictedHolidayCount,
            hasOnlyRestrictedHoliday,
            companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS'
          });

          // Generate email subject and text based on whether only restricted holiday is released
          let emailSubject: string;
          let emailText: string;

          if (hasOnlyRestrictedHoliday) {
            emailSubject = `Your Restricted Holiday Allocation for ${period.year} has been updated`;
            emailText = `Hello ${employee.name},\n\nYour Restricted Holiday Allocation for the year ${period.year} has been updated in ${process.env.COMPANY_NAME || 'CloudDesk HRMS'}.\n\nRestricted Holiday Allocation: ${restrictedHolidayCount} holidays\n\nIf you believe this is incorrect or have questions, please contact HR.\n\nThank you,\n${process.env.COMPANY_NAME || 'CloudDesk HRMS'} Team`;
          } else {
            emailSubject = releaseType === 'annual'
              ? `Leave Released: ${daysReleased} days for ${period.year}`
              : `Leave Released: ${daysReleased} days for ${periodDescription}`;
            emailText = releaseType === 'annual'
              ? `Dear ${employee.name},\n\n${daysReleased} days of ${leaveType} leave have been released for the year ${period.year}. Your new balance has been updated.\n\nRegards,\n${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`
              : `Dear ${employee.name},\n\n${daysReleased} days of ${leaveType} leave have been released for ${periodDescription}. Your new balance has been updated.\n\nRegards,\n${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;
          }

          await emailService.sendEmail({
            body: {
              to: employee.email,
              subject: emailSubject,
              text: emailText,
              html
            }
          });
        } catch (emailError) {
          console.error(`Failed to send email to ${employee.email}:`, emailError);
          // Don't fail the release if email fails
        }

      } catch (error: any) {
        console.error(`Failed to release leave for employee ${employeeId}:`, error);
        failed.push({ employeeId, error: error.message || 'Unknown error' });
      }
    }

    return {
      success: success.length,
      failed,
      releases
    };
  }

  /**
   * Get leave release history for an employee
   * @param employeeId - Employee ID
   * @param year - Filter by exact year (optional)
   * @param yearLessThan - Filter by years less than or equal to this value (optional)
   */
  async getReleaseHistory(
    employeeId: string,
    year?: number,
    yearLessThan?: number
  ): Promise<ILeaveRelease[]> {
    const query: any = {
      employeeId: new Types.ObjectId(employeeId)
    };

    // If exact year is provided, use it (takes precedence)
    if (year) {
      query['period.year'] = year;
    } else if (yearLessThan) {
      // If yearLessThan is provided, filter by period.year <= yearLessThan
      query['period.year'] = { $lte: yearLessThan };
    }

    return await LeaveRelease.find(query)
      .populate('releasedBy', 'name email')
      .sort({ releasedAt: -1 })
      .lean();
  }

  /**
   * Get all leave releases with employee details (Admin only)
   */
  async getAllReleases(filters?: {
    employeeId?: string;
    search?: string;
    year?: number;
    yearLessThan?: number;
    leaveType?: string;
    releaseType?: 'monthly' | 'quarterly' | 'annual' | 'carryforward';
    page?: number;
    limit?: number;
  }): Promise<{
    releases: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const query: any = {};

    // Handle employeeId filter (if provided without search)
    if (filters?.employeeId && !filters?.search) {
      query.employeeId = new Types.ObjectId(filters.employeeId);
    }

    // Handle search - search in employee name, email, employeeCode, leaveType, releaseType, and notes
    if (filters?.search) {
      const searchRegex = new RegExp(filters.search, 'i');

      // Search in leave release document fields (leaveType, releaseType, notes)
      const documentSearchFilter: any[] = [
        { 'leaveType': { $regex: filters.search, $options: 'i' } },
        { 'releaseType': { $regex: filters.search, $options: 'i' } },
        { 'notes': { $regex: filters.search, $options: 'i' } },
      ];

      // Search in user collection to find matching employees
      const matchingEmployees = await User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { employeeCode: searchRegex }
        ]
      }).select('_id').lean();

      const employeeIds = matchingEmployees.map(emp => emp._id);

      // Combine employee search with document field search
      if (employeeIds.length > 0) {
        documentSearchFilter.push({ employeeId: { $in: employeeIds } });
      }

      // If no matches found in any field, return empty result
      if (employeeIds.length === 0 && documentSearchFilter.length === 3) {
        return {
          releases: [],
          total: 0,
          page: filters?.page || 1,
          limit: filters?.limit || 50,
          totalPages: 0
        };
      }

      // Combine search with existing filters using $and
      const existingFilters = { ...query };
      query.$and = [
        existingFilters,
        { $or: documentSearchFilter }
      ];
    }

    // Handle year filtering - exact year takes precedence over yearLessThan
    if (filters?.year) {
      if (query.$and) {
        query.$and.push({ 'period.year': filters.year });
      } else {
        query['period.year'] = filters.year;
      }
    } else if (filters?.yearLessThan) {
      // If yearLessThan is provided, filter by period.year <= yearLessThan
      // $lte means "less than or equal to"
      // Example: yearLessThan=2021 returns 2021, 2020, 2019, and all earlier years
      if (query.$and) {
        query.$and.push({ 'period.year': { $lte: filters.yearLessThan } });
      } else {
        query['period.year'] = { $lte: filters.yearLessThan };
      }
    }

    if (filters?.leaveType) {
      if (query.$and) {
        query.$and.push({ leaveType: filters.leaveType });
      } else {
        query.leaveType = filters.leaveType;
      }
    }

    if (filters?.releaseType) {
      if (query.$and) {
        query.$and.push({ releaseType: filters.releaseType });
      } else {
        query.releaseType = filters.releaseType;
      }
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const [releases, total] = await Promise.all([
      LeaveRelease.find(query)
        .populate('employeeId', 'name email employeeCode country')
        .populate('releasedBy', 'name email')
        .sort({ releasedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LeaveRelease.countDocuments(query)
    ]);

    return {
      releases,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Helper: Get month name from number
   */
  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || '';
  }

  /**
   * Get quarterly months mapping
   */
  getQuarterlyMonths(quarter: number): number[] {
    const quarterMap: { [key: number]: number[] } = {
      1: [1, 2, 3],   // Q1: Jan, Feb, Mar
      2: [4, 5, 6],   // Q2: Apr, May, Jun
      3: [7, 8, 9],   // Q3: Jul, Aug, Sep
      4: [10, 11, 12] // Q4: Oct, Nov, Dec
    };
    return quarterMap[quarter] || [];
  }
}

