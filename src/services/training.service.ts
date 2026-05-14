import { Types } from 'mongoose';
import { Training, TrainingAssignment, User } from '../models';
import { ITraining, ITrainingAssignment } from '../models/training.model';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';

export interface ITrainingCreate {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  trainingWindowStart: string;
  trainingWindowEnd: string;
  applicableForRoles: Types.ObjectId[];
  validFrom: Date;
  validTill?: Date;
  description?: string;
  graceTimeInMinutes?: number;
  trainer: string;
  location: string;
  maxParticipants: number;
  prerequisites?: string[];
  materials?: string[];
  objectives?: string[];
  assessmentCriteria?: string[];
}

export interface ITrainingUpdate {
  name?: string;
  startTime?: string;
  endTime?: string;
  trainingWindowStart?: string;
  trainingWindowEnd?: string;
  applicableForRoles?: Types.ObjectId[];
  validTill?: Date;
  description?: string;
  graceTimeInMinutes?: number;
  isActive?: boolean;
  trainer?: string;
  location?: string;
  maxParticipants?: number;
  prerequisites?: string[];
  materials?: string[];
  objectives?: string[];
  assessmentCriteria?: string[];
}

export interface ITrainingAssignmentCreate {
  userId: Types.ObjectId;
  trainingId: Types.ObjectId;
  startDate: Date;
  endDate?: Date;
  assignedBy: Types.ObjectId;
  completionStatus?: 'pending' | 'completed' | 'failed' | 'dropped';
  assessmentScore?: number;
  feedback?: string;
  certificateId?: string;
}

export interface ITrainingAssignmentUpdate {
  endDate?: Date;
  isActive?: boolean;
  completionStatus?: 'pending' | 'completed' | 'failed' | 'dropped';
  assessmentScore?: number;
  feedback?: string;
  certificateId?: string;
  modifiedBy: Types.ObjectId;
}

export interface ITrainingQuery {
  search?: string;
  isActive?: boolean;
  role?: string;
  trainerId?: string;
  validOn?: Date;
  page?: number;
  limit?: number;
}

export interface ITrainingAssignmentQuery {
  userId?: Types.ObjectId;
  trainingId?: Types.ObjectId;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
  completionStatus?: 'pending' | 'completed' | 'failed' | 'dropped';
  page?: number;
  limit?: number;
}

interface IBulkTrainingAssignment {
  employeeIds: string[];
  validFrom: Date;  // DateTime in UTC
  validTill: Date;  // DateTime in UTC
  trainingId?: string;
}

interface ITrainingAssignmentBulk {
  addUserIds: string[];
  removeUserIds: string[];
  trainingId: string;
  trainingCode: string;
  startDate: Date;  // DateTime in UTC
  endDate?: Date;   // DateTime in UTC
  assignedBy: Types.ObjectId;
}

export class TrainingService extends BaseService {  
  constructor(context: RequestContext) {
    super(context);
  }

  // Training Definition Methods
  async findTrainingById(id: string): Promise<ITraining | null> {
    return Training.findById(id)
      .populate('applicableForRoles', 'value')
      .populate('trainer', 'name email');
  }

  async findAllTrainings(query: ITrainingQuery): Promise<{ trainings: ITraining[], meta: { page: number, limit: number, total: number, totalPages: number } }> {
    const { search, isActive, role, trainerId, validOn, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (typeof isActive === 'boolean') filter.isActive = isActive;
    if (role) filter.applicableForRoles = role;
    if (trainerId) filter.trainer = trainerId;
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

    const [trainings, total] = await Promise.all([
      Training.find(filter)
        .populate('applicableForRoles', 'value')
        .populate('trainer', 'name email')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Training.countDocuments(filter),
    ]);

    return {
      trainings,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createTraining(trainingData: ITrainingCreate): Promise<ITraining | null> {
    // Check if code already exists
    const existingTraining = await Training.findOne({ code: trainingData.code.toUpperCase() });
    if (existingTraining) {
      throw new Error('Training code already exists');
    }

    const training = await Training.create({
      ...trainingData,
      code: trainingData.code.toUpperCase(),
      trainer: new Types.ObjectId(trainingData.trainer)
    });

    return this.findTrainingById(training.id);
  }

  async updateTraining(id: string, updateData: ITrainingUpdate): Promise<ITraining> {
    if (updateData.trainer) {
      updateData.trainer = new Types.ObjectId(updateData.trainer) as any;
    }
   

    const training = await Training.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    ).populate('applicableForRoles', 'value').populate('trainer', 'name email');

    if (!training) {
      throw new Error('Training not found');
    }

    return training;
  }

  async deleteTraining(id: string): Promise<{ message: string }> {
    const training = await Training.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true },
    );

    if (!training) {
      throw new Error('Training not found');
    }

    return { message: 'Training deactivated successfully' };
  }

  // Training Assignment Methods
  async findAssignmentById(id: string): Promise<ITrainingAssignment | null> {
    return TrainingAssignment.findById(id)
      .populate('userId', 'name email')
      .populate('trainingId', 'name code')
      .populate('assignedBy', 'name email')
      .populate('modifiedBy', 'name email');
  }

  async findAllAssignments(query: ITrainingAssignmentQuery): Promise<{ assignments: ITrainingAssignment[], meta: { page: number, limit: number, total: number, totalPages: number } }> {
    const { userId, trainingId, startDate, endDate, isActive, completionStatus, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (userId) filter.userId = userId;
    if (trainingId) filter.trainingId = trainingId;
    if (typeof isActive === 'boolean') filter.isActive = isActive;
    if (completionStatus) filter.completionStatus = completionStatus;
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
      TrainingAssignment.find(filter)
        .populate('userId', 'name email')
        .populate('trainingId', 'name code')
        .populate('assignedBy', 'name email')
        .populate('modifiedBy', 'name email')
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(limit),
      TrainingAssignment.countDocuments(filter),
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

  async createBulkAssignments(data: IBulkTrainingAssignment, assignedBy: Types.ObjectId): Promise<ITrainingAssignment[]> {
    const { employeeIds, validFrom, validTill } = data;
    const currentDate = new Date();

    // Validate dates
    if (validFrom >= validTill) {
      throw new Error('Valid from date must be before valid till date');
    }

    // Create assignments in bulk
    const assignments = await Promise.all(employeeIds.map(async (employeeId) => {
      const assignment = await TrainingAssignment.create({
        userId: new Types.ObjectId(employeeId),
        trainingId: data.trainingId ? new Types.ObjectId(data.trainingId) : undefined,
        startDate: validFrom,
        endDate: validTill,
        assignedBy,
        assignedAt: currentDate,
        isActive: true,
        completionStatus: 'pending'
      });

      return assignment;
    }));

    return assignments;
  }

  async updateUserTrainingAssignments(userId: Types.ObjectId): Promise<void> {
    const currentDate = new Date();

    // Find current and upcoming assignments
    const assignments = await TrainingAssignment.find({
      userId,
      isActive: true,
      endDate: { $gte: currentDate }
    }).sort({ startDate: 1 });

    if (!assignments.length) {
      return;
    }

    // Update user's training assignments
    await User.findByIdAndUpdate(userId, {
      $set: {
        currentTrainings: assignments
          .filter(assignment => assignment.startDate <= currentDate && (!assignment.endDate || assignment.endDate >= currentDate))
          .map(assignment => assignment._id),
        upcomingTrainings: assignments
          .filter(assignment => assignment.startDate > currentDate)
          .map(assignment => assignment._id)
      }
    });
  }

  async createAssignment(data: ITrainingAssignmentCreate): Promise<ITrainingAssignment> {
    const training = await Training.findById(data.trainingId);
    if (!training) {
      throw new Error('Training not found');
    }

    // Check max participants
    const currentParticipants = await TrainingAssignment.countDocuments({
      trainingId: data.trainingId,
      isActive: true
    });

    if (currentParticipants >= training.maxParticipants) {
      throw new Error('Maximum participants limit reached for this training');
    }

    const assignment = await TrainingAssignment.create({
      ...data,
      trainingCode: training.code,
      isActive: true,
      assignedAt: new Date(),
      completionStatus: data.completionStatus || 'pending'
    });

    // Update user's training assignments
    await this.updateUserTrainingAssignments(data.userId);

    return assignment;
  }

  async updateAssignment(id: string, data: ITrainingAssignmentUpdate): Promise<ITrainingAssignment> {
    const assignment = await TrainingAssignment.findByIdAndUpdate(
      id,
      {
        ...data,
        modifiedAt: new Date()
      },
      { new: true }
    );

    if (!assignment) {
      throw new Error('Training assignment not found');
    }

    // Update user's training assignments if status changed
    if (data.isActive !== undefined) {
      await this.updateUserTrainingAssignments(assignment.userId);
    }

    return assignment;
  }

  async deactivateAssignment(id: string): Promise<ITrainingAssignment> {
    const assignment = await TrainingAssignment.findByIdAndUpdate(
      id,
      {
        isActive: false,
        modifiedAt: new Date()
      },
      { new: true }
    );

    if (!assignment) {
      throw new Error('Training assignment not found');
    }

    // Update user's training assignments
    await this.updateUserTrainingAssignments(assignment.userId);

    return assignment;
  }

  async getCurrentTrainings(userId: Types.ObjectId): Promise<ITrainingAssignment[]> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return TrainingAssignment.find({
      userId,
      isActive: true,
      startDate: { $lte: today },
      $or: [
        { endDate: { $gte: tomorrow } },
        { endDate: null },
      ],
    }).populate('trainingId', 'name code startTime endTime graceTimeInMinutes location trainer')
     .populate('trainer', 'name email');
  }

  async bulkAssignTraining(data: ITrainingAssignmentBulk): Promise<{ message: string, addedCount: number, removedCount: number }> {
    const { addUserIds, removeUserIds, trainingId, trainingCode, startDate, endDate, assignedBy } = data;
    const currentDate = new Date();

    // Validate training exists and has capacity
    const training = await Training.findById(trainingId);
    if (!training) {
      throw new Error('Training not found');
    }

    // Validate dates
    if (endDate && startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }

    // Check capacity for new assignments
    const currentParticipants = await TrainingAssignment.countDocuments({
      trainingId,
      isActive: true
    });

    if (currentParticipants + addUserIds.length > training.maxParticipants) {
      throw new Error('Adding these participants would exceed maximum capacity');
    }

    const operations = [];

    // Handle removals first
    if (removeUserIds.length > 0) {
      const deactivatePromise = TrainingAssignment.updateMany(
        {
          userId: { $in: removeUserIds.map(id => new Types.ObjectId(id)) },
          trainingId: new Types.ObjectId(trainingId),
          trainingCode: trainingCode,
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
      const assignments = addUserIds.map(userId => ({
        userId: new Types.ObjectId(userId),
        trainingId: new Types.ObjectId(trainingId),
        trainingCode: trainingCode,
        startDate,
        endDate,
        assignedBy,
        assignedAt: currentDate,
        isActive: true,
        completionStatus: 'pending'
      }));

      const createPromise = TrainingAssignment.insertMany(assignments);
      operations.push(createPromise);

      // Update user documents for new assignments
      const userUpdatePromises = addUserIds.map(userId => 
        this.updateUserTrainingAssignments(new Types.ObjectId(userId))
      );
      operations.push(...userUpdatePromises);
    }

    // Execute all operations
    await Promise.all(operations);

    // Update training assignments for all affected users
    const allAffectedUserIds = [...new Set([...addUserIds, ...removeUserIds])];
    await Promise.all(
      allAffectedUserIds.map(userId => 
        this.updateUserTrainingAssignments(new Types.ObjectId(userId))
      )
    );

    return {
      message: 'Training assignments updated successfully',
      addedCount: addUserIds.length,
      removedCount: removeUserIds.length
    };
  }
}