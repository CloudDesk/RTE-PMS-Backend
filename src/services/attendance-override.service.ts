import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { AttendanceRecord, IAttendanceRecord } from '../models/attendance-record.model';
import { AttendanceRegularization } from '../models/attendance-regularization.model';
import { User } from '../models/user.model';
import { Types } from 'mongoose';

export interface ICreateOverride {
  userId: string;
  attendanceId?: string;       // Optional: If provided, updates existing record
  shiftDay: string;
  attendanceStatus: string[];  // Must include 'Override' and one of: 'Present', 'Absent', 'On-Leave', 'Holiday-Swipe'
  reason?: string;             // Optional: defaults to "Attendance manually overridden by administrator"
  remarks?: string;
  // For On-Leave override:
  leaveTypeId?: string;        // Required for 'On-Leave' status - Leave type ID
  leaveReason?: string;        // Optional: Reason for leave (if creating new leave request)
  // Note: firstIn, lastOut, swipes, and all time calculations are automatically calculated from shift assignment
}

export interface IUpdateOverride {
  attendanceStatus?: string[];
  status?: string;
  reason?: string;
  remarks?: string;
  firstIn?: string;
  lastOut?: string;
  totalWorkHours?: string;
  actualWorkHours?: string;
  modificationReason?: string;
}

export class AttendanceOverrideService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  /**
   * Create or update attendance override
   */
  async createOverride(
    data: ICreateOverride,
    adminId: Types.ObjectId
  ): Promise<IAttendanceRecord> {
    // 1. Validate user exists and is active
    const user = await User.findById(data.userId);
    if (!user || !user.active) {
      throw new Error('User not found or inactive');
    }

    // 2. Parse and normalize date
    const shiftDay = new Date(data.shiftDay);
    shiftDay.setUTCHours(0, 0, 0, 0);

    // 3. Validate attendanceStatus includes 'Override'
    if (!data.attendanceStatus.includes('Override')) {
      throw new Error('attendanceStatus must include "Override"');
    }

    // 4. Validate allowed override statuses
    const allowedStatuses = ['Present', 'Absent', 'On-Leave', 'Holiday-Swipe'];
    const hasAllowedStatus = data.attendanceStatus.some(status => allowedStatuses.includes(status));
    if (!hasAllowedStatus) {
      throw new Error(`attendanceStatus must include one of: ${allowedStatuses.join(', ')}. Note: Late and Early-Exit should use Regularization, not Override.`);
    }

    // 5. Special handling for On-Leave - must be done BEFORE other validations
    const targetStatus = data.attendanceStatus.find(s => allowedStatuses.includes(s));
    if (targetStatus === 'On-Leave') {
      if (!data.leaveTypeId) {
        throw new Error('leaveTypeId is required when overriding attendance to On-Leave');
      }
      // Handle On-Leave override separately (integrates with leave system)
      const result = await this.handleOnLeaveOverride(
        data.userId,
        shiftDay,
        data.leaveTypeId,
        data.leaveReason,
        adminId,
        data.reason?.trim() || this.getDefaultReason('On-Leave')
      );
      return result.attendanceRecord;
    }

    // 6. Set default reason if not provided
    const reason = data.reason?.trim() || this.getDefaultReason(targetStatus || 'Present');

    // 7. Determine target status (what admin wants to set)
    const isPresent = targetStatus === 'Present';
    const isAbsent = targetStatus === 'Absent';
    const isHoliday = targetStatus === 'Holiday-Swipe';

    // 8. Find or create attendance record
    // If attendanceId is provided, use it; otherwise find by userId and shiftDay
    let record: IAttendanceRecord | null = null;
    
    if (data.attendanceId) {
      record = await AttendanceRecord.findById(data.attendanceId);
      if (!record) {
        throw new Error('Attendance record not found with provided attendanceId');
      }
      // Verify it belongs to the user
      if (record.userId.toString() !== data.userId) {
        throw new Error('Attendance record does not belong to the specified user');
      }
    } else {
      record = await AttendanceRecord.findOne({
        userId: new Types.ObjectId(data.userId),
        shiftDay,
      });
    }

    const isNewRecord = !record;
    
    // Store original values BEFORE override
    const originalStatus = record?.status;
    const originalAttendanceStatus = record?.attendanceStatus ? [...record.attendanceStatus] : [];
    const originalFirstIn = record?.firstIn || null;
    const originalLastOut = record?.lastOut || null;
    const originalTotalWorkHours = record?.totalWorkHours || '00:00:00';
    const originalActualWorkHours = record?.actualWorkHours || '00:00:00';

    if (!record) {
      // Get user's shift assignment for the date
      const shiftAssignment = await this.getShiftAssignment(data.userId, shiftDay);
      
      if (!shiftAssignment) {
        throw new Error('No shift assignment found for the user on this date');
      }

      // Prepare record data based on override status
      const recordData = await this.prepareOverrideRecordData(
        data,
        shiftAssignment,
        shiftDay,
        targetStatus || 'Present',
        isPresent,
        isAbsent,
        isHoliday
      );

      // Create swipes array from calculated firstIn/lastOut
      const swipes: any[] = [];
      if (recordData.firstIn && recordData.lastOut) {
        swipes.push({
          timestamp: recordData.firstIn,
          direction: 'IN' as const,
          deviceId: 'override',
          location: {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            altitude: 0,
            address: 'Manual Override'
          }
        });
        swipes.push({
          timestamp: recordData.lastOut,
          direction: 'OUT' as const,
          deviceId: 'override',
          location: {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            altitude: 0,
            address: 'Manual Override'
          }
        });
      }

      // Create new attendance record
      // Initialize all fields to match normal attendance record structure
      record = new AttendanceRecord({
        userId: new Types.ObjectId(data.userId),
        shiftId: shiftAssignment.shiftId,
        shiftCode: shiftAssignment.shiftCode,
        shiftDay,
        shiftStart: shiftAssignment.shiftStart,
        shiftEnd: shiftAssignment.shiftEnd,
        swipes, // Array with 2 entries (IN and OUT) for Present, empty for Absent/Holiday
        outOfWindowSwipes: [], // Empty for override (all swipes are within window)
        attendanceStatus: data.attendanceStatus as any,
        status: 'overridden' as any,
        needsRegularization: false, // Override doesn't need regularization
        isWithinWindow: true, // Override swipes are always within window
        isLateEntry: recordData.isLateEntry,
        isEarlyExit: recordData.isEarlyExit,
        firstIn: recordData.firstIn, // Set from shiftStart for Present, null for Absent/Holiday
        lastOut: recordData.lastOut, // Set from shiftEnd for Present, null for Absent/Holiday
        totalWorkHours: recordData.totalWorkHours,
        breakHours: recordData.breakHours,
        actualWorkHours: recordData.actualWorkHours,
        shiftHours: recordData.shiftHours,
        shortfallHours: recordData.shortfallHours,
        excessHours: recordData.excessHours,
        // Don't set regularization - override doesn't use regularization
        // Mongoose will create it with defaults, but we'll unset it after save
      });
    } else {
      // 9. Check if regularization is pending (use collection as source of truth; embedded field can be stale)
      const pendingReg = await AttendanceRegularization.findOne({
        attendanceId: record._id,
        status: 'Pending',
      });
      if (pendingReg) {
        throw new Error('Cannot override attendance with pending regularization');
      }

      // 10. Prepare override data based on target status
      const shiftAssignment = {
        shiftId: record.shiftId,
        shiftCode: record.shiftCode,
        shiftStart: record.shiftStart,
        shiftEnd: record.shiftEnd,
      };

      const overrideData = await this.prepareOverrideRecordData(
        data,
        shiftAssignment,
        shiftDay,
        targetStatus || 'Present',
        isPresent,
        isAbsent,
        isHoliday
      );

      // IMPORTANT: Original swipes are preserved in overrideHistory.changes for audit trail
      // The calculateChanges method will track swipe changes in the history
      
      // Create/update swipes array from calculated firstIn/lastOut
      // Only create swipes if firstIn and lastOut exist (Present status)
      // For Absent/Holiday-Swipe, swipes array will be empty
      const swipes: any[] = [];
      if (overrideData.firstIn && overrideData.lastOut) {
        swipes.push({
          timestamp: overrideData.firstIn,
          direction: 'IN' as const,
          deviceId: 'override',
          location: {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            altitude: 0,
            address: 'Manual Override'
          }
        });
        swipes.push({
          timestamp: overrideData.lastOut,
          direction: 'OUT' as const,
          deviceId: 'override',
          location: {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            altitude: 0,
            address: 'Manual Override'
          }
        });
      }

      // Update record with override data
      // Ensure all fields are set to match normal attendance record structure
      record.attendanceStatus = data.attendanceStatus as any;
      record.status = 'overridden' as any;
      record.swipes = swipes; // Array with 2 entries (IN and OUT) for Present, empty for Absent/Holiday
      if (!record.outOfWindowSwipes) {
        record.outOfWindowSwipes = []; // Initialize if not exists
      }
      record.needsRegularization = false; // Override doesn't need regularization
      record.isWithinWindow = true; // Override swipes are always within window
      record.isLateEntry = overrideData.isLateEntry;
      record.isEarlyExit = overrideData.isEarlyExit;
      record.firstIn = overrideData.firstIn; // Set from shiftStart for Present, null for Absent/Holiday
      record.lastOut = overrideData.lastOut; // Set from shiftEnd for Present, null for Absent/Holiday
      record.totalWorkHours = overrideData.totalWorkHours;
      record.breakHours = overrideData.breakHours;
      record.actualWorkHours = overrideData.actualWorkHours;
      record.shiftHours = overrideData.shiftHours;
      record.shortfallHours = overrideData.shortfallHours;
      record.excessHours = overrideData.excessHours;
      // Clear regularization object if it exists (override takes precedence)
      // We already checked for 'Pending' status above, so if we reach here, we can clear it
      if (record.regularization) {
        record.regularization = undefined;
      }
    }

    // 11. Set override object with complete history
    const now = new Date();
    record.override = {
      isOverridden: true,
      overriddenAt: isNewRecord ? now : (record.override?.overriddenAt || now),
      overriddenBy: adminId,
      lastModifiedAt: now,
      lastModifiedBy: adminId,
      reason: reason,
      remarks: data.remarks,
      originalStatus: isNewRecord ? undefined : originalStatus,
      originalAttendanceStatus: isNewRecord ? [] : originalAttendanceStatus,
      originalFirstIn: isNewRecord ? null : originalFirstIn,
      originalLastOut: isNewRecord ? null : originalLastOut,
      originalTotalWorkHours: isNewRecord ? '00:00:00' : originalTotalWorkHours,
      originalActualWorkHours: isNewRecord ? '00:00:00' : originalActualWorkHours,
      // Note: Original swipes are tracked in overrideHistory.changes for audit trail
      overrideHistory: [
        ...(record.override?.overrideHistory || []),
        {
          action: isNewRecord ? 'created' : 'modified',
          performedBy: adminId,
          performedAt: now,
          changes: isNewRecord ? [] : this.calculateChanges(
            originalStatus,
            record.status,
            originalAttendanceStatus,
            data.attendanceStatus,
            originalFirstIn,
            record.firstIn,
            originalLastOut,
            record.lastOut
          ),
          reason: reason,
        },
      ],
    };

    // 12. Save record
    await record.save();

    // 13. Unset regularization object if it was created with defaults (for new records only)
    // Override doesn't use regularization, so we should remove it
    if (isNewRecord && record.regularization) {
      record.regularization = undefined;
      await record.save();
    }

    return record;
  }

  /**
   * Update existing override
   */
  async updateOverride(
    attendanceRecordId: string,
    data: IUpdateOverride,
    adminId: Types.ObjectId
  ): Promise<IAttendanceRecord> {
    const record = await AttendanceRecord.findById(attendanceRecordId);
    if (!record) {
      throw new Error('Attendance record not found');
    }

    if (!record.override?.isOverridden) {
      throw new Error('Record is not overridden');
    }

    // Set default modification reason if not provided
    const modificationReason = data.modificationReason?.trim() || 'Override modified by administrator';

    // Store current values for history
    const currentStatus = record.status;
    const currentAttendanceStatus = [...record.attendanceStatus];
    const currentFirstIn = record.firstIn;
    const currentLastOut = record.lastOut;

    // Update fields
    if (data.attendanceStatus) {
      if (!data.attendanceStatus.includes('Override')) {
        throw new Error('attendanceStatus must include "Override"');
      }
      record.attendanceStatus = data.attendanceStatus as any;
    }

    if (data.status) {
      record.status = data.status as any;
    }

    if (data.reason) {
      record.override.reason = data.reason;
    }

    if (data.remarks !== undefined) {
      record.override.remarks = data.remarks;
    }

    if (data.firstIn) {
      record.firstIn = new Date(data.firstIn);
    }

    if (data.lastOut) {
      record.lastOut = new Date(data.lastOut);
    }

    if (data.totalWorkHours) {
      record.totalWorkHours = data.totalWorkHours;
    }

    if (data.actualWorkHours) {
      record.actualWorkHours = data.actualWorkHours;
    }

    // Update override metadata
    const now = new Date();
    record.override.lastModifiedAt = now;
    record.override.lastModifiedBy = adminId;

    // Add to history
    if (!record.override.overrideHistory) {
      record.override.overrideHistory = [];
    }
    record.override.overrideHistory.push({
      action: 'modified',
      performedBy: adminId,
      performedAt: now,
      changes: this.calculateChanges(
        currentStatus,
        data.status || currentStatus,
        currentAttendanceStatus,
        data.attendanceStatus || currentAttendanceStatus,
        currentFirstIn,
        data.firstIn ? new Date(data.firstIn) : currentFirstIn,
        currentLastOut,
        data.lastOut ? new Date(data.lastOut) : currentLastOut
      ),
      reason: modificationReason,
    });

    await record.save();
    return record;
  }

  /**
   * Remove override
   */
  async removeOverride(
    attendanceRecordId: string,
    adminId: Types.ObjectId,
    reason?: string,
    restoreOriginal: boolean = true
  ): Promise<IAttendanceRecord> {
    const record = await AttendanceRecord.findById(attendanceRecordId);
    if (!record) {
      throw new Error('Attendance record not found');
    }

    if (!record.override?.isOverridden) {
      throw new Error('Record is not overridden');
    }

    // Store original values
    const originalStatus = record.override.originalStatus;
    const originalAttendanceStatus = record.override.originalAttendanceStatus || [];
    const originalFirstIn = record.override.originalFirstIn;
    const originalLastOut = record.override.originalLastOut;

    // Restore original values if requested
    if (restoreOriginal && originalStatus) {
      record.status = originalStatus as any;
    }
    if (restoreOriginal && originalAttendanceStatus.length > 0) {
      record.attendanceStatus = originalAttendanceStatus as any;
    } else {
      // Remove 'Override' from attendanceStatus
      record.attendanceStatus = record.attendanceStatus.filter(s => s !== 'Override') as any;
    }

    if (restoreOriginal && originalFirstIn !== undefined) {
      record.firstIn = originalFirstIn;
    }
    if (restoreOriginal && originalLastOut !== undefined) {
      record.lastOut = originalLastOut;
    }

    // Add to history
    const now = new Date();
    if (!record.override.overrideHistory) {
      record.override.overrideHistory = [];
    }
    record.override.overrideHistory.push({
      action: 'removed',
      performedBy: adminId,
      performedAt: now,
      changes: [],
      reason: reason || 'Override removed',
    });

    // Clear override (but keep history)
    record.override.isOverridden = false;
    record.override.lastModifiedAt = now;
    record.override.lastModifiedBy = adminId;

    await record.save();
    return record;
  }

  /**
   * Get override history
   */
  async getOverrideHistory(query: {
    userId?: string;
    startDate?: string;
    endDate?: string;
    overriddenBy?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, startDate, endDate, overriddenBy, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const filter: any = {
      'override.isOverridden': true,
    };

    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }

    if (startDate || endDate) {
      filter.shiftDay = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        filter.shiftDay.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        filter.shiftDay.$lte = end;
      }
    }

    if (overriddenBy) {
      filter['override.overriddenBy'] = new Types.ObjectId(overriddenBy);
    }

    const [records, total] = await Promise.all([
      AttendanceRecord.find(filter)
        .populate('userId', 'name employeeCode')
        .populate('override.overriddenBy', 'name email')
        .populate('override.lastModifiedBy', 'name email')
        .sort({ 'override.overriddenAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AttendanceRecord.countDocuments(filter),
    ]);

    return {
      success: true,
      data: records,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get override details for a specific attendance record
   */
  async getOverrideDetails(attendanceRecordId: string) {
    const record = await AttendanceRecord.findById(attendanceRecordId)
      .populate('userId', 'name employeeCode')
      .populate('override.overriddenBy', 'name email')
      .populate('override.lastModifiedBy', 'name email');

    if (!record) {
      throw new Error('Attendance record not found');
    }

    if (!record.override?.isOverridden) {
      throw new Error('Record is not overridden');
    }

    return {
      success: true,
      data: {
        attendanceRecord: record,
        user: {
          name: (record.userId as any)?.name,
          employeeCode: (record.userId as any)?.employeeCode,
        },
        overriddenBy: {
          name: (record.override.overriddenBy as any)?.name,
          email: (record.override.overriddenBy as any)?.email,
        },
        lastModifiedBy: record.override.lastModifiedBy ? {
          name: (record.override.lastModifiedBy as any)?.name,
          email: (record.override.lastModifiedBy as any)?.email,
        } : undefined,
        overrideHistory: record.override.overrideHistory || [],
      },
    };
  }

  /**
   * Handle On-Leave override with leave system integration
   */
  private async handleOnLeaveOverride(
    userId: string,
    shiftDay: Date,
    leaveTypeId: string | undefined,
    leaveReason: string | undefined,
    adminId: Types.ObjectId,
    reason: string
  ): Promise<{
    attendanceRecord: IAttendanceRecord;
    leaveRequest?: any;
    wasAbsent: boolean; // True if marked as Absent due to no leave balance
  }> {
    // Import Leave and LeaveSummary models
    const { Leave } = await import('../models/leave.model');
    const { LeaveService } = await import('./leave.service');
    const { LeaveSummaryService } = await import('./leave-summary.service');

    // Step 1: Check if leave request exists for this date
    // Normalize shiftDay to start of day for comparison
    const dayStart = new Date(shiftDay);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(shiftDay);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const existingLeave = await Leave.findOne({
      userId: new Types.ObjectId(userId),
      startDate: { $lte: dayEnd },
      endDate: { $gte: dayStart },
      status: { $in: ['Pending', 'Approved'] },
    });

    let leaveRequest = existingLeave;

    if (existingLeave) {
      if (existingLeave.status === 'Approved') {
        // Leave already approved - use it
      } else if (existingLeave.status === 'Pending') {
        // Leave exists but pending - approve it
        // Get admin user details
        const adminUser = await User.findById(adminId).select('name email');
        if (!adminUser) {
          throw new Error('Admin user not found');
        }

        const leaveService = new LeaveService(this.context);
        const updateData = {
          status: 'Approved' as const,
          approvedById: adminId,
          approvedBy: {
            _id: adminId.toString(),
            name: adminUser.name || 'Administrator',
            email: adminUser.email || 'admin@company.com',
          },
          remarks: `Auto-approved via attendance override. Reason: ${reason}`,
        };
        leaveRequest = await leaveService.updateStatus(existingLeave._id, updateData) as any;
        
        // Note: Leave approval automatically creates attendance records via updateStatus()
      }
    } else {
      // Step 2: No leave exists - need to create and approve
      if (!leaveTypeId) {
        throw new Error('leaveTypeId is required when creating new leave request for On-Leave override');
      }

      // Step 3: Check leave balance BEFORE creating leave
      const year = shiftDay.getFullYear();
      const leaveSummaryService = new LeaveSummaryService(this.context);
      const leaveSummary = await leaveSummaryService.getLeaveSummary(
        new Types.ObjectId(userId),
        year
      );

      // Get leave type details to check balance
      const { LOV } = await import('../models/lov.model');
      const leaveType = await LOV.findById(leaveTypeId);
      if (!leaveType) {
        throw new Error('Leave type not found');
      }

      // Get leave type name from Lov (first active value)
      const leaveTypeValue = leaveType.values.find((v: any) => v.isActive !== false) || leaveType.values[0];
      if (!leaveTypeValue) {
        throw new Error('No active leave type value found in Lov');
      }
      const leaveTypeName = leaveTypeValue.value.toLowerCase(); // e.g., 'annual', 'sick'

      // Check available balance
      const leaveCategory = leaveSummary[leaveTypeName as keyof typeof leaveSummary] as any;
      if (!leaveCategory) {
        throw new Error(`Leave category '${leaveTypeName}' not found in leave summary`);
      }
      const availableBalance = (leaveCategory.alloted || 0) - (leaveCategory.availed || 0);

      if (availableBalance <= 0) {
        // No leave balance - mark as Absent instead
        return {
          attendanceRecord: await this.createAbsentOverride(userId, shiftDay, adminId, reason, 'No leave balance available'),
          wasAbsent: true,
        };
      }

      // Step 4: Create leave request
      // Get admin user details for appliedTo
      const adminUser = await User.findById(adminId).select('name email');
      if (!adminUser) {
        throw new Error('Admin user not found');
      }

      const leaveService = new LeaveService(this.context);
      // Calculate noOfDays (for single day, it's always 1)
      const noOfDays = 1; // Single day override

      const leaveData = {
        userId,
        leaveTypeId,
        startDate: shiftDay,
        endDate: shiftDay,
        reason: leaveReason || reason,
        leaveDuration: 'full-day' as const,
        appliedTo: {
          _id: adminId.toString(),
          name: adminUser.name || 'Administrator',
        },
        noOfDays, // Full day leave (1 day)
      };

      // Create leave - this will reserve the balance (add to availed)
      leaveRequest = await leaveService.create(leaveData as any) as any;

      // Step 5: Immediately approve the leave
      // Note: Balance is already reserved in create(), approval just marks attendance
      const updateData = {
        status: 'Approved' as const,
        approvedById: adminId,
        approvedBy: {
          _id: adminId.toString(),
          name: adminUser.name || 'Administrator',
          email: adminUser.email || 'admin@company.com',
        },
        remarks: `Auto-approved via attendance override. Reason: ${reason}`,
      };

      if (!leaveRequest || !leaveRequest._id) {
        throw new Error('Failed to create leave request');
      }

      leaveRequest = await leaveService.updateStatus(leaveRequest._id, updateData) as any;
      
      // Note: Leave approval automatically creates attendance records via updateStatus()
      // So we don't need to create them manually - they're already created
    }

    // Step 6: Update attendance record created by leave approval
    // Note: Leave approval (updateStatus) already creates attendance records with ['On-Leave']
    // We need to add 'Override' to the attendanceStatus and set override object
    let record = await AttendanceRecord.findOne({
      userId: new Types.ObjectId(userId),
      shiftDay,
    });

    if (!record) {
      // This shouldn't happen if leave approval worked correctly, but handle it
      throw new Error('Attendance record not found after leave approval. Leave approval may have failed.');
    }

    const isNewRecord = false; // Record was created by leave approval
    const originalStatus = record.status;
    const originalAttendanceStatus = record.attendanceStatus ? [...record.attendanceStatus] : [];
    const originalFirstIn = record.firstIn || null;
    const originalLastOut = record.lastOut || null;
    const originalTotalWorkHours = record.totalWorkHours || '00:00:00';
    const originalActualWorkHours = record.actualWorkHours || '00:00:00';

    // Update attendance record to include Override
    // Remove 'On-Leave' if it exists, then add both 'Override' and 'On-Leave'
    record.attendanceStatus = record.attendanceStatus.filter(s => s !== 'On-Leave') as any;
    record.attendanceStatus.push('Override', 'On-Leave');
    record.status = 'leave_swipe' as any;
    
    // Ensure work hours are zero (leave approval may not set these)
    record.firstIn = null;
    record.lastOut = null;
    record.totalWorkHours = '00:00:00';
    record.breakHours = '00:00:00';
    record.actualWorkHours = '00:00:00';
    record.shortfallHours = '00:00:00';
    record.excessHours = '00:00:00';
    record.needsRegularization = false;

    // Ensure shift fields are set (leave approval may not set these)
    if (!record.shiftId || !record.shiftCode) {
      const shiftAssignment = await this.getShiftAssignment(userId, shiftDay);
      if (shiftAssignment) {
        record.shiftId = shiftAssignment.shiftId;
        record.shiftCode = shiftAssignment.shiftCode;
        record.shiftStart = shiftAssignment.shiftStart;
        record.shiftEnd = shiftAssignment.shiftEnd;
      }
    }

    // Step 7: Set override object
    const now = new Date();
    record.override = {
      isOverridden: true,
      overriddenAt: isNewRecord ? now : (record.override?.overriddenAt || now),
      overriddenBy: adminId,
      lastModifiedAt: now,
      lastModifiedBy: adminId,
      reason: reason,
      remarks: `On-Leave override. Leave Request ID: ${leaveRequest?._id || 'N/A'}`,
      originalStatus: isNewRecord ? undefined : originalStatus,
      originalAttendanceStatus: isNewRecord ? [] : originalAttendanceStatus,
      originalFirstIn: isNewRecord ? null : originalFirstIn,
      originalLastOut: isNewRecord ? null : originalLastOut,
      originalTotalWorkHours: isNewRecord ? '00:00:00' : originalTotalWorkHours,
      originalActualWorkHours: isNewRecord ? '00:00:00' : originalActualWorkHours,
      overrideHistory: [
        ...(record.override?.overrideHistory || []),
        {
          action: isNewRecord ? 'created' : 'modified',
          performedBy: adminId,
          performedAt: now,
          changes: isNewRecord ? [] : this.calculateChanges(
            originalStatus,
            'leave_swipe',
            originalAttendanceStatus,
            ['Override', 'On-Leave'],
            originalFirstIn,
            null,
            originalLastOut,
            null
          ),
          reason: reason,
        },
      ],
    };

    await record.save();

    return {
      attendanceRecord: record,
      leaveRequest,
      wasAbsent: false,
    };
  }

  /**
   * Helper: Create Absent override (used when no leave balance)
   */
  private async createAbsentOverride(
    userId: string,
    shiftDay: Date,
    adminId: Types.ObjectId,
    reason: string,
    additionalReason: string
  ): Promise<IAttendanceRecord> {
    // Find or create attendance record
    let record = await AttendanceRecord.findOne({
      userId: new Types.ObjectId(userId),
      shiftDay,
    });

    const isNewRecord = !record;
    const originalStatus = record?.status;
    const originalAttendanceStatus = record?.attendanceStatus ? [...record.attendanceStatus] : [];
    const originalFirstIn = record?.firstIn || null;
    const originalLastOut = record?.lastOut || null;
    const originalTotalWorkHours = record?.totalWorkHours || '00:00:00';
    const originalActualWorkHours = record?.actualWorkHours || '00:00:00';

    if (!record) {
      const shiftAssignment = await this.getShiftAssignment(userId, shiftDay);
      if (!shiftAssignment) {
        throw new Error('No shift assignment found for the user on this date');
      }

      record = new AttendanceRecord({
        userId: new Types.ObjectId(userId),
        shiftId: shiftAssignment.shiftId,
        shiftCode: shiftAssignment.shiftCode,
        shiftDay,
        shiftStart: shiftAssignment.shiftStart,
        shiftEnd: shiftAssignment.shiftEnd,
        swipes: [],
        attendanceStatus: ['Override', 'Absent'],
        status: 'incomplete',
        needsRegularization: false,
        isWithinWindow: true,
        isLateEntry: false,
        isEarlyExit: false,
        firstIn: null,
        lastOut: null,
        totalWorkHours: '00:00:00',
        breakHours: '00:00:00',
        actualWorkHours: '00:00:00',
        shiftHours: '09:00:00',
        shortfallHours: '09:00:00',
        excessHours: '00:00:00',
      });
    } else {
      record.attendanceStatus = ['Override', 'Absent'] as any;
      record.status = 'incomplete' as any;
      record.firstIn = null;
      record.lastOut = null;
      record.totalWorkHours = '00:00:00';
      record.breakHours = '00:00:00';
      record.actualWorkHours = '00:00:00';
      record.shortfallHours = '09:00:00';
      record.excessHours = '00:00:00';
    }

    const now = new Date();
    record.override = {
      isOverridden: true,
      overriddenAt: isNewRecord ? now : (record.override?.overriddenAt || now),
      overriddenBy: adminId,
      lastModifiedAt: now,
      lastModifiedBy: adminId,
      reason: `${reason}. ${additionalReason}`,
      remarks: additionalReason,
      originalStatus: isNewRecord ? undefined : originalStatus,
      originalAttendanceStatus: isNewRecord ? [] : originalAttendanceStatus,
      originalFirstIn: isNewRecord ? null : originalFirstIn,
      originalLastOut: isNewRecord ? null : originalLastOut,
      originalTotalWorkHours: isNewRecord ? '00:00:00' : originalTotalWorkHours,
      originalActualWorkHours: isNewRecord ? '00:00:00' : originalActualWorkHours,
      overrideHistory: [
        ...(record.override?.overrideHistory || []),
        {
          action: isNewRecord ? 'created' : 'modified',
          performedBy: adminId,
          performedAt: now,
          changes: isNewRecord ? [] : this.calculateChanges(
            originalStatus,
            'incomplete',
            originalAttendanceStatus,
            ['Override', 'Absent'],
            originalFirstIn,
            null,
            originalLastOut,
            null
          ),
          reason: `${reason}. ${additionalReason}`,
        },
      ],
    };

    await record.save();
    return record;
  }

  /**
   * Helper: Get shift assignment for user and date
   * Uses BiometricAttendanceService method for consistency
   */
  private async getShiftAssignment(userId: string, shiftDay: Date) {
    // Use BiometricAttendanceService to get shift assignment (consistent with other services)
    const { BiometricAttendanceService } = await import('./biometric-attendance.service');
    const biometricService = new BiometricAttendanceService(this.context);
    
    // Get user to determine country for timezone conversion
    const user = await User.findById(userId).select('country');
    if (!user) {
      throw new Error('User not found');
    }

    try {
      // Use the same method as biometric service
      const shiftAssignment = await (biometricService as any).getCurrentShiftAssignment(
        new Types.ObjectId(userId),
        shiftDay
      );

      if (!shiftAssignment || !shiftAssignment.shiftId) {
        return null;
      }

      // Get shift timings using biometric service method
      const shiftWindow = (biometricService as any).getShiftTimings(
        shiftAssignment.shiftId,
        shiftDay,
        user.country
      );

      return {
        shiftId: shiftAssignment.shiftId._id || shiftAssignment.shiftId,
        shiftCode: shiftAssignment.shiftCode,
        shiftStart: shiftWindow.shiftStart,
        shiftEnd: shiftWindow.shiftEnd,
      };
    } catch (error: any) {
      console.error('Error getting shift assignment:', error);
      return null;
    }
  }

  /**
   * Helper: Prepare record data based on override status
   * Uses the same calculation method as BiometricAttendanceService for consistency
   */
  private async prepareOverrideRecordData(
    data: ICreateOverride,
    shiftAssignment: any,
    shiftDay: Date,
    _targetStatus: string,
    isPresent: boolean,
    isAbsent: boolean,
    isHoliday: boolean
  ): Promise<{
    status: string;
    firstIn: Date | null;
    lastOut: Date | null;
    totalWorkHours: string;
    breakHours: string;
    actualWorkHours: string;
    shiftHours: string;
    shortfallHours: string;
    excessHours: string;
    isLateEntry: boolean;
    isEarlyExit: boolean;
  }> {
    const shiftStart = shiftAssignment.shiftStart;
    const shiftEnd = shiftAssignment.shiftEnd;
    
    // Handle different override statuses
    if (isPresent) {
      // Present: Always use shift start and end times (calculated from shift assignment)
      // Frontend no longer passes firstIn/lastOut - backend calculates from shift
      const firstIn = new Date(shiftStart);
      const lastOut = new Date(shiftEnd);

      // Use BiometricAttendanceService's calculateAttendanceMetrics for consistency
      const { BiometricAttendanceService } = await import('./biometric-attendance.service');
      const biometricService = new BiometricAttendanceService(this.context);
      
      // Use the same calculation method as normal attendance processing
      const metrics = await (biometricService as any).calculateAttendanceMetrics(
        firstIn,
        lastOut,
        shiftStart,
        shiftEnd
      );

      // For override, firstIn = shiftStart and lastOut = shiftEnd, so no late/early
      const isLateEntry = false; // Override uses exact shift times
      const isEarlyExit = false; // Override uses exact shift times

      return {
        status: 'complete', // Always complete for Present override
        firstIn,
        lastOut,
        totalWorkHours: metrics.totalWorkHours,
        breakHours: metrics.breakHours,
        actualWorkHours: metrics.actualWorkHours,
        shiftHours: metrics.shiftHours,
        shortfallHours: metrics.shortfallHours,
        excessHours: metrics.excessHours,
        isLateEntry,
        isEarlyExit,
      };
    } else if (isAbsent) {
      // Absent: No work hours
      // Calculate shift hours using the same method
      const { BiometricAttendanceService } = await import('./biometric-attendance.service');
      const biometricService = new BiometricAttendanceService(this.context);
      const shiftMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60);
      const shiftHoursStr = await (biometricService as any).formatDuration(shiftMinutes);
      
      return {
        status: 'incomplete',
        firstIn: null,
        lastOut: null,
        totalWorkHours: '00:00:00',
        breakHours: '00:00:00',
        actualWorkHours: '00:00:00',
        shiftHours: shiftHoursStr,
        shortfallHours: shiftHoursStr, // Full shift is shortfall for absent
        excessHours: '00:00:00',
        isLateEntry: false,
        isEarlyExit: false,
      };
    } else if (isHoliday) {
      // Holiday: No work hours
      // Calculate shift hours using the same method
      const { BiometricAttendanceService } = await import('./biometric-attendance.service');
      const biometricService = new BiometricAttendanceService(this.context);
      const shiftMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60);
      const shiftHoursStr = await (biometricService as any).formatDuration(shiftMinutes);
      
      return {
        status: 'holiday_swipe',
        firstIn: null,
        lastOut: null,
        totalWorkHours: '00:00:00',
        breakHours: '00:00:00',
        actualWorkHours: '00:00:00',
        shiftHours: shiftHoursStr,
        shortfallHours: '00:00:00', // No shortfall for holiday
        excessHours: '00:00:00',
        isLateEntry: false,
        isEarlyExit: false,
      };
    } else {
      // Default: Present behavior
      return this.prepareOverrideRecordData(
        { ...data, attendanceStatus: ['Override', 'Present'] },
        shiftAssignment,
        shiftDay,
        'Present',
        true,
        false,
        false
      );
    }
  }

  /**
   * Helper: Calculate changes for history
   * Updated to include firstIn/lastOut tracking
   */
  private calculateChanges(
    oldStatus: string | undefined,
    newStatus: string | undefined,
    oldAttendanceStatus: string[],
    newAttendanceStatus: string[],
    oldFirstIn?: Date | null,
    newFirstIn?: Date | null,
    oldLastOut?: Date | null,
    newLastOut?: Date | null
  ): Array<{ field: string; oldValue: any; newValue: any }> {
    const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];

    if (oldStatus !== newStatus) {
      changes.push({
        field: 'status',
        oldValue: oldStatus,
        newValue: newStatus,
      });
    }

    const oldSet = new Set(oldAttendanceStatus);
    const newSet = new Set(newAttendanceStatus);
    const added = newAttendanceStatus.filter(s => !oldSet.has(s));
    const removed = oldAttendanceStatus.filter(s => !newSet.has(s));

    if (added.length > 0 || removed.length > 0) {
      changes.push({
        field: 'attendanceStatus',
        oldValue: oldAttendanceStatus,
        newValue: newAttendanceStatus,
      });
    }

    // Track firstIn changes
    if (oldFirstIn?.getTime() !== newFirstIn?.getTime()) {
      changes.push({
        field: 'firstIn',
        oldValue: oldFirstIn ? oldFirstIn.toISOString() : null,
        newValue: newFirstIn ? newFirstIn.toISOString() : null,
      });
    }

    // Track lastOut changes
    if (oldLastOut?.getTime() !== newLastOut?.getTime()) {
      changes.push({
        field: 'lastOut',
        oldValue: oldLastOut ? oldLastOut.toISOString() : null,
        newValue: newLastOut ? newLastOut.toISOString() : null,
      });
    }

    return changes;
  }

  /**
   * Helper: Get default reason based on status
   */
  private getDefaultReason(status: string): string {
    const defaultReasons: Record<string, string> = {
      'Present': 'Attendance manually overridden by administrator - Marked as Present',
      'Absent': 'Attendance manually overridden by administrator - Marked as Absent',
      'On-Leave': 'Attendance manually overridden by administrator - Marked as On-Leave',
      'Holiday-Swipe': 'Attendance manually overridden by administrator - Marked as Holiday',
    };
    return defaultReasons[status] || 'Attendance manually overridden by administrator';
  }
}

