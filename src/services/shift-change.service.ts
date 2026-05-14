import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { User } from '../models';
import { FilterQuery, Types } from 'mongoose';
import { IShiftChangeRequest, ShiftChangeRequest } from '../models/shift-change-request.model';
import { Shift, ShiftAssignment } from '../models/shift.model';
import { generateEmailTemplate } from '../emails/templates';
import { emailService } from './email.service';
import { ShiftService } from './shift.service';

export interface IShiftChangeCreate {
  requestedShiftId: string | Types.ObjectId;
  effectiveDate: Date | string;
  reason: string;
  remarks?: string;
  appliedTo: {
    _id: string | Types.ObjectId;
    name: string;
  };
}

export interface IShiftChangeQuery {
  appliedTo?: string;
  userId?: string | Types.ObjectId;
  status?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  page?: number;
  limit?: number;
  search?: string;
}

export class ShiftChangeService extends BaseService {
  private shiftService: ShiftService;

  constructor(context: RequestContext) {
    super(context);
    this.shiftService = new ShiftService(context);
  }

  /**
   * Create a new shift change request
   */
  async create(data: IShiftChangeCreate, userId: Types.ObjectId): Promise<IShiftChangeRequest> {
    const { requestedShiftId, effectiveDate, reason, remarks, appliedTo } = data;

    // Get user's current shift assignment
    const user = await User.findById(userId).select('name email currentShiftAssignmentData');
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user has an active shift assignment
    if (!user.currentShiftAssignmentData || !user.currentShiftAssignmentData.shiftAssignmentId) {
      throw new Error('User does not have an active shift assignment');
    }

    const currentShiftAssignmentId = user.currentShiftAssignmentData.shiftAssignmentId;
    const currentShiftAssignment = await ShiftAssignment.findById(currentShiftAssignmentId).populate('shiftId');

    if (!currentShiftAssignment) {
      throw new Error('Current shift assignment not found');
    }

    // Validate requested shift exists
    const requestedShift = await Shift.findById(requestedShiftId);
    if (!requestedShift) {
      throw new Error('Requested shift not found');
    }

    // Validate requested shift is different from current shift
    const currentShiftId = (currentShiftAssignment.shiftId as any)?._id || currentShiftAssignment.shiftId;
    if (currentShiftId.toString() === requestedShiftId.toString()) {
      throw new Error('Requested shift must be different from current shift');
    }

    // Validate effective date is future (not today or past)
    const effectiveDateObj = new Date(effectiveDate);
    effectiveDateObj.setUTCHours(0, 0, 0, 0);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (effectiveDateObj <= today) {
      throw new Error('Effective date must be a future date (cannot be today or past)');
    }

    // Validate reason length
    if (!reason || reason.trim().length < 10) {
      throw new Error('Reason must be at least 10 characters');
    }

    // Validate appliedTo user exists and has manager/admin role
    const approver = await User.findById(appliedTo._id).select('name email role');
    if (!approver) {
      throw new Error('Approver not found');
    }

    const validRoles = ['admin', 'manager', 'superadmin'];
    if (!validRoles.includes(approver.role?.toLowerCase())) {
      throw new Error('Approver must have admin or manager role');
    }

    // Check for duplicate pending request for same effective date
    const existingRequest = await ShiftChangeRequest.findOne({
      userId,
      effectiveDate: effectiveDateObj,
      status: 'Pending',
    });

    if (existingRequest) {
      throw new Error('A pending shift change request already exists for this effective date');
    }

    // Create shift change request
    const shiftChangeRequest = await ShiftChangeRequest.create({
      userId,
      currentShiftId: currentShiftAssignmentId,
      requestedShiftId: new Types.ObjectId(requestedShiftId),
      effectiveDate: effectiveDateObj,
      reason: reason.trim(),
      remarks: remarks?.trim() || '',
      status: 'Pending',
      appliedTo: {
        _id: new Types.ObjectId(appliedTo._id),
        name: appliedTo.name,
      },
    });

    // Send email notification to approver
    try {
      const currentShift = currentShiftAssignment.shiftId as any;
      const emailText = `Dear ${approver.name},\n\n${user.name} has requested a shift change effective from ${effectiveDateObj.toLocaleDateString()}.\n\nCurrent Shift: ${currentShiftAssignment.shiftCode} (${currentShift?.name || 'N/A'})\nRequested Shift: ${requestedShift.code} (${requestedShift.name})\nReason: ${reason.trim()}\n\nPlease review and approve/reject the request.\n\nRegards,\n${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

      let html = emailText.replace(/\n/g, '<br>');
      try {
        const emailParams = {
          userName: approver.name,
          employeeName: user.name,
          effectiveDate: effectiveDateObj.toLocaleDateString(),
          currentShift: `${currentShiftAssignment.shiftCode} (${currentShift?.name || 'N/A'})`,
          requestedShift: `${requestedShift.code} (${requestedShift.name})`,
          reason: reason.trim(),
          companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
        };
        html = generateEmailTemplate('shiftChangeRequestEmail', emailParams);
      } catch (templateError) {
        console.warn('Email template not found, using simple HTML');
      }

      await emailService.sendEmail({
        body: {
          to: approver.email,
          subject: `Shift Change Request from ${user.name}`,
          text: emailText,
          html,
        },
      });
    } catch (emailError) {
      console.error(`Failed to send email to ${approver.email}:`, emailError);
      // Don't fail the request if email fails
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
          // Get current shift details for admin email
          const currentShift = currentShiftAssignment.shiftId as any;
          const effectiveDateFormatted = effectiveDateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });

          const currentShiftName = currentShift?.name || 'N/A';
          const adminEmailText = `Dear Admin,

A shift change request has been submitted by ${user.name}.

Request Details:
- Employee: ${user.name} (${user.email || 'N/A'})
- Effective Date: ${effectiveDateFormatted}
- Current Shift: ${currentShiftAssignment.shiftCode} (${currentShiftName})
- Requested Shift: ${requestedShift.code} (${requestedShift.name})
- Reason: ${reason.trim()}
- Status: Pending
- Approver: ${approver.name}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `Shift Change Request Submitted - ${user.name}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for shift change request ${shiftChangeRequest._id}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for shift change request:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    return this.findById(shiftChangeRequest._id as string);
  }

  /**
   * Get shift change requests (role-based filtering handled in routes)
   */
  async findAll(query: {
    userId?: string | Types.ObjectId;
    status?: string;
    startDate?: string;
    endDate?: string;
    appliedTo?: string;
    page?: number;
    limit?: number;
    search?: string; // Search by applied by (employee name/email), applied to (manager name), reason, status, current shift name/code, or requested shift name/code
  }): Promise<{ requests: IShiftChangeRequest[]; total: number; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const { userId, status, startDate, endDate, appliedTo, page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    // ✅ FIX: Convert userId string to ObjectId for proper MongoDB query
    if (userId) {
      filter.userId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    }
    if (status) filter.status = status;
    if (appliedTo) {
      // Convert to ObjectId since appliedTo._id is stored as ObjectId in the model
      filter['appliedTo._id'] = Types.ObjectId.isValid(appliedTo)
        ? new Types.ObjectId(appliedTo)
        : appliedTo;
    }

    if (startDate || endDate) {
      filter.effectiveDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        filter.effectiveDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        filter.effectiveDate.$lte = end;
      }
    }

    // Handle search filter - use aggregation to search by shift names
    if (search) {
      // Escape special regex characters in search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // First, search User collection for matching names/emails
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
      const matchingUserIds = matchingUsers.map(u => u._id);

      // Search conditions for fields stored in the document
      const documentSearchConditions: any[] = [
        { reason: { $regex: escapedSearch, $options: 'i' } },
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { 'user.email': { $regex: escapedSearch, $options: 'i' } },
        { status: { $regex: escapedSearch, $options: 'i' } },
      ];

      // If users found, add userId filter
      if (matchingUserIds.length > 0) {
        documentSearchConditions.push({ userId: { $in: matchingUserIds } });
      }

      // Build base match filter (without search conditions)
      const baseMatchFilter = { ...filter };

      // Use aggregation to search by shift names
      const pipeline: any[] = [
        { $match: baseMatchFilter },
        {
          $lookup: {
            from: 'shifts',
            localField: 'requestedShiftId',
            foreignField: '_id',
            as: 'requestedShiftData'
          }
        },
        {
          $lookup: {
            from: 'shiftassignments',
            localField: 'currentShiftId',
            foreignField: '_id',
            as: 'currentShiftAssignmentData'
          }
        },
        {
          $lookup: {
            from: 'shifts',
            localField: 'currentShiftAssignmentData.shiftId',
            foreignField: '_id',
            as: 'currentShiftData'
          }
        },
        {
          $match: {
            $or: [
              ...documentSearchConditions,
              { 'requestedShiftData.name': { $regex: escapedSearch, $options: 'i' } },
              { 'requestedShiftData.code': { $regex: escapedSearch, $options: 'i' } },
              { 'currentShiftData.name': { $regex: escapedSearch, $options: 'i' } },
              { 'currentShiftData.code': { $regex: escapedSearch, $options: 'i' } },
            ]
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
        {
          $project: {
            requestedShiftData: 0,
            currentShiftAssignmentData: 0,
            currentShiftData: 0
          }
        }
      ];

      const countPipeline = [
        { $match: baseMatchFilter },
        {
          $lookup: {
            from: 'shifts',
            localField: 'requestedShiftId',
            foreignField: '_id',
            as: 'requestedShiftData'
          }
        },
        {
          $lookup: {
            from: 'shiftassignments',
            localField: 'currentShiftId',
            foreignField: '_id',
            as: 'currentShiftAssignmentData'
          }
        },
        {
          $lookup: {
            from: 'shifts',
            localField: 'currentShiftAssignmentData.shiftId',
            foreignField: '_id',
            as: 'currentShiftData'
          }
        },
        {
          $match: {
            $or: [
              ...documentSearchConditions,
              { 'requestedShiftData.name': { $regex: escapedSearch, $options: 'i' } },
              { 'requestedShiftData.code': { $regex: escapedSearch, $options: 'i' } },
              { 'currentShiftData.name': { $regex: escapedSearch, $options: 'i' } },
              { 'currentShiftData.code': { $regex: escapedSearch, $options: 'i' } },
            ]
          }
        },
        { $count: 'total' }
      ];

      const [requests, totalResult] = await Promise.all([
        ShiftChangeRequest.aggregate(pipeline),
        ShiftChangeRequest.aggregate(countPipeline)
      ]);

      const total = totalResult[0]?.total || 0;
      const requestsDocs = requests.map((req: any) => new ShiftChangeRequest(req));

      // Populate related data for each request
      const populatedRequests = await Promise.all(
        requestsDocs.map(async (req) => {
          const [user, requestedShift, currentShiftAssignment, approver, appliedToUser] = await Promise.all([
            User.findById(req.userId).select('name email'),
            Shift.findById(req.requestedShiftId).select('name code startTime endTime'),
            ShiftAssignment.findById(req.currentShiftId).populate('shiftId', 'name code startTime endTime'),
            req.approvedById ? User.findById(req.approvedById).select('name email') : null,
            req.appliedTo?._id ? User.findById(req.appliedTo._id).select('name email') : null,
          ]);

          // Add user data
          if (user) {
            req.user = {
              name: user.name,
              email: user.email,
            };
          }

          // Add requested shift data as dynamic property
          if (requestedShift) {
            (req as any).requestedShift = {
              _id: requestedShift._id,
              name: requestedShift.name,
              code: requestedShift.code,
              startTime: requestedShift.startTime,
              endTime: requestedShift.endTime,
            };
          } else {
            (req as any).requestedShift = null;
          }

          // Add current shift data as dynamic property
          if (currentShiftAssignment) {
            let currentShift = (currentShiftAssignment.shiftId as any);

            if (!currentShift || typeof currentShift === 'string' || currentShift instanceof Types.ObjectId || !currentShift.name) {
              const shiftIdToFetch = typeof currentShift === 'object' && currentShift?._id
                ? currentShift._id
                : currentShiftAssignment.shiftId;

              if (shiftIdToFetch) {
                currentShift = await Shift.findById(shiftIdToFetch).select('name code startTime endTime');
              }
            }

            (req as any).currentShift = currentShift ? {
              _id: currentShift._id,
              name: currentShift.name,
              code: currentShift.code,
              startTime: currentShift.startTime,
              endTime: currentShift.endTime,
            } : null;
          } else {
            (req as any).currentShift = null;
          }

          // Add approver data
          if (approver) {
            req.approvedBy = {
              _id: approver._id,
              name: approver.name,
              email: approver.email,
            };
          }

          // Add appliedTo user data as dynamic property
          if (appliedToUser) {
            (req as any).appliedToUser = {
              _id: appliedToUser._id,
              name: appliedToUser.name,
              email: appliedToUser.email,
            };
          }

          // Convert to plain object
          const reqObj: any = req.toObject();
          reqObj.requestedShift = (req as any).requestedShift ?? null;
          reqObj.currentShift = (req as any).currentShift ?? null;
          reqObj.appliedToUser = (req as any).appliedToUser ?? null;

          return reqObj;
        })
      );

      return {
        requests: populatedRequests,
        total,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const [requests, total] = await Promise.all([
      ShiftChangeRequest.find(filter as FilterQuery<IShiftChangeRequest>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ShiftChangeRequest.countDocuments(filter as FilterQuery<IShiftChangeRequest>),
    ]);

    // Populate related data for each request
    const populatedRequests = await Promise.all(
      requests.map(async (req) => {
        const [user, requestedShift, currentShiftAssignment, approver, appliedToUser] = await Promise.all([
          User.findById(req.userId).select('name email'),
          Shift.findById(req.requestedShiftId).select('name code startTime endTime'),
          ShiftAssignment.findById(req.currentShiftId).populate('shiftId', 'name code startTime endTime'),
          req.approvedById ? User.findById(req.approvedById).select('name email') : null,
          req.appliedTo?._id ? User.findById(req.appliedTo._id).select('name email') : null,
        ]);

        // Add user data
        if (user) {
          req.user = {
            name: user.name,
            email: user.email,
          };
        }

        // Add requested shift data as dynamic property
        if (requestedShift) {
          (req as any).requestedShift = {
            _id: requestedShift._id,
            name: requestedShift.name,
            code: requestedShift.code,
            startTime: requestedShift.startTime,
            endTime: requestedShift.endTime,
          };
        } else {
          // Set to null if shift not found
          (req as any).requestedShift = null;
        }

        // Add current shift data as dynamic property
        // currentShiftId points to a ShiftAssignment, we need to get the Shift from it
        if (currentShiftAssignment) {
          let currentShift = (currentShiftAssignment.shiftId as any);

          // If shiftId is not populated (might be ObjectId string), fetch it directly
          if (!currentShift || typeof currentShift === 'string' || currentShift instanceof Types.ObjectId || !currentShift.name) {
            const shiftIdToFetch = typeof currentShift === 'object' && currentShift?._id
              ? currentShift._id
              : currentShiftAssignment.shiftId;

            if (shiftIdToFetch) {
              currentShift = await Shift.findById(shiftIdToFetch).select('name code startTime endTime');
            }
          }

          (req as any).currentShift = currentShift ? {
            _id: currentShift._id,
            name: currentShift.name,
            code: currentShift.code,
            startTime: currentShift.startTime,
            endTime: currentShift.endTime,
          } : null;
        } else {
          // Set to null if assignment not found
          (req as any).currentShift = null;
        }

        // Add approver data
        if (approver) {
          req.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        // Add appliedTo user data as dynamic property
        if (appliedToUser) {
          (req as any).appliedToUser = {
            _id: appliedToUser._id,
            name: appliedToUser.name,
            email: appliedToUser.email,
          };
        }

        // Convert to plain object to ensure all dynamic properties are included in JSON
        const reqObj: any = req.toObject();

        // Add dynamic properties to plain object
        reqObj.requestedShift = (req as any).requestedShift ?? null;
        reqObj.currentShift = (req as any).currentShift ?? null;
        if ((req as any).appliedToUser) {
          reqObj.appliedToUser = (req as any).appliedToUser;
        }

        return reqObj;
      })
    );

    return {
      requests: populatedRequests,
      total,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  }

  /**
   * Get shift change requests by appliedTo (manager/approver ID)
   */
  async getShiftChangesByAppliedTo(query: IShiftChangeQuery): Promise<{
    data: IShiftChangeRequest[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { appliedTo, userId, status, startDate, endDate, page = 1, limit = 5, search } = query;
    const skip = (page - 1) * limit;

    const filter: any = { 'appliedTo._id': appliedTo ? new Types.ObjectId(appliedTo) : undefined };

    if (userId) {
      filter.userId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    }
    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.effectiveDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        filter.effectiveDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        filter.effectiveDate.$lte = end;
      }
    }

    // Handle search filter - use aggregation to search by shift names
    if (search) {
      // Escape special regex characters in search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // First, search User collection for matching names/emails
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
      const matchingUserIds = matchingUsers.map(u => u._id);

      // Search conditions for fields stored in the document
      const documentSearchConditions: any[] = [
        { reason: { $regex: escapedSearch, $options: 'i' } },
        { 'user.name': { $regex: escapedSearch, $options: 'i' } },
        { 'user.email': { $regex: escapedSearch, $options: 'i' } },
        { status: { $regex: escapedSearch, $options: 'i' } },
      ];

      // If users found, add userId filter
      if (matchingUserIds.length > 0) {
        documentSearchConditions.push({ userId: { $in: matchingUserIds } });
      }

      // Build base match filter (without search conditions)
      const baseMatchFilter = { ...filter };

      // Use aggregation to search by shift names
      const pipeline: any[] = [
        { $match: baseMatchFilter },
        {
          $lookup: {
            from: 'shifts',
            localField: 'requestedShiftId',
            foreignField: '_id',
            as: 'requestedShiftData'
          }
        },
        {
          $lookup: {
            from: 'shiftassignments',
            localField: 'currentShiftId',
            foreignField: '_id',
            as: 'currentShiftAssignmentData'
          }
        },
        {
          $lookup: {
            from: 'shifts',
            localField: 'currentShiftAssignmentData.shiftId',
            foreignField: '_id',
            as: 'currentShiftData'
          }
        },
        {
          $match: {
            $or: [
              ...documentSearchConditions,
              { 'requestedShiftData.name': { $regex: escapedSearch, $options: 'i' } },
              { 'requestedShiftData.code': { $regex: escapedSearch, $options: 'i' } },
              { 'currentShiftData.name': { $regex: escapedSearch, $options: 'i' } },
              { 'currentShiftData.code': { $regex: escapedSearch, $options: 'i' } },
            ]
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
        {
          $project: {
            requestedShiftData: 0,
            currentShiftAssignmentData: 0,
            currentShiftData: 0
          }
        }
      ];

      const countPipeline = [
        { $match: baseMatchFilter },
        {
          $lookup: {
            from: 'shifts',
            localField: 'requestedShiftId',
            foreignField: '_id',
            as: 'requestedShiftData'
          }
        },
        {
          $lookup: {
            from: 'shiftassignments',
            localField: 'currentShiftId',
            foreignField: '_id',
            as: 'currentShiftAssignmentData'
          }
        },
        {
          $lookup: {
            from: 'shifts',
            localField: 'currentShiftAssignmentData.shiftId',
            foreignField: '_id',
            as: 'currentShiftData'
          }
        },
        {
          $match: {
            $or: [
              ...documentSearchConditions,
              { 'requestedShiftData.name': { $regex: escapedSearch, $options: 'i' } },
              { 'requestedShiftData.code': { $regex: escapedSearch, $options: 'i' } },
              { 'currentShiftData.name': { $regex: escapedSearch, $options: 'i' } },
              { 'currentShiftData.code': { $regex: escapedSearch, $options: 'i' } },
            ]
          }
        },
        { $count: 'total' }
      ];

      const [requests, totalResult] = await Promise.all([
        ShiftChangeRequest.aggregate(pipeline),
        ShiftChangeRequest.aggregate(countPipeline)
      ]);

      const total = totalResult[0]?.total || 0;
      const requestsDocs = requests.map((req: any) => new ShiftChangeRequest(req));

      // Populate related data for each request
      const populatedRequests = await Promise.all(
        requestsDocs.map(async (req) => {
          const [user, requestedShift, currentShiftAssignment, approver, appliedToUser] = await Promise.all([
            User.findById(req.userId).select('name email'),
            Shift.findById(req.requestedShiftId).select('name code startTime endTime'),
            ShiftAssignment.findById(req.currentShiftId).populate('shiftId', 'name code startTime endTime'),
            req.approvedById ? User.findById(req.approvedById).select('name email') : null,
            req.appliedTo?._id ? User.findById(req.appliedTo._id).select('name email') : null,
          ]);

          // Add user data
          if (user) {
            req.user = {
              name: user.name,
              email: user.email,
            };
          }

          // Add requested shift data as dynamic property
          if (requestedShift) {
            (req as any).requestedShift = {
              _id: requestedShift._id,
              name: requestedShift.name,
              code: requestedShift.code,
              startTime: requestedShift.startTime,
              endTime: requestedShift.endTime,
            };
          } else {
            (req as any).requestedShift = null;
          }

          // Add current shift data as dynamic property
          if (currentShiftAssignment) {
            let currentShift = (currentShiftAssignment.shiftId as any);

            if (!currentShift || typeof currentShift === 'string' || currentShift instanceof Types.ObjectId || !currentShift.name) {
              const shiftIdToFetch = typeof currentShift === 'object' && currentShift?._id
                ? currentShift._id
                : currentShiftAssignment.shiftId;

              if (shiftIdToFetch) {
                currentShift = await Shift.findById(shiftIdToFetch).select('name code startTime endTime');
              }
            }

            (req as any).currentShift = currentShift ? {
              _id: currentShift._id,
              name: currentShift.name,
              code: currentShift.code,
              startTime: currentShift.startTime,
              endTime: currentShift.endTime,
            } : null;
          } else {
            (req as any).currentShift = null;
          }

          // Add approver data
          if (approver) {
            req.approvedBy = {
              _id: approver._id,
              name: approver.name,
              email: approver.email,
            };
          }

          // Add appliedTo user data as dynamic property
          if (appliedToUser) {
            (req as any).appliedToUser = {
              _id: appliedToUser._id,
              name: appliedToUser.name,
              email: appliedToUser.email,
            };
          }

          // Convert to plain object
          const reqObj: any = req.toObject();
          reqObj.requestedShift = (req as any).requestedShift ?? null;
          reqObj.currentShift = (req as any).currentShift ?? null;
          reqObj.appliedToUser = (req as any).appliedToUser ?? null;
          reqObj.user = req.user ?? null;

          return reqObj;
        })
      );

      return {
        data: populatedRequests,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    // No search - use simple query
    const [requests, total] = await Promise.all([
      ShiftChangeRequest.find(filter as FilterQuery<IShiftChangeRequest>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ShiftChangeRequest.countDocuments(filter as FilterQuery<IShiftChangeRequest>),
    ]);

    // Populate related data for each request
    const populatedRequests = await Promise.all(
      requests.map(async (req) => {
        const [user, requestedShift, currentShiftAssignment, approver, appliedToUser] = await Promise.all([
          User.findById(req.userId).select('name email'),
          Shift.findById(req.requestedShiftId).select('name code startTime endTime'),
          ShiftAssignment.findById(req.currentShiftId).populate('shiftId', 'name code startTime endTime'),
          req.approvedById ? User.findById(req.approvedById).select('name email') : null,
          req.appliedTo?._id ? User.findById(req.appliedTo._id).select('name email') : null,
        ]);

        // Add user data
        if (user) {
          req.user = {
            name: user.name,
            email: user.email,
          };
        }

        // Add requested shift data as dynamic property
        if (requestedShift) {
          (req as any).requestedShift = {
            _id: requestedShift._id,
            name: requestedShift.name,
            code: requestedShift.code,
            startTime: requestedShift.startTime,
            endTime: requestedShift.endTime,
          };
        } else {
          (req as any).requestedShift = null;
        }

        // Add current shift data as dynamic property
        if (currentShiftAssignment) {
          let currentShift = (currentShiftAssignment.shiftId as any);

          if (!currentShift || typeof currentShift === 'string' || currentShift instanceof Types.ObjectId || !currentShift.name) {
            const shiftIdToFetch = typeof currentShift === 'object' && currentShift?._id
              ? currentShift._id
              : currentShiftAssignment.shiftId;

            if (shiftIdToFetch) {
              currentShift = await Shift.findById(shiftIdToFetch).select('name code startTime endTime');
            }
          }

          (req as any).currentShift = currentShift ? {
            _id: currentShift._id,
            name: currentShift.name,
            code: currentShift.code,
            startTime: currentShift.startTime,
            endTime: currentShift.endTime,
          } : null;
        } else {
          (req as any).currentShift = null;
        }

        // Add approver data
        if (approver) {
          req.approvedBy = {
            _id: approver._id,
            name: approver.name,
            email: approver.email,
          };
        }

        // Add appliedTo user data as dynamic property
        if (appliedToUser) {
          (req as any).appliedToUser = {
            _id: appliedToUser._id,
            name: appliedToUser.name,
            email: appliedToUser.email,
          };
        }

        // Convert to plain object
        const reqObj: any = req.toObject();
        reqObj.requestedShift = (req as any).requestedShift ?? null;
        reqObj.currentShift = (req as any).currentShift ?? null;
        reqObj.appliedToUser = (req as any).appliedToUser ?? null;
        reqObj.user = req.user ?? null;

        return reqObj;
      })
    );

    return {
      data: populatedRequests,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get shift change request by ID
   */
  async findById(id: string | Types.ObjectId): Promise<any> {
    const request = await ShiftChangeRequest.findById(id);
    if (!request) {
      throw new Error('Shift change request not found');
    }

    const [user, requestedShift, currentShiftAssignment, approver] = await Promise.all([
      User.findById(request.userId).select('name email'),
      Shift.findById(request.requestedShiftId).select('name code startTime endTime'),
      ShiftAssignment.findById(request.currentShiftId).populate('shiftId', 'name code startTime endTime'),
      request.approvedById ? User.findById(request.approvedById).select('name email') : null,
    ]);

    // Add user data
    if (user) {
      request.user = {
        name: user.name,
        email: user.email,
      };
    }

    // Add requested shift data as dynamic property
    if (requestedShift) {
      (request as any).requestedShift = {
        _id: requestedShift._id,
        name: requestedShift.name,
        code: requestedShift.code,
        startTime: requestedShift.startTime,
        endTime: requestedShift.endTime,
      };
    } else {
      // Set to null if shift not found
      (request as any).requestedShift = null;
    }

    // Add current shift data as dynamic property
    // currentShiftId points to a ShiftAssignment, we need to get the Shift from it
    if (currentShiftAssignment) {
      let currentShift = (currentShiftAssignment.shiftId as any);

      // If shiftId is not populated (might be ObjectId string), fetch it directly
      if (!currentShift || typeof currentShift === 'string' || currentShift instanceof Types.ObjectId || !currentShift.name) {
        const shiftIdToFetch = typeof currentShift === 'object' && currentShift?._id
          ? currentShift._id
          : currentShiftAssignment.shiftId;

        if (shiftIdToFetch) {
          currentShift = await Shift.findById(shiftIdToFetch).select('name code startTime endTime');
        }
      }

      (request as any).currentShift = currentShift ? {
        _id: currentShift._id,
        name: currentShift.name,
        code: currentShift.code,
        startTime: currentShift.startTime,
        endTime: currentShift.endTime,
      } : null;
    } else {
      // Set to null if assignment not found
      (request as any).currentShift = null;
    }

    // Add approver data
    if (approver) {
      request.approvedBy = {
        _id: approver._id,
        name: approver.name,
        email: approver.email,
      };
    }

    // Add appliedTo user data as dynamic property
    if (request.appliedTo?._id) {
      const appliedToUser = await User.findById(request.appliedTo._id).select('name email');
      if (appliedToUser) {
        (request as any).appliedToUser = {
          _id: appliedToUser._id,
          name: appliedToUser.name,
          email: appliedToUser.email,
        };
      }
    }

    // Convert to plain object to ensure all dynamic properties are included in JSON
    const requestObj: any = request.toObject();

    // Add dynamic properties to plain object (these are set above)
    requestObj.requestedShift = (request as any).requestedShift ?? null;
    requestObj.currentShift = (request as any).currentShift ?? null;
    if ((request as any).appliedToUser) {
      requestObj.appliedToUser = (request as any).appliedToUser;
    }

    return requestObj;
  }

  /**
   * Update shift change request status (Approve/Reject)
   */
  async updateStatus(id: string | Types.ObjectId, updateData: {
    status: 'Approved' | 'Rejected';
    remarks?: string;
    approvedById: Types.ObjectId;
    approvedBy?: {
      _id: string | Types.ObjectId;
      name: string;
      email: string;
    };
  }): Promise<IShiftChangeRequest> {
    const request = await ShiftChangeRequest.findById(id);
    if (!request) {
      throw new Error('Shift change request not found');
    }

    if (request.status !== 'Pending') {
      throw new Error('Shift change request has already been processed');
    }

    // If approving, validate effective date is not today or past
    if (updateData.status === 'Approved') {
      const effectiveDate = new Date(request.effectiveDate);
      effectiveDate.setUTCHours(0, 0, 0, 0);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      if (effectiveDate <= today) {
        throw new Error('Cannot approve shift change with effective date as today or in the past. Effective date must be a future date.');
      }
    }

    request.status = updateData.status;
    request.approvedById = updateData.approvedById;
    request.approvedBy = updateData.approvedBy
      ? {
        _id: typeof updateData.approvedBy._id === 'string'
          ? new Types.ObjectId(updateData.approvedBy._id)
          : updateData.approvedBy._id,
        name: updateData.approvedBy.name,
        email: updateData.approvedBy.email,
      }
      : undefined;

    if (updateData.status === 'Approved') {
      request.approvedAt = new Date();
    } else if (updateData.status === 'Rejected') {
      request.rejectedAt = new Date();
    }

    if (updateData.remarks) request.remarks = updateData.remarks.trim();
    await request.save();

    // If approved, update the shift assignment
    if (updateData.status === 'Approved') {
      await this.applyApprovedShiftChange(request);
    }

    // Send email notification to employee (the person who applied)
    try {
      const employee = await User.findById(request.userId).select('name email');
      const approver = await User.findById(updateData.approvedById).select('name email');

      if (employee && employee.email) {
        // Get current shift assignment details
        const currentShiftAssignment = await ShiftAssignment.findById(request.currentShiftId).populate('shiftId', 'name code startTime endTime');
        const requestedShift = await Shift.findById(request.requestedShiftId).select('name code startTime endTime');

        const currentShift = currentShiftAssignment?.shiftId as any;
        const currentShiftName = currentShift?.name || 'N/A';
        const currentShiftCode = currentShiftAssignment?.shiftCode || currentShift?.code || 'N/A';
        const currentShiftTime = currentShift?.startTime && currentShift?.endTime
          ? `${currentShift.startTime} - ${currentShift.endTime}`
          : 'N/A';

        const requestedShiftName = requestedShift?.name || 'N/A';
        const requestedShiftCode = requestedShift?.code || 'N/A';
        const requestedShiftTime = requestedShift?.startTime && requestedShift?.endTime
          ? `${requestedShift.startTime} - ${requestedShift.endTime}`
          : 'N/A';

        const effectiveDateFormatted = new Date(request.effectiveDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        // Build email text content
        const emailText = `Dear ${employee.name},

Your shift change request has been ${updateData.status.toLowerCase()} by ${approver?.name || 'Manager'}.

Request Details:
- Current Shift: ${currentShiftCode} (${currentShiftName}) - ${currentShiftTime}
- Requested Shift: ${requestedShiftCode} (${requestedShiftName}) - ${requestedShiftTime}
- Effective Date: ${effectiveDateFormatted}
- Reason: ${request.reason}
${updateData.remarks ? `- Remarks: ${updateData.remarks}` : ''}

${updateData.status === 'Approved'
            ? `Your shift change has been approved and will be effective from ${effectiveDateFormatted}. Please ensure you are available for the new shift timing.`
            : `Unfortunately, your shift change request has been rejected. If you have any questions, please contact your manager.`}

Thank you for your understanding.

Regards,
${approver?.name || 'Manager'}
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

        // Build HTML content
        let html = emailText.replace(/\n/g, '<br>');
        try {
          const emailParams = {
            employeeName: employee.name,
            approverName: approver?.name || 'Manager',
            currentShift: `${currentShiftCode} (${currentShiftName})`,
            currentShiftTime: currentShiftTime,
            requestedShift: `${requestedShiftCode} (${requestedShiftName})`,
            requestedShiftTime: requestedShiftTime,
            effectiveDate: effectiveDateFormatted,
            reason: request.reason,
            remarks: updateData.remarks || '',
            status: updateData.status,
            companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
          };
          html = generateEmailTemplate('shiftChangeStatusEmail', emailParams);
        } catch (templateError) {
          console.warn('Email template not found, using simple HTML');
        }

        // Send email to the employee who applied
        await emailService.sendEmail({
          body: {
            to: employee.email,
            subject: `Your Shift Change Request has been ${updateData.status}`,
            text: emailText,
            html,
          },
        });

        console.log(`Email notification sent to ${employee.email} for shift change request ${request._id} - Status: ${updateData.status}`);
      } else {
        console.warn(`Cannot send email: Employee not found or email missing for userId: ${request.userId}`);
      }
    } catch (emailError) {
      console.error('Failed to send email to employee:', emailError);
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
        const employee = await User.findById(request.userId).select('name email');
        const approver = await User.findById(updateData.approvedById).select('name email');

        const effectiveDateFormatted = new Date(request.effectiveDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        const currentShiftAssignment = await ShiftAssignment.findById(request.currentShiftId).populate('shiftId', 'name code startTime endTime');
        const requestedShift = await Shift.findById(request.requestedShiftId).select('name code startTime endTime');

        const currentShift = currentShiftAssignment?.shiftId as any;
        const currentShiftCode = currentShiftAssignment?.shiftCode || currentShift?.code || 'N/A';
        const requestedShiftCode = requestedShift?.code || 'N/A';

        const adminEmails = admins.map(admin => admin.email).filter(Boolean);

        if (adminEmails.length > 0) {
          const adminEmailText = `Dear Admin,

A shift change request has been ${updateData.status.toLowerCase()} by ${approver?.name || 'Manager'}.

Request Details:
- Employee: ${employee?.name || 'N/A'} (${employee?.email || 'N/A'})
- Current Shift: ${currentShiftCode}
- Requested Shift: ${requestedShiftCode}
- Effective Date: ${effectiveDateFormatted}
- Reason: ${request.reason}
- Status: ${updateData.status}
${updateData.remarks ? `- Remarks: ${updateData.remarks}` : ''}
- Approved/Rejected By: ${approver?.name || 'Manager'}

This is an automated notification for your records.

Regards,
${process.env.COMPANY_NAME || 'CloudDesk HRMS'}`;

          await emailService.sendEmail({
            body: {
              to: adminEmails,
              subject: `Shift Change Request ${updateData.status} - ${employee?.name || 'Employee'}`,
              text: adminEmailText,
              html: adminEmailText.replace(/\n/g, '<br>'),
            }
          });

          console.log(`Email notification sent to ${adminEmails.length} admin(s) for shift change request ${request._id} - Status: ${updateData.status}`);
        }
      }
    } catch (adminEmailError) {
      console.error('Failed to send email to admins for shift change request:', adminEmailError);
      // Don't fail the request if admin email fails
    }

    return this.findById(request._id as string);
  }

  /**
   * Cancel shift change request
   */
  async cancel(id: string | Types.ObjectId, userId: Types.ObjectId): Promise<{ message: string }> {
    const request = await ShiftChangeRequest.findById(id);
    if (!request) {
      throw new Error('Shift change request not found');
    }

    if (request.userId.toString() !== userId.toString()) {
      throw new Error('You can only cancel your own shift change requests');
    }

    if (request.status !== 'Pending') {
      throw new Error('Only pending shift change requests can be cancelled');
    }

    request.status = 'Cancelled';
    request.cancelledAt = new Date();
    await request.save();

    return { message: 'Shift change request cancelled successfully' };
  }

  /**
   * Apply approved shift change by updating shift assignment
   */
  private async applyApprovedShiftChange(request: IShiftChangeRequest): Promise<void> {
    // Get current shift assignment
    const currentAssignment = await ShiftAssignment.findById(request.currentShiftId);
    if (!currentAssignment) {
      throw new Error('Current shift assignment not found');
    }

    // Get requested shift
    const requestedShift = await Shift.findById(request.requestedShiftId);
    if (!requestedShift) {
      throw new Error('Requested shift not found');
    }

    const effectiveDate = new Date(request.effectiveDate);
    effectiveDate.setUTCHours(0, 0, 0, 0);

    const currentDate = new Date();
    currentDate.setUTCHours(0, 0, 0, 0);

    // Store original end date before modifying
    const originalEndDate = currentAssignment.endDate;

    // If effective date is in the future
    if (effectiveDate > currentDate) {
      // End current assignment the day BEFORE the effective date (end of day)
      // This ensures clean transition: past shift ends Day 7, new shift starts Day 8
      // No overlap or same-day boundary issues
      const endDate = new Date(effectiveDate);
      endDate.setUTCDate(endDate.getUTCDate() - 1); // Day before effective date
      endDate.setUTCHours(23, 59, 59, 999);

      currentAssignment.endDate = endDate;
      // Keep assignment active and current until effective date arrives
      // Status will be updated to 'past' by recalculateUserShiftStatus or cron job when endDate passes
      await currentAssignment.save();

      // Create new assignment starting from effective date (not joining date)
      const newAssignment = new ShiftAssignment({
        userId: request.userId,
        shiftId: request.requestedShiftId,
        shiftCode: requestedShift.code,
        startDate: effectiveDate, // Use effective date, not joining date
        endDate: originalEndDate || undefined,
        weekendDays: currentAssignment.weekendDays || [0],
        isActive: true,
        status: 'upcoming',
        assignedBy: request.approvedById || request.userId,
        assignedAt: new Date(),
      });

      await newAssignment.save();

      // Ensure the assignment is persisted before recalculating
      // Recalculate user shift status to update currentShiftAssignmentData and upcomingShiftAssignmentData
      await this.shiftService.recalculateUserShiftStatus(request.userId);
    } else {
      // If effective date is today or past, we need to:
      // 1. Mark the current assignment as past (if it started before effective date)
      // 2. Create a new assignment with effective date as start date

      const currentStartDate = new Date(currentAssignment.startDate);
      currentStartDate.setUTCHours(0, 0, 0, 0);

      // If current assignment started before effective date, mark it as past
      if (currentStartDate < effectiveDate) {
        // End the previous assignment one day before effective date
        const previousEndDate = new Date(effectiveDate);
        previousEndDate.setUTCDate(previousEndDate.getUTCDate() - 1);
        previousEndDate.setUTCHours(23, 59, 59, 999);

        currentAssignment.endDate = previousEndDate;
        currentAssignment.status = 'past';
        currentAssignment.isActive = false;
        await currentAssignment.save();

        // Create new assignment with effective date as start date
        const newAssignment = new ShiftAssignment({
          userId: request.userId,
          shiftId: request.requestedShiftId,
          shiftCode: requestedShift.code,
          startDate: effectiveDate, // Use effective date, not joining date
          endDate: originalEndDate || undefined,
          weekendDays: currentAssignment.weekendDays || [0],
          isActive: true,
          status: 'current',
          assignedBy: request.approvedById || request.userId,
          assignedAt: new Date(),
        });
        await newAssignment.save();
      } else {
        // Current assignment started on or after effective date, just update it
        currentAssignment.shiftId = request.requestedShiftId;
        currentAssignment.shiftCode = requestedShift.code;
        // Ensure startDate is set to effective date, not joining date
        currentAssignment.startDate = effectiveDate;
        currentAssignment.modifiedBy = request.approvedById || request.userId;
        currentAssignment.modifiedAt = new Date();
        await currentAssignment.save();
      }

      // Recalculate user shift status to update currentShiftAssignmentData
      await this.shiftService.recalculateUserShiftStatus(request.userId);
    }
  }
}
