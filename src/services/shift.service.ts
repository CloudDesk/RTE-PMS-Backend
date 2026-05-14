import { Shift, ShiftAssignment, User } from '../models';
import { IShift, IShiftAssignment } from '../models/shift.model';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { generateEmailTemplate } from '../emails/templates';
import { emailService } from './email.service';

export interface IShiftCreate {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  shiftWindowStart: string;
  shiftWindowEnd: string;
  applicableForRoles: string[];
  validFrom: Date;
  validTill?: Date;
  description?: string;
  graceTimeInMinutes?: number;
}

export interface IShiftUpdate {
  name?: string;
  startTime?: string;
  endTime?: string;
  shiftWindowStart?: string;
  shiftWindowEnd?: string;
  applicableForRoles?: string[];
  validTill?: Date;
  description?: string;
  graceTimeInMinutes?: number;
  isActive?: boolean;
}

export interface IShiftAssignmentCreate {
  userId: Types.ObjectId;
  shiftId: Types.ObjectId;
  startDate: Date;
  endDate?: Date;
  assignedBy: Types.ObjectId;
}

export interface IShiftAssignmentUpdate {
  endDate?: Date;
  isActive?: boolean;
  modifiedBy: Types.ObjectId;
}

export interface IShiftQuery {
  search?: string;
  isActive?: boolean;
  role?: string;
  validOn?: Date;
  page?: number;
  limit?: number;
}

export interface IShiftAssignmentQuery {
  userId?: Types.ObjectId;
  shiftId?: Types.ObjectId;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

interface IDateQuery {
  startDate?: Date;
  endDate?: Date;
}
// interface IBulkShiftAssignment {
//   employeeIds: string[];
//   validFrom: Date;  // DateTime in UTC
//   validTill: Date;  // DateTime in UTC
//   shiftId?: string;
// }

interface IShiftAssignmentBulk {
  addUserIds: string[];
  removeUserIds: string[];
  shiftId: string;
  shiftCode: string;
  startDate: Date;  // DateTime in UTC
  endDate?: Date;   // DateTime in UTC
  weekends: number[];
  assignedBy: Types.ObjectId;
  isActive: boolean;
}

/**   * Interface for bulk shift assignment update   */
interface IShiftAssignmentBulkUpdate {
  shiftAssignmentId: string | Types.ObjectId;
  shiftId?: string | Types.ObjectId;
  shiftCode?: string;
  startDate?: Date | string;
  endDate?: Date | string | null;
  createNew?: boolean;
  weekends?: number[];
  modifiedBy: string | Types.ObjectId;
}

export class ShiftService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  // Shift Definition Methods
  async findShiftById(id: string): Promise<IShift | null> {
    return Shift.findById(id).populate('applicableForRoles', 'value');
  }

  async findAllShifts(query: IShiftQuery) {
    const { search, isActive, role, validOn, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (typeof isActive === 'boolean') filter.isActive = isActive;
    if (role) filter.applicableForRoles = role;
    if (validOn) {
      filter.validFrom = { $lte: validOn };
      filter.$or = [
        { validTill: { $gte: validOn } },
        { validTill: null },
      ];
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const [shifts, total] = await Promise.all([
      Shift.find(filter)
        .populate('applicableForRoles', 'value')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Shift.countDocuments(filter),
    ]);

    return {
      shifts,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createShift(shiftData: IShiftCreate): Promise<IShift | null> {
    // Check if code already exists
    console.log("1 create shift", shiftData)
    const existingShift = await Shift.findOne({ code: shiftData.code.toUpperCase() });
    console.log(existingShift, "2 existingShift")
    if (existingShift) {
      throw new Error('Shift code already exists');
    }

    const shift = await Shift.create({
      ...shiftData,
      code: shiftData.code.toUpperCase(),
    });

    return this.findShiftById(shift.id);
  }

  async updateShift(id: string, updateData: IShiftUpdate): Promise<IShift> {

    console.log(updateData, " updateData")

    const shift = await Shift.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    ).populate('applicableForRoles', 'value');

    if (!shift) {
      throw new Error('Shift not found');
    }

    return shift;
  }

  async deleteShift(id: string): Promise<{ message: string }> {
    const shift = await Shift.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true },
    );

    if (!shift) {
      throw new Error('Shift not found');
    }

    return { message: 'Shift deactivated successfully' };
  }

  // Shift Assignment Methods
  async findAssignmentById(id: string) {
    return ShiftAssignment.findById(id)
      .populate('userId', 'name email')
      .populate('shiftId', 'name code')
      .populate('assignedBy', 'name email')
      .populate('modifiedBy', 'name email');
  }

  async findAllAssignments(query: IShiftAssignmentQuery) {
    const { userId, shiftId, startDate, endDate, isActive, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (userId) filter.userId = userId;
    if (shiftId) filter.shiftId = shiftId;
    if (typeof isActive === 'boolean') filter.isActive = isActive;
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

    const [assignments, total] = await Promise.all([
      ShiftAssignment.find(filter)
        .populate('userId', 'name email')
        .populate('shiftId', 'name code')
        .populate('assignedBy', 'name email')
        .populate('modifiedBy', 'name email')
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(limit),
      ShiftAssignment.countDocuments(filter),
    ]);

    return {
      assignments,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }



  async updateUserShiftAssignments(userId: Types.ObjectId) {
    const currentDate = new Date();

    // Find current and upcoming assignments
    const assignments = await ShiftAssignment.find({
      userId,
      isActive: true,
      endDate: { $gte: currentDate }
    }).sort({ startDate: 1 });

    if (!assignments.length) {
      // Clear assignments if none found
      await User.findByIdAndUpdate(userId, {
        $unset: {
          currentShiftAssignment: 1,
          upcomingShiftAssignment: 1
        }
      });
      return;
    }

    // Determine current and upcoming assignments
    const currentAssignment = assignments.find(
      a => a.startDate <= currentDate && (a.endDate ? a.endDate >= currentDate : true)
    );
    const upcomingAssignment = assignments.find(
      a => a.startDate > currentDate
    );

    // Update user document
    await User.findByIdAndUpdate(userId, {
      $set: {
        currentShiftAssignment: currentAssignment?._id,
        upcomingShiftAssignment: upcomingAssignment?._id
      }
    });
  }

  async deactivateAssignment(id: string) {
    const assignment = await ShiftAssignment.findByIdAndUpdate(
      id,
      {
        isActive: false,
        modifiedAt: new Date()
      },
      { new: true }
    );

    if (!assignment) {
      throw new Error('Shift assignment not found');
    }

    // Update user's shift assignments
    await this.updateUserShiftAssignments(assignment.userId);

    return assignment;
  }

  async getCurrentShift(userId: Types.ObjectId): Promise<IShiftAssignment | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return ShiftAssignment.findOne({
      userId,
      isActive: true,
      status: "current",
      // startDate: { $lte: today },
      // $or: [
      //   { endDate: { $gte: tomorrow } },
      //   { endDate: null },
      // ],
    }).populate('shiftId', 'name code startTime endTime graceTimeInMinutes');
  }

  async getPastShift(userId: Types.ObjectId): Promise<IShiftAssignment[]> {
    console.log(userId, "userId getPastShift")
    const pastShifts = await ShiftAssignment.find({
      userId,
      status: "past",
    }).sort({ endDate: -1 })
      .populate('shiftId', 'name code startTime endTime graceTimeInMinutes');
    console.log(pastShifts, "pastShifts")
    return pastShifts;
  }
  async getUpcomingShift(userId: Types.ObjectId): Promise<IShiftAssignment | null> {

    const upcomingShift = await ShiftAssignment.findOne({
      userId,
      status: "upcoming",
    }).sort({ startDate: 1 })
      .populate('shiftId', 'name code startTime endTime graceTimeInMinutes');
    console.log(upcomingShift, "upcomingShift")
    return upcomingShift;

  }

  async bulkAssignShift(data: IShiftAssignmentBulk) {
    console.log("1,bulkAssignShift", data)
    const { addUserIds, removeUserIds, shiftId, shiftCode, startDate, endDate, assignedBy, weekends } = data;
    const currentDate = new Date();

    // Validate shift exists
    const shift = await Shift.findById(shiftId);
    if (!shift) {
      throw new Error('Shift not found');
    }

    // Validate dates
    if (endDate && startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }

    // Validate weekendDays
    const validatedWeekendDays = Array.isArray(weekends) &&
      weekends.every(d => Number.isInteger(d) && d >= 0 && d <= 6) &&
      weekends.length > 0
      ? weekends
      : [0]; // Default to [0] (Sunday) if invalid or not provided
    console.log(validatedWeekendDays, "validatedWeekendDays")
    if (validatedWeekendDays.length === 0) {
      throw new Error('At least one valid weekend day (0-6) is required');
    }

    const operations = [];

    // Handle removals first
    if (removeUserIds.length > 0) {
      const deactivatePromise = ShiftAssignment.updateMany(
        {
          userId: { $in: removeUserIds.map(id => new Types.ObjectId(id)) },
          shiftId: new Types.ObjectId(shiftId),
          shiftCode: shiftCode,
          isActive: true,
          startDate: { $lte: startDate },
          $or: [
            { endDate: { $gte: startDate } },
            { endDate: null }
          ]
        },
        {
          $set: {
            isActive: false,
            modifiedAt: currentDate,
            modifiedBy: assignedBy
          }
        }
      );
      operations.push(deactivatePromise);
    }

    // Handle additions
    if (addUserIds.length > 0) {
      const assignments = addUserIds.map(userId => {
        const startDateTime = new Date(startDate);
        const endDateTime = endDate ? new Date(endDate) : null;

        const isCurrentShift = startDateTime <= currentDate && (!endDateTime || endDateTime >= currentDate);
        // const isUpcomingShift = startDateTime > currentDate;
        const isPastShift = endDateTime && endDateTime < currentDate;

        let shiftStatus: 'current' | 'past' | 'upcoming' = 'upcoming';
        if (isCurrentShift) shiftStatus = 'current';
        if (isPastShift) shiftStatus = 'past';

        return {
          userId: new Types.ObjectId(userId),
          shiftId: new Types.ObjectId(shiftId),
          shiftCode: shiftCode,
          startDate,
          endDate,
          assignedBy,
          assignedAt: currentDate,
          isActive: true,
          status: shiftStatus,
          weekendDays: validatedWeekendDays,
        };
      });

      const createPromise = ShiftAssignment.insertMany(assignments);
      operations.push(createPromise);
    }

    // Execute all operations
    const resultdata: any = await Promise.all(operations);

    const operationsTwo: any = [];

    const userUpdatePromises = addUserIds.map(async (userId) => {
      const user: any = await User.findById(userId);
      if (!user) return null;

      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : null;

      // ── 1. JOINING DATE VALIDATION (Allow max 1 day prior) ──
      if (user.joiningDate) {
        const startDay = new Date(new Date(startDate).getTime() + (5.5 * 60 * 60 * 1000));
        const startDayStr = startDay.toISOString().split('T')[0];

        const joinDay = new Date(new Date(user.joiningDate).getTime() + (5.5 * 60 * 60 * 1000));
        const minAllowedDate = new Date(joinDay);
        minAllowedDate.setDate(minAllowedDate.getDate() - 1);
        const minAllowedDayStr = minAllowedDate.toISOString().split('T')[0];

        if (startDayStr < minAllowedDayStr) {
          throw new Error(`Cannot assign shift to ${user.name} starting ${startDayStr} - joined on ${joinDay.toISOString().split('T')[0]}. (Max 1 day prior allowed)`);
        }
      }



      const isCurrent = start <= currentDate && (!end || end >= currentDate);
      // const isUpcomingShift = startDateTime > currentDate;
      const isPast = end && end < currentDate;

      // Assign status accordingly
      let newshiftStatus: 'current' | 'past' | 'upcoming' = 'upcoming';
      if (isCurrent) newshiftStatus = 'current';
      if (isPast) newshiftStatus = 'past';

      //MAIL 
      if (user && user.email) {
        const html = generateEmailTemplate('shiftAssignmentEmail', {
          userName: user.name,
          companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
          shiftCode,
          startDate: new Date(startDate).toDateString(),
          endDate: endDate ? new Date(endDate).toDateString() : '',
          status: newshiftStatus,
          weekendDays: validatedWeekendDays.map(d =>
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]
          ).join(', ')
        });

        const emailRequest = {
          body: {
            to: user.email,
            subject: 'New Shift Assignment',
            text: `Dear ${user.name},\n\nYou have been assigned a new shift (${shiftCode}) starting from ${new Date(startDate).toDateString()}${endDate ? ` to ${new Date(endDate).toDateString()}` : ''}`,
            html
          }
        };

        await emailService.sendEmail(emailRequest);
      }

      // Find the corresponding shift assignment for this user
      let shiftAssignmentId: any;
      resultdata[0].map((data: any) => {
        if (data.userId == userId) {
          shiftAssignmentId = data._id;
        }
      });
      console.log(shiftAssignmentId + 'Shift Assignment Id');
      console.log(userId + 'User Id');
      const startDateTime = new Date(startDate);
      const endDateTime = endDate ? new Date(endDate) : null;

      const isCurrentShift = startDateTime <= currentDate && (!endDateTime || endDateTime >= currentDate);
      const isUpcomingShift = startDateTime > currentDate;
      const isPastShift = endDateTime && endDateTime < currentDate;
      console.log(isCurrentShift, "isCurrentShift", "0", isUpcomingShift, "isUpcomingShift", "0", isPastShift, "isPastShift", "0");

      // Assign status accordingly
      let shiftStatus: 'current' | 'past' | 'upcoming' = 'upcoming';
      if (isCurrentShift) shiftStatus = 'current';
      if (isPastShift) shiftStatus = 'past';

      const updateObj: any = {};
      //  Track ShiftAssignment updates needed
      const shiftAssignmentUpdates = [];

      // Handle current shift assignment data
      if (user.currentShiftAssignmentData) {
        let needsUpdate = false;

        // Check for null endDate
        if (user.currentShiftAssignmentData.endDate === null) {
          // Only truncate if new shift starts AFTER or AT existing shift start
          const currentStart = new Date(user.currentShiftAssignmentData.startDate);
          if (startDateTime >= currentStart) {
            const newEndDate = new Date(startDateTime.getTime() - 24 * 60 * 60 * 1000); // previous day
            user.currentShiftAssignmentData.endDate = newEndDate;
            needsUpdate = true;
          }
        }
        // Check for endDate after or overlapping new startDate
        else if (
          user.currentShiftAssignmentData.endDate &&
          new Date(user.currentShiftAssignmentData.endDate) >= startDateTime
        ) {
          const currentStart = new Date(user.currentShiftAssignmentData.startDate);
          // Only truncate if new shift starts AFTER or AT existing shift start
          if (startDateTime >= currentStart) {
            const newEndDate = new Date(startDateTime.getTime() - 24 * 60 * 60 * 1000); // previous day
            user.currentShiftAssignmentData.endDate = newEndDate;
            needsUpdate = true;
          }
        }

        // ENHANCEMENT: Update the corresponding ShiftAssignment record if needed
        if (needsUpdate && user.currentShiftAssignmentData.shiftAssignmentId) {
          shiftAssignmentUpdates.push(
            ShiftAssignment.findByIdAndUpdate(
              user.currentShiftAssignmentData.shiftAssignmentId,
              {
                $set: {
                  endDate: user.currentShiftAssignmentData.endDate,
                  modifiedAt: currentDate,
                  modifiedBy: assignedBy
                }
              }
            )
          );
        }
      }

      // Set up current and upcoming shift data
      if (isCurrentShift) {
        updateObj.currentShiftAssignmentData = {
          startDate,
          endDate,
          shiftCode,
          shiftAssignmentId,
          shiftId: new Types.ObjectId(shiftId),
          status: shiftStatus,
          isActive: true,
        };
      } else {
        updateObj.currentShiftAssignmentData = user.currentShiftAssignmentData;
      }

      if (isUpcomingShift) {
        // Handle current shift endDate adjustment for upcoming shifts
        if (updateObj.currentShiftAssignmentData && !updateObj.currentShiftAssignmentData.endDate) {
          if (startDate) {
            const endDateValue = new Date(startDate);
            endDateValue.setUTCDate(endDateValue.getUTCDate() - 1);
            updateObj.currentShiftAssignmentData.endDate = endDateValue.toISOString();

            // ENHANCEMENT: Update the corresponding ShiftAssignment for current shift
            if (updateObj.currentShiftAssignmentData.shiftAssignmentId) {
              shiftAssignmentUpdates.push(
                ShiftAssignment.findByIdAndUpdate(
                  updateObj.currentShiftAssignmentData.shiftAssignmentId,
                  {
                    $set: {
                      endDate: updateObj.currentShiftAssignmentData.endDate,
                      modifiedAt: currentDate,
                      modifiedBy: assignedBy
                    }
                  }
                )
              );
            }
          }
        }

        updateObj.upcomingShiftAssignmentData = {
          startDate,
          endDate,
          shiftCode,
          shiftAssignmentId,
          shiftId: new Types.ObjectId(shiftId),
          status: shiftStatus,
          isActive: true,
        };
      } else {
        updateObj.upcomingShiftAssignmentData = user.upcomingShiftAssignmentData;
      }

      // Execute any needed ShiftAssignment updates
      if (shiftAssignmentUpdates.length > 0) {
        await Promise.all(shiftAssignmentUpdates);
      }

      // Update the user
      const data = await User.findByIdAndUpdate(userId, {
        $set: updateObj
      });

      return data;
    });


    // Filter out null updates and add valid promises
    const validUserUpdatePromises = userUpdatePromises.filter(promise => promise !== null);
    operationsTwo.push(...validUserUpdatePromises);

    await Promise.all(operationsTwo);
    // Update shift assignments for all affected users
    const allAffectedUserIds = [...new Set([...addUserIds, ...removeUserIds])];
    await Promise.all(
      allAffectedUserIds.map(userId =>
        this.updateUserShiftAssignments(new Types.ObjectId(userId))
      )
    );

    return {
      message: 'Shift assignments updated successfully',
      addedCount: addUserIds.length,
      removedCount: removeUserIds.length
    };
  }

  async bulkUpdateShift(data: IShiftAssignmentBulkUpdate) {
    console.log("1,bulkUpdateShift", data);
    const { shiftAssignmentId, shiftId, startDate, endDate, modifiedBy, shiftCode, weekends, createNew = false } = data;
    const currentDate = new Date();

    // Convert shiftAssignmentId to ObjectId for consistent handling
    const shiftAssignmentIdObj = typeof shiftAssignmentId === 'string'
      ? new Types.ObjectId(shiftAssignmentId)
      : shiftAssignmentId;
    const shiftAssignmentIdStr = shiftAssignmentIdObj.toString();

    // Validate shift assignment exists
    const shiftAssignment = await ShiftAssignment.findById(shiftAssignmentIdObj);
    console.log(shiftAssignment, "shiftAssignment");
    if (!shiftAssignment) {
      throw new Error('Shift assignment not found');
    }

    // Find the user associated with this shift assignment
    const userId = shiftAssignment.userId;
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found for this shift assignment');
    }

    // Validate shift exists if shiftId is provided
    if (shiftId) {
      const shift = await Shift.findById(shiftId);
      if (!shift) {
        throw new Error('Shift not found');
      }
    }

    // Validate dates
    if (endDate && startDate && new Date(startDate) >= new Date(endDate)) {
      throw new Error('Start date must be before end date');
    }


    // Validate weekendDays
    const validatedWeekendDays = Array.isArray(weekends) &&
      weekends.every(d => Number.isInteger(d) && d >= 0 && d <= 6) &&
      weekends.length > 0
      ? weekends
      : shiftAssignment.weekendDays || [0]; // Retain existing or default to [0]


    // ── JOINING DATE VALIDATION (Allow max 1 day prior) ──
    if (user.joiningDate) {
      const updatedStart = startDate ? new Date(startDate) : new Date(shiftAssignment.startDate);
      const startDay = new Date(updatedStart.getTime() + (5.5 * 60 * 60 * 1000));
      const startDayStr = startDay.toISOString().split('T')[0];

      const joinDay = new Date(new Date(user.joiningDate).getTime() + (5.5 * 60 * 60 * 1000));
      const minAllowedDate = new Date(joinDay);
      minAllowedDate.setDate(minAllowedDate.getDate() - 1);
      const minAllowedDayStr = minAllowedDate.toISOString().split('T')[0];

      if (startDayStr < minAllowedDayStr) {
        throw new Error(`Start date (${startDayStr}) cannot be before ${minAllowedDayStr} (joining date is ${joinDay.toISOString().split('T')[0]})`);
      }
    }




    // Store original values for comparison
    const originalStartDate = shiftAssignment.startDate;
    const originalEndDate = shiftAssignment.endDate;
    const originalShiftId = shiftAssignment.shiftId;
    const originalWeekendDays = shiftAssignment.weekendDays || [0];
    const isWeekendChanged = JSON.stringify(validatedWeekendDays) !== JSON.stringify(originalWeekendDays);


    // Check if this shift is the current or upcoming shift for the user
    // Safely handle potential undefined shiftAssignmentId in user data
    const currentShiftAssignmentId = user.currentShiftAssignmentData?.shiftAssignmentId;
    const upcomingShiftAssignmentId = user.upcomingShiftAssignmentData?.shiftAssignmentId;

    const isCurrentForUser = currentShiftAssignmentId &&
      (currentShiftAssignmentId.toString() === shiftAssignmentIdStr ||
        (typeof currentShiftAssignmentId === 'object' && currentShiftAssignmentId.toString() === shiftAssignmentIdStr));

    const isUpcomingForUser = upcomingShiftAssignmentId &&
      (upcomingShiftAssignmentId.toString() === shiftAssignmentIdStr ||
        (typeof upcomingShiftAssignmentId === 'object' && upcomingShiftAssignmentId.toString() === shiftAssignmentIdStr));

    // HANDLE CREATE NEW ASSIGNMENT FLOW 
    // If createNew is true and changes are being made to a current assignment
    if (createNew && shiftAssignment.status === 'current' && isWeekendChanged) {
      // End the current assignment yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(23, 59, 59, 999);

      // Update the existing assignment to end yesterday and set status to past
      await ShiftAssignment.findByIdAndUpdate(
        shiftAssignmentIdObj,
        {
          $set: {
            endDate: yesterday,
            status: 'past',
            modifiedAt: currentDate,
            modifiedBy: typeof modifiedBy === 'string' ? new Types.ObjectId(modifiedBy) : modifiedBy
          }
        }
      );

      // Create a new assignment starting today with updated weekends
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Prepare new assignment data
      const newAssignmentData = {
        userId: shiftAssignment.userId,
        shiftId: shiftId || shiftAssignment.shiftId,
        shiftCode: shiftCode || shiftAssignment.shiftCode,
        startDate: today,
        endDate: endDate || shiftAssignment.endDate,
        weekendDays: validatedWeekendDays,
        assignedBy: typeof modifiedBy === 'string' ? new Types.ObjectId(modifiedBy) : (modifiedBy || shiftAssignment.assignedBy),
        assignedAt: currentDate,
        modifiedAt: currentDate,
        modifiedBy: typeof modifiedBy === 'string' ? new Types.ObjectId(modifiedBy) : modifiedBy,
        isActive: true,
        status: 'current'
      };

      // Create the new assignment
      const newAssignment = await ShiftAssignment.create(newAssignmentData);

      // Recalculate user shift status
      await this.recalculateUserShiftStatus(userId);

      return {
        message: 'Created new shift assignment with updated weekend days',
        updatedShiftAssignment: newAssignment
      };
    }
    // If createNew is true but the assignment is upcoming - just update the weekends
    else if (createNew && shiftAssignment.status === 'upcoming') {
      const updateFields: any = {
        modifiedAt: currentDate,
        modifiedBy: typeof modifiedBy === 'string' ? new Types.ObjectId(modifiedBy) : modifiedBy,
        weekendDays: validatedWeekendDays
      };

      if (startDate) updateFields.startDate = startDate;
      if (endDate !== undefined) updateFields.endDate = endDate;
      if (shiftId) updateFields.shiftId = new Types.ObjectId(shiftId);

      // Update shift code if needed
      if (shiftId && !(typeof shiftId === 'string' ? shiftId === originalShiftId.toString() : shiftId.equals(originalShiftId))) {
        const newShift = await Shift.findById(shiftId);
        if (newShift && newShift.code) {
          updateFields.shiftCode = newShift.code;
        }
      } else if (shiftCode) {
        updateFields.shiftCode = shiftCode;
      }

      const updatedShiftAssignment = await ShiftAssignment.findByIdAndUpdate(
        shiftAssignmentIdObj,
        { $set: updateFields },
        { new: true }
      );

      // Recalculate user shift status
      await this.recalculateUserShiftStatus(userId);

      //Mail
      if (user?.email) {
        // Ensure updatedStartDate is declared before use
        const updatedStartDateValue = updateFields.startDate || shiftAssignment.startDate;
        const updatedEndDateValue = updateFields.endDate !== undefined ? updateFields.endDate : shiftAssignment.endDate;

        // Declare shiftStatus before use
        let shiftStatus: 'current' | 'past' | 'upcoming' = shiftAssignment.status || 'upcoming';
        const isCurrentShift = new Date(updatedStartDateValue) <= currentDate &&
          (!updatedEndDateValue || new Date(updatedEndDateValue) >= currentDate);
        const isPastShift = updatedEndDateValue && new Date(updatedEndDateValue) < currentDate;
        if (isCurrentShift) shiftStatus = 'current';
        else if (isPastShift) shiftStatus = 'past';
        else shiftStatus = 'upcoming';

        const html = generateEmailTemplate('shiftUpdateEmail', {
          userName: user.name,
          companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS',
          shiftCode: updateFields.shiftCode,
          startDate: new Date(updatedStartDateValue).toDateString(),
          endDate: updatedEndDateValue ? new Date(updatedEndDateValue).toDateString() : 'Ongoing',
          status: shiftStatus,
          weekendDays: (updateFields.weekendDays || validatedWeekendDays).map((d: any) =>
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]
          ).join(', ')
        });

        await emailService.sendEmail({
          body: {
            to: user.email,
            subject: 'Shift Assignment Updated',
            text: `Dear ${user.name},\n\nYour shift assignment (${updateFields.shiftCode}) has been updated. Start Date: ${new Date(updatedStartDateValue).toDateString()}${updatedEndDateValue ? `, End Date: ${new Date(updatedEndDateValue).toDateString()}` : ''}.`,
            html
          }
        });
      }

      return {
        message: 'Upcoming shift assignment updated successfully',
        updatedShiftAssignment
      };
    }

    //  LOGIC FOR CURRENT/UPCOMING SHIFT SYNC
    // First, handle the date synchronization between current and upcoming shifts
    // This needs to happen BEFORE we update the main shift assignment

    // SCENARIO: We're updating a current shift
    if (isCurrentForUser && user.upcomingShiftAssignmentData) {
      const upcomingShiftId = user.upcomingShiftAssignmentData.shiftAssignmentId;
      if (!upcomingShiftId) {
        throw new Error('Upcoming shift assignment ID not found in user data');
      }
      const upcomingShift = await ShiftAssignment.findById(upcomingShiftId);

      if (upcomingShift) {
        // If we're updating the end date of a current shift
        if (endDate !== undefined) {
          const newEndDate = endDate ? new Date(endDate) : null;
          const upcomingStartDate = new Date(upcomingShift.startDate);

          // CASE 2: End date was extended beyond upcoming start (overlap)
          if (newEndDate && newEndDate >= upcomingStartDate) {
            console.log("Handling overlap: current shift end date extended beyond upcoming start");

            // Move upcoming start date to the day after the new end date
            const newUpcomingStart = newEndDate ? new Date(newEndDate) : null;
            if (newUpcomingStart) {

              newUpcomingStart.setDate(newUpcomingStart.getDate() + 1);
            }

            await ShiftAssignment.findByIdAndUpdate(
              upcomingShiftId,
              {
                $set: {
                  startDate: newUpcomingStart,
                  modifiedAt: currentDate,
                  modifiedBy: typeof modifiedBy === 'string' ? new Types.ObjectId(modifiedBy) : modifiedBy
                }
              }
            );

            console.log(`Updated upcoming shift start date to ${newUpcomingStart}`);
          }
          // CASE 1: End date was shortened creating a gap with upcoming start
          else {
            const idealNextDay = newEndDate ? new Date(newEndDate) : null;
            if (idealNextDay) {
              idealNextDay.setDate(idealNextDay.getDate() + 1);
            }

            // If there's a gap (upcoming starts more than 1 day after current ends)
            if (idealNextDay && upcomingStartDate > idealNextDay) {
              console.log("Handling gap: current shift end date shortened creating gap with upcoming");

              // Move upcoming start date to the day after the new end date
              const newUpcomingStart = newEndDate ? new Date(newEndDate) : null;
              newUpcomingStart && newUpcomingStart.setDate(newUpcomingStart.getDate() + 1);

              await ShiftAssignment.findByIdAndUpdate(
                upcomingShiftId,
                {
                  $set: {
                    startDate: newUpcomingStart,
                    modifiedAt: currentDate,
                    modifiedBy: typeof modifiedBy === 'string' ? new Types.ObjectId(modifiedBy) : modifiedBy
                  }
                }
              );

              console.log(`Updated upcoming shift start date to ${newUpcomingStart}`);
            }
          }
        }
      }
    }

    // SCENARIO: We're updating an upcoming shift
    else if (isUpcomingForUser && user.currentShiftAssignmentData) {
      const currentShiftId = user.currentShiftAssignmentData.shiftAssignmentId;
      if (!currentShiftId) {
        throw new Error('Current shift assignment ID not found in user data');
      }
      const currentShift = await ShiftAssignment.findById(currentShiftId);

      if (currentShift) {
        // If we're updating the start date of an upcoming shift
        if (startDate) {
          const newStartDate = new Date(startDate);

          // CASE 3: If current shift has no end date or there's an overlap
          if (!currentShift.endDate || new Date(currentShift.endDate) >= newStartDate) {
            console.log("Handling current shift overlap with new upcoming start date");

            // Set current shift end date to day before upcoming starts
            const newCurrentEnd = new Date(newStartDate);
            newCurrentEnd.setDate(newCurrentEnd.getDate() - 1);

            await ShiftAssignment.findByIdAndUpdate(
              currentShiftId,
              {
                $set: {
                  endDate: newCurrentEnd,
                  modifiedAt: currentDate,
                  modifiedBy: typeof modifiedBy === 'string' ? new Types.ObjectId(modifiedBy) : modifiedBy
                }
              }
            );

            console.log(`Updated current shift end date to ${newCurrentEnd}`);
          }
          // CASE 4: Start date was moved later creating a gap with current end
          else if (currentShift.endDate) {
            const currentEndDate = new Date(currentShift.endDate);
            const idealNextDay = new Date(currentEndDate);
            idealNextDay.setDate(idealNextDay.getDate() + 1);

            // If there's a gap (upcoming starts more than 1 day after current ends)
            if (newStartDate > idealNextDay) {
              console.log("Handling gap: upcoming start date moved creating gap with current end");

              // Extend current end date to the day before the new start date
              const newCurrentEnd = new Date(newStartDate);
              newCurrentEnd.setDate(newCurrentEnd.getDate() - 1);

              await ShiftAssignment.findByIdAndUpdate(
                currentShiftId,
                {
                  $set: {
                    endDate: newCurrentEnd,
                    modifiedAt: currentDate,
                    modifiedBy: typeof modifiedBy === 'string' ? new Types.ObjectId(modifiedBy) : modifiedBy
                  }
                }
              );

              console.log(`Updated current shift end date to ${newCurrentEnd}`);
            }
          }
        }
      }
    }

    // Now determine updated status for the shift we're editing
    const updatedStartDate = startDate || originalStartDate;
    const updatedEndDate = endDate !== undefined ? endDate : originalEndDate;

    let shiftStatus: 'current' | 'past' | 'upcoming' = shiftAssignment.status || 'upcoming';

    const isCurrentShift = new Date(updatedStartDate) <= currentDate &&
      (!updatedEndDate || new Date(updatedEndDate) >= currentDate);
    const isPastShift = updatedEndDate && new Date(updatedEndDate) < currentDate;

    if (isCurrentShift) shiftStatus = 'current';
    else if (isPastShift) shiftStatus = 'past';
    else shiftStatus = 'upcoming';

    // Update the shift assignment
    const updateFields: any = {
      modifiedAt: currentDate,
      modifiedBy: typeof modifiedBy === 'string' ? new Types.ObjectId(modifiedBy) : modifiedBy,
      status: shiftStatus,
      weekendDays: validatedWeekendDays,
    };

    if (startDate) updateFields.startDate = startDate;
    if (endDate !== undefined) updateFields.endDate = endDate;
    if (shiftId) updateFields.shiftId = new Types.ObjectId(shiftId);

    // If shift ID is changed, get the shift code from the new shift
    if (shiftId && !(typeof shiftId === 'string' ? shiftId === originalShiftId.toString() : shiftId.equals(originalShiftId))) {
      const newShift = await Shift.findById(shiftId);
      if (newShift && newShift.code) {
        updateFields.shiftCode = newShift.code;
      }
    } else if (shiftCode) {
      // If shiftCode is provided directly in the update
      updateFields.shiftCode = shiftCode;
    }

    console.log(updateFields, "updateFields after updateShiftAssignment");

    const updatedShiftAssignment = await ShiftAssignment.findByIdAndUpdate(
      shiftAssignmentIdObj,
      { $set: updateFields },
      { new: true }
    );

    // Now update the user's shift data
    await this.recalculateUserShiftStatus(userId);

    return {
      message: 'Shift assignment updated successfully',
      updatedShiftAssignment
    };
  }


  /**
   * Updates a user's current and upcoming shift assignments
   * by finding the most appropriate assignments based on dates
   */
  async recalculateUserShiftStatus(userId: string | Types.ObjectId) {
    // Get all active shift assignments for this user, sorted by start date
    const shiftAssignments = await ShiftAssignment.find({
      userId,
      isActive: true
    }).sort({ startDate: 1 });

    if (!shiftAssignments.length) {
      // No shift assignments, clear user shift data
      await User.findByIdAndUpdate(userId, {
        $set: {
          currentShiftAssignmentData: null,
          upcomingShiftAssignmentData: null
        }
      });
      return;
    }

    const currentDate = new Date();
    // Set to start of day for proper date comparison (UTC)
    const currentDateStart = new Date(currentDate);
    currentDateStart.setUTCHours(0, 0, 0, 0);

    let currentShiftAssignment: IShiftAssignment | null = null;
    let upcomingShiftAssignment: IShiftAssignment | null = null;

    // First, mark any upcoming shifts that should be current now
    for (const assignment of shiftAssignments) {
      const startDate = new Date(assignment.startDate);
      const endDate = assignment.endDate ? new Date(assignment.endDate) : null;

      // If this is an upcoming shift but its start date has arrived, convert it to current
      if (assignment.status === 'upcoming' && startDate <= currentDate && (!endDate || endDate >= currentDate)) {
        await ShiftAssignment.findByIdAndUpdate(assignment._id, {
          $set: { status: 'current' }
        });
        assignment.status = 'current';
        console.log(`🔄 [recalculateUserShiftStatus] Converted upcoming shift ${assignment._id} to current (startDate: ${startDate.toISOString()})`);
      }
    }

    // Refresh assignments array to get any shifts that were just converted
    // This ensures we have the latest status when filtering
    const refreshedAssignments = await ShiftAssignment.find({
      userId,
      isActive: true
    }).sort({ startDate: 1 });

    // Find current shift assignment (startDate <= now && (endDate >= now || endDate == null))
    // Prioritize the one that started most recently (if multiple overlap)
    const potentialCurrentAssignments = refreshedAssignments.filter(assignment => {
      const startDate = new Date(assignment.startDate);
      const endDate = assignment.endDate ? new Date(assignment.endDate) : null;
      return startDate <= currentDate && (!endDate || endDate >= currentDate);
    }).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    currentShiftAssignment = potentialCurrentAssignments[0] || null; // Most recent first

    // If there are multiple potential current assignments, mark older ones as past
    if (potentialCurrentAssignments.length > 1 && currentShiftAssignment) {
      for (let i = 1; i < potentialCurrentAssignments.length; i++) {
        const olderAssignment = potentialCurrentAssignments[i];
        // Set end date to day before the new current assignment starts
        const newCurrentStart = new Date(currentShiftAssignment.startDate);
        newCurrentStart.setUTCHours(0, 0, 0, 0);
        const previousDay = new Date(newCurrentStart);
        previousDay.setUTCDate(previousDay.getUTCDate() - 1);
        previousDay.setUTCHours(23, 59, 59, 999);

        olderAssignment.endDate = previousDay;
        olderAssignment.status = 'past';
        olderAssignment.isActive = false;
        await ShiftAssignment.findByIdAndUpdate(olderAssignment._id, {
          $set: {
            endDate: previousDay,
            status: 'past',
            isActive: false
          }
        });
      }
    }

    // Update status for current shift assignment
    if (currentShiftAssignment) {
      if (currentShiftAssignment.status !== 'current') {
        await ShiftAssignment.findByIdAndUpdate(currentShiftAssignment._id, {
          $set: { status: 'current' }
        });
        currentShiftAssignment.status = 'current';
      }
    }

    // Find upcoming shift assignment (startDate > now)
    // Compare dates properly: upcoming shift starts in the future
    // Use refreshedAssignments to ensure we have latest status
    const foundUpcoming = refreshedAssignments.find(assignment => {
      const startDate = new Date(assignment.startDate);
      // Set to start of day for comparison
      const startDateStart = new Date(startDate);
      startDateStart.setUTCHours(0, 0, 0, 0);
      // Upcoming if start date is after today (at start of day) and it's not the current assignment
      // Also exclude assignments that are already marked as past
      return startDateStart > currentDateStart &&
        assignment._id.toString() !== (currentShiftAssignment?._id.toString() || '') &&
        assignment.status !== 'past';
    });
    upcomingShiftAssignment = foundUpcoming || null;

    // Update status for upcoming shift assignment
    if (upcomingShiftAssignment) {
      if (upcomingShiftAssignment.status !== 'upcoming') {
        await ShiftAssignment.findByIdAndUpdate(upcomingShiftAssignment._id, {
          $set: { status: 'upcoming' }
        });
        upcomingShiftAssignment.status = 'upcoming';
      }
    }

    // Mark past shift assignments - use refreshedAssignments which has latest status
    for (const assignment of refreshedAssignments) {
      if (
        assignment.endDate &&
        new Date(assignment.endDate) < currentDate &&
        assignment.status !== 'past' &&
        assignment._id.toString() !== currentShiftAssignment?._id.toString()
      ) {
        await ShiftAssignment.findByIdAndUpdate(assignment._id, {
          $set: {
            status: 'past',
            isActive: false
          }
        });
        assignment.status = 'past';
        assignment.isActive = false;
        console.log(`📅 [recalculateUserShiftStatus] Marked shift ${assignment._id} as past (endDate: ${assignment.endDate.toISOString()})`);
      }
    }

    // Final refresh after all status updates to ensure we have the latest data for user update
    const finalAssignments = await ShiftAssignment.find({
      userId,
      isActive: true
    }).sort({ startDate: 1 });

    // Re-find current and upcoming with final data
    const finalCurrent = finalAssignments.find(assignment => {
      const startDate = new Date(assignment.startDate);
      const endDate = assignment.endDate ? new Date(assignment.endDate) : null;
      return startDate <= currentDate && (!endDate || endDate >= currentDate);
    });

    const finalUpcoming = finalAssignments.find(assignment => {
      const startDate = new Date(assignment.startDate);
      const startDateStart = new Date(startDate);
      startDateStart.setUTCHours(0, 0, 0, 0);
      return startDateStart > currentDateStart &&
        assignment._id.toString() !== (finalCurrent?._id.toString() || '') &&
        assignment.status !== 'past';
    });

    // Use final assignments for user update
    currentShiftAssignment = finalCurrent || currentShiftAssignment || null;
    upcomingShiftAssignment = finalUpcoming || upcomingShiftAssignment || null;

    // Format the shift data for user update
    const currentShiftData = currentShiftAssignment ? {
      shiftAssignmentId: currentShiftAssignment._id,
      startDate: currentShiftAssignment.startDate,
      endDate: currentShiftAssignment.endDate,
      shiftCode: currentShiftAssignment.shiftCode,
      shiftId: currentShiftAssignment.shiftId,
      status: currentShiftAssignment.status,
      isActive: currentShiftAssignment.isActive
    } : null;

    const upcomingShiftData = upcomingShiftAssignment ? {
      shiftAssignmentId: upcomingShiftAssignment._id,
      startDate: upcomingShiftAssignment.startDate,
      endDate: upcomingShiftAssignment.endDate,
      shiftCode: upcomingShiftAssignment.shiftCode,
      shiftId: upcomingShiftAssignment.shiftId,
      status: upcomingShiftAssignment.status,
      isActive: upcomingShiftAssignment.isActive
    } : null;

    // Update user with current and upcoming shift data
    await User.findByIdAndUpdate(userId, {
      $set: {
        currentShiftAssignmentData: currentShiftData,
        upcomingShiftAssignmentData: upcomingShiftData
      }
    });

    return {
      currentShiftAssignmentData: currentShiftData,
      upcomingShiftAssignmentData: upcomingShiftData
    };
  }

  async deleteShiftAssignment(assignmentId: string) {
    const session = await ShiftAssignment.startSession();
    session.startTransaction();

    try {
      // 1. Find shift assignment
      const shiftAssignment = await ShiftAssignment.findById(assignmentId);
      if (!shiftAssignment) {
        throw new Error('Shift assignment not found');
      }

      // 2. Find affected users
      const affectedUsers = await User.find({
        $or: [
          { 'currentShiftAssignmentData.shiftAssignmentId': assignmentId },
          { 'upcomingShiftAssignmentData.shiftAssignmentId': assignmentId }
        ]
      });

      // 3. Update user records
      for (const user of affectedUsers) {
        // Clear current shift data if matches
        if (user.currentShiftAssignmentData?.shiftAssignmentId?.toString() === assignmentId) {
          user.currentShiftAssignmentData = null;
        }

        // Clear upcoming shift data if matches
        if (user.upcomingShiftAssignmentData?.shiftAssignmentId?.toString() === assignmentId) {
          user.upcomingShiftAssignmentData = null;
        }

        await user.save({ session });
      }

      // 4. Delete shift assignment
      await ShiftAssignment.findByIdAndDelete(assignmentId, { session });

      await session.commitTransaction();

      return {
        success: true,
        affectedUsers: affectedUsers.length
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  //get shift assignment by userId
  async getShiftAssignmentByUserId(userId: string, DateQuery: IDateQuery) {
    const { startDate, endDate } = DateQuery;
    console.log("getShiftAssignmentByUserId", userId, startDate, endDate)

    // Validate startDate
    if (!startDate) {
      throw new Error('Invalid or missing startDate');
    }

    // Convert startDate and endDate to UTC
    const startUTC = new Date(`${startDate}T00:00:00Z`);
    const endUTC = endDate ? new Date(`${endDate}T23:59:59Z`) : startUTC;
    console.log(userId, startUTC, endUTC, "************")
    // Fetch shift assignments for the user within the date range
    const shiftAssignments = await ShiftAssignment.find({
      userId: new Types.ObjectId(userId),
      $or: [
        // Assignment starts within the query range
        { startDate: { $gte: startUTC, $lte: endUTC } },
        // Assignment is ongoing (endDate: null) and started before or on endUTC
        { endDate: null, startDate: { $lte: endUTC } },
        // Assignment spans the query range (starts before and ends after)
        { startDate: { $lte: startUTC }, endDate: { $gte: endUTC } },
        // Assignment ends within the query range
        { endDate: { $gte: startUTC, $lte: endUTC } }
      ]
    })
      .sort({ startDate: -1 })
      .lean();
    console.log(shiftAssignments, "shiftAssignmentsshiftAssignments")


    // Map weekendDays to day names
    const formattedAssignments = shiftAssignments.map(assignment => ({
      shiftAssignmentId: assignment._id,
      shiftCode: assignment.shiftCode,
      startDate: assignment.startDate.toISOString(),
      endDate: assignment.endDate ? assignment.endDate.toISOString() : null,
      weekendDays: assignment.weekendDays,

    }));
    console.log(formattedAssignments, "formattedAssignments");
    return formattedAssignments;
  }

  async updateShiftAssignments(userId: Types.ObjectId) {
    try {
      // Fetch the user by userId
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const currentDate = new Date();
      const yesterday = new Date(currentDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const upComingShiftId: any = user.upcomingShiftAssignmentData && user.upcomingShiftAssignmentData.shiftAssignmentId;
      const currentShiftId: any = user.currentShiftAssignmentData && user.currentShiftAssignmentData.shiftAssignmentId;

      console.log(upComingShiftId + 'Current Shift Assignment Id');
      // Check if the end date for currentShiftAssignmentData is yesterday
      if (user.currentShiftAssignmentData && user.currentShiftAssignmentData.endDate && new Date(user.currentShiftAssignmentData.endDate).toDateString() === yesterday.toDateString()) {
        if (user.upcomingShiftAssignmentData && user.upcomingShiftAssignmentData.startDate) {
          const upcomingStartDate = new Date(user.upcomingShiftAssignmentData.startDate);

          // If upcomingShiftAssignmentData start date is today, replace currentShiftAssignmentData
          if (upcomingStartDate.toDateString() === currentDate.toDateString()) {
            user.currentShiftAssignmentData = {
              ...user.upcomingShiftAssignmentData,
              endDate: null // Assuming the new current shift assignment has no end date initially
            };
            user.upcomingShiftAssignmentData = null as any;
          } else {
            // If upcomingShiftAssignmentData start date is not today, set currentShiftAssignmentData to null
            user.currentShiftAssignmentData = null as any;
          }
        } else {
          // If upcomingShiftAssignmentData is null, set currentShiftAssignmentData to null
          user.currentShiftAssignmentData = null as any;
        }

        // Save the updated user document
        console.log(user + 'User Data');
        const data: any = await user.save();

        if (upComingShiftId) {
          const shiftAssignment = await ShiftAssignment.findById(upComingShiftId);
          if (shiftAssignment) {
            shiftAssignment.isActive = true;
            const result = await shiftAssignment.save();
            console.log(result, "Reslut --> Upcoming  ");
            console.log('Shift assignment updated to inactive:', upComingShiftId);
          }
        }

        if (currentShiftId) {
          const shiftAssignment = await ShiftAssignment.findById(currentShiftId);
          if (shiftAssignment) {
            shiftAssignment.isActive = true;
            const result = await shiftAssignment.save();
            console.log(result, "Reslut --> Current  ");
            console.log('Shift assignment updated to inactive:', currentShiftId);
          }
        }

        console.log(data, 'Data');
        return data;
      } else {
        console.log('No updates needed for user:', userId);
      }
    } catch (error) {
      console.error('Error updating shift assignments:', error);
      throw error;
    }
  }

  // Method to get a shift record by its _id
  async getShiftById(shiftId: Types.ObjectId | string): Promise<IShift | null> {
    try {
      const shift = await Shift.findById(shiftId);
      if (!shift) {
        throw new Error('Shift not found');
      }
      return shift;
    } catch (error) {
      console.error(`Error fetching shift by ID: ${error}`);
      throw error;
    }
  }

}

