import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { IUser, User } from '../models';
import { FilterQuery, Types } from 'mongoose';
import { IPermission, Permission } from '../models/permission.model';
import { PermissionSummaryService } from './permission-summary.service';
import { generateEmailTemplate } from '../emails/templates';
import { emailService } from './email.service';

export interface IPermissionCreate {
  userId: string | Types.ObjectId;
  permissionDate: Date;
  hours: number;
  remarks?: string;
  reason: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
}

export interface IPermissionQuery {
  userId?: string | Types.ObjectId;
  status?: 'Pending' | 'Approved' | 'Rejected';
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
  sortBy?: keyof IPermission;
  search?: string;
  appliedTo?: string;
}

export interface IPermissionStatusUpdate {
  status: 'Approved' | 'Rejected' | 'Cancelled';
  remarks?: string;
  approvedById: Types.ObjectId;
  approvedBy?: {
    _id: string | Types.ObjectId;
    name: string;
    email: string;
  };
}

export class PermissionService extends BaseService {
  private permissionSummaryService: PermissionSummaryService;

  constructor(context: RequestContext) {
    super(context);
    this.permissionSummaryService = new PermissionSummaryService(context);
  }

  async findById(id: string | Types.ObjectId): Promise<IPermission> {
    const permission = await Permission.findById(id);
    if (!permission) {
      throw new Error('Permission request not found');
    }

    const [user, approver] = await Promise.all([
      User.findById(permission.userId).select('name email'),
      permission.approvedById ? User.findById(permission.approvedById).select('name email') : null,
    ]);

    if (user) {
      permission.user = {
        name: user.name,
        email: user.email,
      };
    }

    if (approver) {
      permission.approvedBy = {
        _id: approver._id,
        name: approver.name,
        email: approver.email,
      };
    }

    return permission;
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
  }): Promise<{ permissions: IPermission[]; total: number; meta: { page: number; limit: number; total: number; totalPages: number } }> {
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
          { employeeCode: { $regex: escapedSearch, $options: 'i' } },
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
        permissionDate: {}
      };
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        dateFilter.permissionDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        dateFilter.permissionDate.$lte = end;
      }

      // Combine date filter with existing filters
      if (filter.$and) {
        filter.$and.push(dateFilter);
      } else {
        Object.assign(filter, dateFilter);
      }
    }

    const [permissions, total] = await Promise.all([
      Permission.find(filter as FilterQuery<IPermission>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Permission.countDocuments(filter as FilterQuery<IPermission>),
    ]);

    const populatedPermissions = await Promise.all(
      permissions.map(async (permission) => {
        const [user, approver] = await Promise.all([
          User.findById(permission.userId).select('name email'),
          permission.approvedById ? User.findById(permission.approvedById).select('name email') : null,
        ]);

        if (user) {
          permission.user = {
            name: user.name,
            email: user.email,
          };
        }

        if (approver) {
          permission.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        return permission;
      })
    );

    return {
      permissions: populatedPermissions,
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
  ): Promise<{ permissions: IPermission[]; total: number }> {
    const { search, status, startDate, endDate } = filters;
    const { page = 1, limit = 10, sortBy = 'permissionDate', sortOrder = 'desc' } = options;

    const query: any = { userId };
    const skip = (page - 1) * limit;

    if (status) {
      query.status = status;
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { reason: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      query.permissionDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        query.permissionDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        query.permissionDate.$lte = end;
      }
    }

    const [permissions, total] = await Promise.all([
      Permission.find(query as FilterQuery<IPermission>)
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(limit),
      Permission.countDocuments(query as FilterQuery<IPermission>),
    ]);

    const populatedPermissions = await Promise.all(
      permissions.map(async (permission) => {
        const [user, approver] = await Promise.all([
          User.findById(permission.userId).select('name email'),
          permission.approvedById ? User.findById(permission.approvedById).select('name email') : null,
        ]);

        if (user) {
          permission.user = {
            name: user.name,
            email: user.email,
          };
        }

        if (approver) {
          permission.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        return permission;
      })
    );

    return {
      permissions: populatedPermissions,
      total,
    };
  }

  async create(permissionData: IPermissionCreate): Promise<IPermission> {
    const user = await User.findById(permissionData.userId).select('name email');
    if (!user) {
      throw new Error('User not found');
    }

    const permissionDate = new Date(permissionData.permissionDate);
    const year = permissionDate.getFullYear();
    const month = permissionDate.getMonth() + 1; // 1-12

    // Get monthly balance
    const balance = await this.permissionSummaryService.getMonthlyPermissionBalance(
      new Types.ObjectId(permissionData.userId.toString()),
      year,
      month
    );

    // Calculate total hours used this month (only approved permissions)
    const totalUsedThisMonth = await this.getTotalHoursUsedInMonth(
      new Types.ObjectId(permissionData.userId.toString()),
      year,
      month
    );

    // Calculate pending hours for the same month (excluding rejected and cancelled)
    const pendingHours = await this.getPendingHoursInMonth(
      new Types.ObjectId(permissionData.userId.toString()),
      year,
      month
    );

    const requestedHours = permissionData.hours;
    // Available balance = Alloted - Availed - Pending
    const availableHours = balance.alloted - totalUsedThisMonth - pendingHours;

    // Check if requested hours exceed remaining balance
    if (requestedHours > availableHours) {
      throw new Error(
        `Insufficient permission balance. ` +
        `Allocated: ${balance.alloted} hrs, ` +
        `Availed: ${totalUsedThisMonth.toFixed(1)} hrs, ` +
        `Pending: ${pendingHours.toFixed(1)} hrs, ` +
        `Available: ${availableHours.toFixed(1)} hrs. ` +
        `Requested: ${requestedHours} hrs exceeds available balance.`
      );
    }

    // Check for duplicate permission on same date
    const dateStart = new Date(permissionDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(permissionDate);
    dateEnd.setHours(23, 59, 59, 999);

    const existingPermission = await Permission.findOne({
      userId: permissionData.userId,
      permissionDate: {
        $gte: dateStart,
        $lte: dateEnd,
      },
      status: { $nin: ['Rejected', 'Cancelled'] },
    });

    if (existingPermission) {
      throw new Error('Permission already exists for this date');
    }

    const permission: IPermission = await Permission.create(permissionData);

    // Update permission summary when permission is created (only track, don't deduct yet - will deduct on approval)
    // Note: We track pending requests but only deduct approved hours from balance
    await this.permissionSummaryService.createOrUpdatePermissionSummary(
      new Types.ObjectId(permission.userId.toString()),
      year,
      month,
      {
        permissionRequestId: permission._id as Types.ObjectId,
      }
    );

    // Send email to manager
    const manager: IUser = await User.findById(
      new Types.ObjectId(permission.appliedTo?._id)
    ).select('name email');

    if (manager) {
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const htmlContent = generateEmailTemplate('leaveApplyEmail', {
        managerName: manager.name,
        employeeName: user.name,
        leaveType: 'Permission',
        fromDate: permission.permissionDate.toDateString(),
        toDate: permission.permissionDate.toDateString(),
        totalDays: `${permission.hours} hours`,
        reason: permission.reason,
        approvalLink: `${appUrl}/manager/actions/permissions/${permission._id}`,
        companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
      });

      await emailService.sendEmail({
        body: {
          to: manager.email,
          subject: `Permission Request from ${user.name}`,
          text: `${user.name} has requested ${permission.hours} hours permission on ${permission.permissionDate.toDateString()}.`,
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
          const permissionDateFormatted = permission.permissionDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });

          const adminEmailText = `Dear Admin,

A permission request has been submitted by ${user.name}.

Request Details:
- Employee: ${user.name} (${user.email || 'N/A'})
- Date: ${permissionDateFormatted}
- Duration: ${permission.hours} hours
- Reason: ${permission.reason || 'N/A'}
- Status: Pending
- Manager: ${manager?.name || 'N/A'}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `Permission Request Submitted - ${user.name}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for permission request ${permission._id}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for permission request:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    return this.findById(permission._id as string);
  }

  async updateStatus(id: string | Types.ObjectId, updateData: IPermissionStatusUpdate): Promise<IPermission> {
    const permission = await Permission.findById(id);
    if (!permission) {
      throw new Error('Permission request not found');
    }

    if (permission.status !== 'Pending') {
      throw new Error('Permission request has already been processed');
    }

    permission.status = updateData.status;
    permission.approvedById = updateData.approvedById;
    permission.approvedBy = updateData.approvedBy
      ? {
        _id: typeof updateData.approvedBy._id === 'string'
          ? updateData.approvedBy._id
          : updateData.approvedBy._id.toString(),
        name: updateData.approvedBy.name,
        email: updateData.approvedBy.email,
      }
      : undefined;

    if (updateData.status === 'Approved') {
      permission.approvedAt = new Date();
    } else if (updateData.status === 'Rejected') {
      permission.rejectedAt = new Date();
    } else if (updateData.status === 'Cancelled') {
      permission.cancelledAt = new Date();
    }

    if (updateData.remarks) permission.remarks = updateData.remarks;
    await permission.save();

    // Update permission summary based on status change
    const permissionDate = new Date(permission.permissionDate);
    const year = permissionDate.getFullYear();
    const month = permissionDate.getMonth() + 1;

    // Recalculate total hours used this month (only approved permissions)
    const totalUsedThisMonth = await this.getTotalHoursUsedInMonth(
      new Types.ObjectId(permission.userId.toString()),
      year,
      month
    );

    // Update summary with new availed hours
    await this.permissionSummaryService.createOrUpdatePermissionSummary(
      new Types.ObjectId(permission.userId.toString()),
      year,
      month,
      {
        availed: totalUsedThisMonth,
      }
    );

    // Send email notification to employee (the person who applied)
    try {
      const employee: IUser = await User.findById(new Types.ObjectId(permission.userId)).select('name email');
      const approver: IUser = await User.findById(permission.approvedById).select('name email');

      if (employee && employee.email) {
        const permissionDateFormatted = permission.permissionDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        const htmlContent = generateEmailTemplate('leaveApprovalEmail', {
          employeeName: employee.name,
          approverName: approver?.name || 'Manager',
          leaveType: 'Permission',
          fromDate: permissionDateFormatted,
          toDate: permissionDateFormatted,
          totalDays: `${permission.hours} hours`,
          remarks: permission.remarks || '',
          status: permission.status,
          companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
        });

        const emailText = `Dear ${employee.name},

Your permission request has been ${permission.status.toLowerCase()} by ${approver?.name || 'Manager'}.

Permission Details:
- Date: ${permissionDateFormatted}
- Duration: ${permission.hours} hours
- Reason: ${permission.reason || 'N/A'}
${permission.remarks ? `- Remarks: ${permission.remarks}` : ''}

${permission.status === 'Approved'
            ? 'Your permission request has been approved. Please ensure you coordinate with your team regarding your absence.'
            : 'Unfortunately, your permission request has been rejected. If you have any questions, please contact your manager.'}

Thank you for your understanding.

Regards,
${approver?.name || 'Manager'}
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

        await emailService.sendEmail({
          body: {
            to: employee.email,
            subject: `Your Permission Request has been ${permission.status}`,
            text: emailText,
            html: htmlContent,
          },
        });

        console.log(`Email notification sent to ${employee.email} for permission request ${permission._id} - Status: ${permission.status}`);
      } else {
        console.warn(`Cannot send email: Employee not found or email missing for userId: ${permission.userId}`);
      }
    } catch (emailError) {
      console.error('Failed to send email to employee for permission request:', emailError);
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
        const employee: IUser = await User.findById(new Types.ObjectId(permission.userId)).select('name email');
        const approver: IUser = await User.findById(permission.approvedById).select('name email');

        const permissionDateFormatted = permission.permissionDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        const adminEmails = admins.map(admin => admin.email).filter(Boolean);

        if (adminEmails.length > 0) {
          const adminEmailText = `Dear Admin,

A permission request has been ${permission.status.toLowerCase()} by ${approver?.name || 'Manager'}.

Request Details:
- Employee: ${employee?.name || 'N/A'} (${employee?.email || 'N/A'})
- Date: ${permissionDateFormatted}
- Duration: ${permission.hours} hours
- Reason: ${permission.reason || 'N/A'}
- Status: ${permission.status}
${permission.remarks ? `- Remarks: ${permission.remarks}` : ''}
- Approved/Rejected By: ${approver?.name || 'Manager'}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `Permission Request ${permission.status} - ${employee?.name || 'Employee'}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for permission request ${permission._id} - Status: ${permission.status}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for permission request:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    return this.findById(permission._id as string);
  }

  async cancel(id: string | Types.ObjectId, userId: Types.ObjectId): Promise<{ message: string }> {
    const permission = await Permission.findById(id);
    if (!permission) {
      throw new Error('Permission request not found');
    }

    if (permission.userId.toString() !== userId.toString()) {
      throw new Error('You can only cancel your own permission requests');
    }

    if (permission.status !== 'Pending') {
      throw new Error('Only pending permission requests can be cancelled');
    }

    permission.status = 'Cancelled';
    permission.cancelledAt = new Date();
    await permission.save();

    // Update summary
    const permissionDate = new Date(permission.permissionDate);
    const year = permissionDate.getFullYear();
    const month = permissionDate.getMonth() + 1;

    const totalUsedThisMonth = await this.getTotalHoursUsedInMonth(
      new Types.ObjectId(permission.userId.toString()),
      year,
      month
    );

    await this.permissionSummaryService.createOrUpdatePermissionSummary(
      new Types.ObjectId(permission.userId.toString()),
      year,
      month,
      {
        availed: totalUsedThisMonth,
      }
    );

    return { message: 'Permission request cancelled successfully' };
  }

  async getPermissionBalance(
    userId: Types.ObjectId,
    year: number,
    month: number
  ): Promise<{
    alloted: number;
    availed: number;
    remaining: number;
  }> {
    return this.permissionSummaryService.getMonthlyPermissionBalance(userId, year, month);
  }

  private async getTotalHoursUsedInMonth(
    userId: Types.ObjectId,
    year: number,
    month: number
  ): Promise<number> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const approvedPermissions = await Permission.find({
      userId,
      permissionDate: { $gte: startDate, $lte: endDate },
      status: 'Approved',
    });

    return approvedPermissions.reduce((total, perm) => total + perm.hours, 0);
  }

  /**
   * Get total pending hours for a user in a specific month
   * Excludes Rejected and Cancelled permissions
   */
  private async getPendingHoursInMonth(
    userId: Types.ObjectId,
    year: number,
    month: number
  ): Promise<number> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const pendingPermissions = await Permission.find({
      userId,
      permissionDate: { $gte: startDate, $lte: endDate },
      status: 'Pending',
    });

    return pendingPermissions.reduce((total, perm) => total + perm.hours, 0);
  }

  // Service method to get permissions by appliedTo
  async getPermissionsByAppliedTo(query: IPermissionQuery): Promise<{
    data: IPermission[],
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
    if (status) filter.status = status; // Only filter by status if explicitly provided

    if (startDate || endDate) {
      const dateFilter: any = {
        permissionDate: {}
      };
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        dateFilter.permissionDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        dateFilter.permissionDate.$lte = end;
      }
      Object.assign(filter, dateFilter);
    }

    // Handle search filter
    if (search) {
      // Escape special regex characters in search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Search in document fields (user.name, user.email, user.employeeCode, reason, remarks, status)
      const searchConditions: any[] = [
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { 'user.email': { $regex: escapedSearch, $options: 'i' } },
        { reason: { $regex: escapedSearch, $options: 'i' } },
        { remarks: { $regex: escapedSearch, $options: 'i' } },
        { status: { $regex: escapedSearch, $options: 'i' } },
      ];

      // Search in User collection to find matching users
      const userSearchFilter: any = {
        $or: [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } },
          { employeeCode: { $regex: escapedSearch, $options: 'i' } },
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

      // Combine search with existing filters
      if (filter.$or || filter.permissionDate) {
        // We need to use $and to combine date filter with search filter
        const existingFilters: any = {};
        if (filter.permissionDate) {
          existingFilters.permissionDate = filter.permissionDate;
        }
        if (filter.status) {
          existingFilters.status = filter.status;
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
        delete filter.permissionDate;
        delete filter.status;
        delete filter.userId;
        delete filter['appliedTo._id'];
      } else {
        filter.$or = searchConditions;
      }
    }

    const [permissions, total] = await Promise.all([
      Permission.find(filter as FilterQuery<IPermission>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Permission.countDocuments(filter as FilterQuery<IPermission>),
    ]);

    // Populate all references in parallel for better performance
    const populatedPermissions = await Promise.all(
      permissions.map(async (permission) => {
        const [user, approver] = await Promise.all([
          User.findById(permission.userId).select('name email'),
          permission.approvedById ? User.findById(permission.approvedById).select('name email') : null,
        ]);

        if (user) {
          permission.user = {
            name: user.name,
            email: user.email,
          };
        }

        if (approver) {
          permission.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        return permission;
      })
    );

    return {
      data: populatedPermissions,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

