import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { LeaveCarryForward, ILeaveCarryForward } from '../models/leave-carry-forward.model';
import { LeaveRelease } from '../models/leave-release.model';
import { LeaveSummaryService } from './leave-summary.service';
import { LeaveSummary } from '../models/leave-summary.model';
import { User } from '../models';
import { Types } from 'mongoose';
import { emailService } from './email.service';
import { generateEmailTemplate } from '../emails/templates';

export interface ILeaveCarryForwardRequest {
  employeeId: string;
  fromYear: number;
  toYear: number;
  leaveType: 'annual' | 'sick' | 'compOff' | 'lossOfPay' | 'otherPaid' | 'otherUnpaid';
  daysCarriedForward: number; // Admin-specified amount (can be decimal)
  notes?: string;
}

export interface IBatchCarryForwardRequest {
  employees: Array<{
    employeeId: string;
    leaveType: 'annual' | 'sick' | 'compOff' | 'lossOfPay' | 'otherPaid' | 'otherUnpaid';
    daysCarriedForward: number;
  }>;
  fromYear: number;
  toYear: number;
  notes?: string;
}

export class LeaveCarryForwardService extends BaseService {
  private leaveSummaryService: LeaveSummaryService;

  constructor(context: RequestContext) {
    super(context);
    this.leaveSummaryService = new LeaveSummaryService(context);
  }

  /**
   * Process carry-forward for a single employee (India only)
   */
  async processCarryForward(carryForwardData: ILeaveCarryForwardRequest): Promise<ILeaveCarryForward> {
    const { employeeId, fromYear, toYear, leaveType, daysCarriedForward, notes } = carryForwardData;
    const processedBy = this.context.user?._id;

    if (!processedBy) {
      throw new Error('User not authenticated');
    }

    // Validate years
    if (toYear !== fromYear + 1) {
      throw new Error('toYear must be fromYear + 1');
    }

    // Check if employee is from India
    const employee = await User.findById(employeeId).select('country name email');
    if (!employee) {
      throw new Error('Employee not found');
    }

    if (employee.country !== 'IN') {
      throw new Error('Leave carry-forward is only available for India employees');
    }

    // Get leave summary for fromYear - check if it exists first without creating
    // We should NOT create a record for fromYear if it doesn't exist
    // Carry-forward should only work on existing leave summaries with actual balance
    const fromYearSummaryDoc = await LeaveSummary.findOne({ 
      userId: new Types.ObjectId(employeeId), 
      year: fromYear 
    });

    if (!fromYearSummaryDoc) {
      throw new Error(`Cannot carry forward from year ${fromYear}. No leave summary record exists for this year. Please create leave allotments first.`);
    }

    // Now get the summary (it exists, so this won't create a new record)
    const fromYearSummary = await this.leaveSummaryService.getLeaveSummary(
      new Types.ObjectId(employeeId),
      fromYear
    );

    const category = fromYearSummary[leaveType as keyof typeof fromYearSummary];
    if (!category) {
      throw new Error(`Leave type ${leaveType} not found`);
    }

    const balanceBefore = category.remaining || 0;

    // Validate carry-forward amount
    // Rule 1: Cannot carry forward if employee has 0 balance
    if (balanceBefore <= 0) {
      throw new Error(`Cannot carry forward ${leaveType} leave. Employee has no remaining balance (${balanceBefore} days).`);
    }

    // Rule 2: Cannot carry forward negative amount
    if (daysCarriedForward < 0) {
      throw new Error('Days to carry forward cannot be negative');
    }

    // Rule 3: Cannot carry forward zero amount (must be > 0)
    if (daysCarriedForward === 0) {
      throw new Error('Days to carry forward must be greater than 0');
    }

    // Rule 4: Cannot carry forward more than available balance
    // Example: If balance is 10, cannot enter 15
    if (daysCarriedForward > balanceBefore) {
      throw new Error(`Cannot carry forward ${daysCarriedForward} days. Employee only has ${balanceBefore} days remaining balance for ${leaveType} leave.`);
    }

    // Check if already processed
    const existing = await LeaveCarryForward.findOne({
      employeeId: new Types.ObjectId(employeeId),
      fromYear,
      toYear,
      leaveType
    });

    if (existing) {
      throw new Error(`Carry-forward already processed for ${leaveType} from ${fromYear} to ${toYear}`);
    }

    const daysForfeited = balanceBefore - daysCarriedForward;

    // Create carry-forward record
    const carryForward = await LeaveCarryForward.create({
      employeeId: new Types.ObjectId(employeeId),
      fromYear,
      toYear,
      leaveType,
      balanceBefore,
      daysCarriedForward,
      daysForfeited,
      processedBy,
      notes
    });

    // IMPORTANT: Subtract carried forward days from FROM year's remaining balance
    // We keep 'alloted' unchanged (it represents the original allocation for that year)
    // We directly update 'remaining' to subtract the carried forward days
    // This preserves the original allocation while reducing available balance
    const fromYearCategory = fromYearSummary[leaveType as keyof typeof fromYearSummary];
    const currentFromYearAlloted = fromYearCategory?.alloted || 0;
    const newRemaining = balanceBefore - daysCarriedForward;

    // Update FROM year: keep alloted unchanged, directly update remaining
    // Use findOneAndUpdate to bypass pre-save hook and directly set remaining
    // IMPORTANT: We use $set to directly update remaining without triggering pre-save hook recalculation
    const updatedFromYearDoc = await LeaveSummary.findOneAndUpdate(
      { userId: new Types.ObjectId(employeeId), year: fromYear },
      { 
        $set: { 
          [`${leaveType}.remaining`]: Math.max(0, newRemaining)
        }
      },
      { new: true }
    );

    if (!updatedFromYearDoc) {
      throw new Error(`Failed to update leave summary for year ${fromYear}`);
    }

    // Verify FROM year's alloted and remaining balance were correctly updated
    // Use the document we just updated instead of calling getLeaveSummary again
    const updatedFromYearCategory = updatedFromYearDoc[leaveType as keyof typeof updatedFromYearDoc] as any;
    const expectedFromYearAlloted = currentFromYearAlloted; // Should remain unchanged
    const expectedFromYearRemaining = balanceBefore - daysCarriedForward;

    // Verify alloted was NOT changed (should remain the same)
    if (Math.abs((updatedFromYearCategory?.alloted || 0) - expectedFromYearAlloted) > 0.01) {
      console.warn(`Carry forward FROM year alloted mismatch. Expected: ${expectedFromYearAlloted}, Got: ${updatedFromYearCategory?.alloted}.`);
    }

    // Verify remaining balance was correctly updated
    if (Math.abs((updatedFromYearCategory?.remaining || 0) - expectedFromYearRemaining) > 0.01) {
      console.warn(`Carry forward FROM year remaining balance mismatch. Expected: ${expectedFromYearRemaining}, Got: ${updatedFromYearCategory?.remaining}.`);
    }

    // Get next year's leave summary
    const toYearSummary = await this.leaveSummaryService.getLeaveSummary(
      new Types.ObjectId(employeeId),
      toYear
    );

    const toYearCategory = toYearSummary[leaveType as keyof typeof toYearSummary];
    const currentToYearAlloted = toYearCategory?.alloted || 0;

    // Carry forward logic:
    // When 5 days are carried forward from 2024 (remaining: 10) to 2025:
    // 
    // FROM YEAR (2024):
    // - Original: alloted = 20, availed = 10, remaining = 10
    // - After carry-forward: alloted = 20 (unchanged), availed = 10, remaining = 5
    // - We keep 'alloted' unchanged to preserve the original allocation
    // - We directly update 'remaining' to subtract the carried forward days
    // - The 5 days are subtracted from 2024's remaining balance
    // 
    // TO YEAR (2025):
    // - Original: alloted = 20, availed = 0, remaining = 20
    // - After carry-forward: alloted = 20 + 5 = 25, remaining = 25 - availed
    // - The 5 days are added to 2025's allotted quota
    // 
    // Example:
    // 2024: alloted = 20, remaining = 10, carry forward 5 → alloted = 20, remaining = 5
    // 2025: alloted = 20, carry forward 5 → alloted = 25
    // 
    // Result: Employee has 5 less days remaining in 2024, 5 more days quota in 2025
    // Note: 'alloted' in FROM year stays accurate (original allocation), 'availed' stays accurate (only actual leave days)

    // Add carried forward days to next year's allotted
    // This increases the remaining balance: remaining = alloted - availed
    const finalAlloted = currentToYearAlloted + daysCarriedForward;

    // Update allotted - pre-save hook will recalculate remaining
    // remaining = alloted - availed = finalAlloted - availed
    // This gives employee access to: (original quota - carried forward) + carried forward = original quota + carried forward
    // Skip email - we'll send carry-forward specific email later
    await this.leaveSummaryService.updateLeaveAllotments(
      new Types.ObjectId(employeeId),
      toYear,
      {
        [leaveType]: finalAlloted
      },
      { skipEmail: true }  // Skip allotment email, send carry-forward email instead
    );

    // Verify the update was successful and remaining balance includes carried forward days
    // Use findOne to get the updated document instead of getLeaveSummary (which might create records)
    const updatedSummaryDoc = await LeaveSummary.findOne({
      userId: new Types.ObjectId(employeeId),
      year: toYear
    });

    if (!updatedSummaryDoc) {
      throw new Error(`Failed to retrieve updated leave summary for year ${toYear}`);
    }

    const updatedCategory = updatedSummaryDoc[leaveType as keyof typeof updatedSummaryDoc] as any;
    if (!updatedCategory) {
      throw new Error(`Failed to retrieve updated leave summary for ${leaveType}`);
    }

    // Verify allotted was updated correctly
    // Should be: (original - carried forward) + carried forward = original + carried forward
    if (updatedCategory.alloted !== finalAlloted) {
      throw new Error(`Failed to update leave summary for carry forward. Expected alloted: ${finalAlloted}, Got: ${updatedCategory.alloted}`);
    }

    // Verify remaining balance includes carried forward days
    // remaining = alloted - availed = (original + carried forward) - availed
    const expectedRemaining = finalAlloted - (updatedCategory.availed || 0);
    if (Math.abs(updatedCategory.remaining - expectedRemaining) > 0.01) {
      console.warn(`Carry forward remaining balance mismatch. Expected: ${expectedRemaining}, Got: ${updatedCategory.remaining}. This may be recalculated on next save.`);
    }

    // Create LeaveRelease record for carry-forward (for tracking in release history)
    // This allows carry-forward to appear in the release history alongside monthly/quarterly releases
    try {
      await LeaveRelease.create({
        employeeId: new Types.ObjectId(employeeId),
        releaseType: 'carryforward',
        period: {
          year: toYear  // toYear is the year the leaves are carried forward to
        },
        leaveType,
        daysReleased: daysCarriedForward,
        releasedBy: processedBy,
        notes: notes || `Carried forward from ${fromYear}`
      });
    } catch (releaseError) {
      console.error(`Failed to create LeaveRelease record for carry-forward:`, releaseError);
      // Don't fail the carry-forward if LeaveRelease creation fails
      // The LeaveCarryForward record is already created, which is the primary audit trail
    }

    // Send email notification
    try {
      const emailParams: Record<string, string | number | boolean> = {
        userName: employee.name,
        year: toYear,
        carryForwardInfo: `${daysCarriedForward} days carried forward from ${fromYear}`,
        leaveType,
        // Include all leave type values for the email template
        annual: updatedSummaryDoc.annual?.alloted || 0,
        sick: updatedSummaryDoc.sick?.alloted || 0,
        compOff: updatedSummaryDoc.compOff?.alloted || 0,
        otherPaid: updatedSummaryDoc.otherPaid?.alloted || 0,
        otherUnpaid: updatedSummaryDoc.otherUnpaid?.alloted || 0,
        maternity: updatedSummaryDoc.maternity?.alloted || 0,
        workFromHome: updatedSummaryDoc.workFromHome?.alloted || 0,
        companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS'
      };

      // Only include forfeitedDays if there are forfeited days (never set to null)
      if (daysForfeited > 0) {
        emailParams.forfeitedDays = `${daysForfeited} days forfeited`;
      }

      const html = generateEmailTemplate('leaveBalanceAllotmentEmail', emailParams);

      await emailService.sendEmail({
        body: {
          to: employee.email,
          subject: `Leave Carry-Forward Processed: ${daysCarriedForward} days for ${toYear}`,
          text: `Dear ${employee.name},\n\n${daysCarriedForward} days of ${leaveType} leave have been carried forward from ${fromYear} to ${toYear}.${daysForfeited > 0 ? ` ${daysForfeited} days were forfeited.` : ''}\n\nRegards,\n${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`,
          html
        }
      });
    } catch (emailError) {
      console.error(`Failed to send email to ${employee.email}:`, emailError);
      // Don't fail the carry-forward if email fails
    }

    return carryForward;
  }

  /**
   * Batch process carry-forward for multiple employees (India only)
   */
  async batchProcessCarryForward(batchData: IBatchCarryForwardRequest): Promise<{
    success: number;
    failed: Array<{ employeeId: string; leaveType: string; error: string }>;
    carryForwards: ILeaveCarryForward[];
  }> {
    const { employees, fromYear, toYear, notes } = batchData;

    // Validate years
    if (toYear !== fromYear + 1) {
      throw new Error('toYear must be fromYear + 1');
    }

    const success: string[] = [];
    const failed: Array<{ employeeId: string; leaveType: string; error: string }> = [];
    const carryForwards: ILeaveCarryForward[] = [];

    for (const emp of employees) {
      try {
        const carryForward = await this.processCarryForward({
          employeeId: emp.employeeId,
          fromYear,
          toYear,
          leaveType: emp.leaveType,
          daysCarriedForward: emp.daysCarriedForward,
          notes
        });
        carryForwards.push(carryForward);
        success.push(emp.employeeId);
      } catch (error: any) {
        failed.push({
          employeeId: emp.employeeId,
          leaveType: emp.leaveType,
          error: error.message || 'Unknown error'
        });
      }
    }

    return {
      success: success.length,
      failed,
      carryForwards
    };
  }

  /**
   * Get carry-forward details for an employee
   */
  async getCarryForwardDetails(
    employeeId: string,
    fromYear?: number,
    toYear?: number
  ): Promise<ILeaveCarryForward[]> {
    const query: any = {
      employeeId: new Types.ObjectId(employeeId)
    };

    if (fromYear) {
      query.fromYear = fromYear;
    }
    if (toYear) {
      query.toYear = toYear;
    }

    return await LeaveCarryForward.find(query)
      .populate('processedBy', 'name email')
      .sort({ fromYear: -1 })
      .lean();
  }

  /**
   * Get available balance for carry-forward (end of year balance)
   * IMPORTANT: Does NOT create records - only returns balance if record exists
   */
  async getAvailableBalanceForCarryForward(
    employeeId: string,
    year: number
  ): Promise<{
    annual?: number;
    sick?: number;
    compOff?: number;
    lossOfPay?: number;
    otherPaid?: number;
    otherUnpaid?: number;
  }> {
    // Use findOne instead of getLeaveSummary to avoid creating records
    // Only return balance if the record actually exists
    const summary = await LeaveSummary.findOne({
      userId: new Types.ObjectId(employeeId),
      year
    });

    // If no record exists, return all zeros (don't create a record)
    if (!summary) {
      return {
        annual: 0,
        sick: 0,
        compOff: 0,
        lossOfPay: 0,
        otherPaid: 0,
        otherUnpaid: 0
      };
    }

    return {
      annual: summary.annual?.remaining || 0,
      sick: summary.sick?.remaining || 0,
      compOff: summary.compOff?.remaining || 0,
      lossOfPay: summary.lossOfPay?.remaining || 0,
      otherPaid: summary.otherPaid?.remaining || 0,
      otherUnpaid: summary.otherUnpaid?.remaining || 0
    };
  }

  /**
   * Get all carry-forwards with employee details (Admin only)
   */
  async getAllCarryForwards(filters?: {
    employeeId?: string;
    search?: string;
    fromYear?: number;
    toYear?: number;
    yearLessThan?: number;
    leaveType?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    carryForwards: any[];
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

    // Handle search - search in employee name, email, employeeCode, leaveType, notes, and years
    if (filters?.search) {
      const searchRegex = new RegExp(filters.search, 'i');
      
      // Search in carry forward document fields (leaveType, notes, fromYear, toYear)
      const documentSearchFilter: any[] = [
        { 'leaveType': { $regex: filters.search, $options: 'i' } },
        { 'notes': { $regex: filters.search, $options: 'i' } },
      ];
      
      // Also check if search is a year number
      const searchYear = parseInt(filters.search, 10);
      if (!isNaN(searchYear)) {
        documentSearchFilter.push(
          { 'fromYear': searchYear },
          { 'toYear': searchYear }
        );
      }
      
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
      if (employeeIds.length === 0 && documentSearchFilter.length === 2 && isNaN(searchYear)) {
        return {
          carryForwards: [],
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
    if (filters?.fromYear) {
      if (query.$and) {
        query.$and.push({ fromYear: filters.fromYear });
      } else {
        query.fromYear = filters.fromYear;
      }
    } else if (filters?.yearLessThan) {
      // If yearLessThan is provided, filter by fromYear <= yearLessThan
      // $lte means "less than or equal to"
      // Example: yearLessThan=2021 returns carry-forwards where fromYear <= 2021 (2021, 2020, 2019, etc.)
      if (query.$and) {
        query.$and.push({ fromYear: { $lte: filters.yearLessThan } });
      } else {
        query.fromYear = { $lte: filters.yearLessThan };
      }
    }

    if (filters?.toYear) {
      if (query.$and) {
        query.$and.push({ toYear: filters.toYear });
      } else {
        query.toYear = filters.toYear;
      }
    }

    if (filters?.leaveType) {
      if (query.$and) {
        query.$and.push({ leaveType: filters.leaveType });
      } else {
        query.leaveType = filters.leaveType;
      }
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const [carryForwards, total] = await Promise.all([
      LeaveCarryForward.find(query)
        .populate('employeeId', 'name email employeeCode country')
        .populate('processedBy', 'name email')
        .sort({ fromYear: -1, processedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LeaveCarryForward.countDocuments(query)
    ]);

    return {
      carryForwards,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}

