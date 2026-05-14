import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { ITraining, TrainingAssignment } from '../models/training.model';
import { TrainingAttendanceRecord } from '../models/training-attendance.model';

interface ISwipeData {
  biometricId: string;
  timestamp: Date;
}

interface IAttendanceRecordsQuery {
  startDate: Date;
  endDate: Date;
  userIds?: string[];
  page: number;
  limit: number;
}
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';

export class TrainingAttendanceService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }
  private async getUserByBiometricId(biometricId: string) {
    const user = await User.findOne({ biometricId, active: true });
    if (!user) {
      throw new Error('User not found or inactive');
    }
    return user;
  }

  private async getCurrentTrainingAssignment(userId: Types.ObjectId, timestamp: Date) {
    const trainingDay = new Date(timestamp);
    trainingDay.setUTCHours(0, 0, 0, 0);
    
    // Find active training assignment for the user
    const trainingAssignment = await TrainingAssignment.findOne({
      userId,
      isActive: true,
      startDate: { $lte: trainingDay },
      $or: [
        { endDate: { $gte: trainingDay } },
        { endDate: null },
      ],
    }).populate<{ trainingId: any }>('trainingId');

    if (!trainingAssignment || !trainingAssignment.trainingId) {
      throw new Error('No active training assignment found');
    }
    return trainingAssignment;
  }
  
  private getTrainingTimings(training: ITraining & Document, trainingDay: Date) {
    // Parse all time fields
    const startTime = training.startTime.split(':').slice(0, 2).join(':');
    const endTime = training.endTime.split(':').slice(0, 2).join(':');
    const windowStartTime = training.trainingWindowStart.split(':').slice(0, 2).join(':');
    const windowEndTime = training.trainingWindowEnd.split(':').slice(0, 2).join(':');

    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    const [windowStartHours, windowStartMinutes] = windowStartTime.split(':').map(Number);
    const [windowEndHours, windowEndMinutes] = windowEndTime.split(':').map(Number);

    if (isNaN(startHours) || isNaN(startMinutes) || isNaN(endHours) || isNaN(endMinutes) ||
        isNaN(windowStartHours) || isNaN(windowStartMinutes) || isNaN(windowEndHours) || isNaN(windowEndMinutes)) {
      throw new Error('Invalid time format. Expected HH:mm or HH:mm:ss');
    }

    const trainingStart = new Date(trainingDay);
    trainingStart.setUTCHours(startHours, startMinutes, 0, 0);

    const trainingEnd = new Date(trainingDay);
    trainingEnd.setUTCHours(endHours, endMinutes, 0, 0);

    const windowStart = new Date(trainingDay);
    windowStart.setUTCHours(windowStartHours, windowStartMinutes, 0, 0);

    const windowEnd = new Date(trainingDay);
    windowEnd.setUTCHours(windowEndHours, windowEndMinutes, 0, 0);

    // Adjust for next day if needed
    if (endHours < startHours || (endHours === startHours && endMinutes < startMinutes)) {
      trainingEnd.setUTCDate(trainingEnd.getUTCDate() + 1);
    }
    if (windowEndHours < windowStartHours || (windowEndHours === windowStartHours && windowEndMinutes < windowStartMinutes)) {
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
    }

    return {
      trainingStart,
      trainingEnd,
      windowStart,
      windowEnd
    };
  }

  private async findOrCreateAttendanceRecord(
    userId: Types.ObjectId,
    trainingId: Types.ObjectId,
    trainingDay: Date,
    trainingCode: string,
    trainingStart: Date,
    trainingEnd: Date,
  ) {
    let record = await TrainingAttendanceRecord.findOne({
      userId,
      trainingDay,
      trainingCode,
    });
    if (!record) {
      record = await TrainingAttendanceRecord.create({
        userId,
        trainingId,
        trainingDay,
        trainingCode,
        trainingStart,
        trainingEnd,
        swipes: [],
        outOfWindowSwipes: [],
        needsRegularization: false,
        attendanceStatus: [],
        isLateEntry: false,
        isEarlyExit: false,
        isWithinWindow: true,
        overtime: '0:00:00',
        shortTime: '0:00:00',
        status: 'incomplete'
      });
    }

    return record;
  }

  async processSwipe(swipeData: ISwipeData) {
    console.log(swipeData, 'swipeData');
    const { biometricId, timestamp } = swipeData;

    // Find user by biometric ID
    const user = await this.getUserByBiometricId(biometricId);

    // Get current training assignment
    const trainingAssignment = await this.getCurrentTrainingAssignment(user._id, timestamp);
    const training = trainingAssignment.trainingId;
    console.log(training, 'training');
    // Get training timings
    const trainingDay = new Date(timestamp);
    trainingDay.setUTCHours(0, 0, 0, 0); // Normalize to start of UTC day
    
    const { trainingStart, trainingEnd, windowStart, windowEnd } = this.getTrainingTimings(training, trainingDay);

    // Find or create attendance record
    const record = await this.findOrCreateAttendanceRecord(
      user._id,
      training._id,
      trainingDay,
      trainingAssignment.trainingCode,
      trainingStart,
      trainingEnd
    );
    console.log(record, 'record');
    // Initialize arrays if they don't exist
    if (!record.swipes) record.swipes = [];
    if (!record.outOfWindowSwipes) record.outOfWindowSwipes = [];
    if (!record.attendanceStatus) record.attendanceStatus = [];

    // Check if swipe is within window
    const isWithinWindow = timestamp >= windowStart && timestamp <= windowEnd;

    if (!isWithinWindow) {
      // Determine if this is for previous day or next day's training
      const prevDayWindowEnd = new Date(windowEnd);
      prevDayWindowEnd.setUTCDate(prevDayWindowEnd.getUTCDate() - 1);
      const nextDayWindowStart = new Date(windowStart);
      nextDayWindowStart.setUTCDate(nextDayWindowStart.getUTCDate() + 1);

      let targetTrainingDay = trainingDay;
      let reason: 'before_window' | 'after_window';

      if (timestamp < windowStart) {
        // Check if it belongs to previous day's training
        if (timestamp <= prevDayWindowEnd) {
          targetTrainingDay = new Date(trainingDay);
          targetTrainingDay.setUTCDate(targetTrainingDay.getUTCDate() - 1);
        }
        reason = 'before_window';
      } else {
        // Check if it belongs to next day's training
        if (timestamp >= nextDayWindowStart) {
          targetTrainingDay = new Date(trainingDay);
          targetTrainingDay.setUTCDate(targetTrainingDay.getUTCDate() + 1);
        }
        reason = 'after_window';
      }

      // Add to out of window swipes
      record.outOfWindowSwipes.push({
        timestamp: timestamp,
        deviceId: 'biometric',
        location: 'unknown',
        reason: reason
      });
      record.needsRegularization = true;
    }

    // Add swipe to record and determine type
    const isFirstSwipe = record.swipes.length === 0;
    const isLastSwipeOfDay = timestamp > trainingEnd; // Check if this is potentially a checkout swipe

    record.swipes.push({
      timestamp: timestamp,
      direction: isFirstSwipe ? 'IN' : 'OUT',
      deviceId: 'biometric',
      location: 'unknown',
    });

    // Update status
    if (isFirstSwipe) {
      record.isLateEntry = timestamp > trainingStart;
      record.attendanceStatus = record.isLateEntry ? ['Late'] : ['On-Time'];
    }

    if (isLastSwipeOfDay) {
      record.isEarlyExit = timestamp < trainingEnd;
      if (record.isEarlyExit) {
        record.attendanceStatus.push('Early-Exit');
      }
    }

    // Save record
    await record.save();

    return {
      success: true,
      data: {
        userId: user._id,
        trainingCode: trainingAssignment.trainingCode,
        trainingDay: record.trainingDay,
        swipeTime: timestamp,
        isWithinWindow,
        isLateEntry: record.isLateEntry,
        isEarlyExit: record.isEarlyExit,
        needsRegularization: record.needsRegularization,
        status: record.status,
        attendanceStatus: record.attendanceStatus
      },
    };
  }

  async getAttendanceStatus(userId: string | Types.ObjectId, date: Date) {
    const trainingDay = new Date(date);
    trainingDay.setUTCHours(0, 0, 0, 0); // Normalize to start of UTC day

    const records = await TrainingAttendanceRecord.find({
      userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId,
      trainingDay,
    }).sort({ trainingCode: 1 });

    return {
      success: true,
      data: records.map(record => ({
        trainingCode: record.trainingCode,
        status: record.status,
        overtime: record.overtime,
        shortTime: record.shortTime,
        firstSwipe: record.swipes[0]?.timestamp,
        lastSwipe: record.swipes[record.swipes.length - 1]?.timestamp,
      })),
    };
  }

  async getAttendanceRecords(query: IAttendanceRecordsQuery) {
    const { startDate, endDate, userIds, page, limit } = query;
    const skip = (page - 1) * limit;

    // Normalize dates to UTC day boundaries
    const utcStartDate = new Date(startDate);
    utcStartDate.setUTCHours(0, 0, 0, 0);
    
    const utcEndDate = new Date(endDate);
    utcEndDate.setUTCHours(23, 59, 59, 999);

    // Create base query
    const baseQuery: any = {
      trainingDay: {
        $gte: utcStartDate,
        $lte: utcEndDate
      }
    };

    // Add userIds filter if provided
    if (userIds?.length) {
      baseQuery.userId = {
        $in: userIds.map(id => new Types.ObjectId(id))
      };
    }

    

    // Calculate total days in the date range
    const totalDays = Math.ceil((utcEndDate.getTime() - utcStartDate.getTime()) / (1000 * 60 * 60 * 24));

    // Get all records for the period without pagination when summary is requested
    const allRecords = await TrainingAttendanceRecord.find(baseQuery)
      .populate('userId', 'name')
      .sort({ userId: 1, trainingDay: 1 });

    // Group records by user
    const userRecords = new Map<string, {
      userId: string;
      userName: string;
      records: any[];
      summary: {
        totalDays: number;
        lateDays: number;
        presentDays: number;
        regularisedDays: number;
        leaveDays: number;
      };
    }>();

    allRecords.forEach(record => {
      const userId = record.userId._id.toString();
      const userName = (record.userId as any).name;

      if (!userRecords.has(userId)) {
        userRecords.set(userId, {
          userId,
          userName,
          records: [],
          summary: {
            totalDays,
            lateDays: 0,
            presentDays: 0,
            regularisedDays: 0,
            leaveDays: 0
          }
        });
      }

      const userRecord = userRecords.get(userId)!;

      // Add record data
      userRecord.records.push({
        trainingDay: record.trainingDay,
        trainingCode: record.trainingCode,
        status: record.status,
        overtime: record.overtime || '00:00:00',
        shortTime: record.shortTime || '00:00:00',
        firstSwipe: record.swipes[0]?.timestamp,
        lastSwipe: record.swipes[record.swipes.length - 1]?.timestamp,
        attendanceStatus: record.attendanceStatus
      });

      // Update summary
      if (record.status === 'complete') {
        userRecord.summary.presentDays++;
        if (record.attendanceStatus.includes('Late')) {
          userRecord.summary.lateDays++;
        }
      }
      if (record.needsRegularization) {
        userRecord.summary.regularisedDays++;
      }
    });

    // Convert to array and apply pagination
    const data = Array.from(userRecords.values())
      .slice(skip, skip + limit);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total: userRecords.size,
        totalPages: Math.ceil(userRecords.size / limit)
      }
    };
  }
  
}