import { Attendance } from '../models';
import { Types } from 'mongoose';

export interface IAttendanceQuery {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface IAttendanceCheckIn {
  userId: Types.ObjectId;
  location?: string;
}

export interface IAttendanceCheckOut {
  userId: Types.ObjectId;
  location?: string;
}

class AttendanceService {
  async findById(id: string) {
    return Attendance.findById(id).populate('userId', 'name email');
  }

  async findAll(query: IAttendanceQuery) {
    const { userId, startDate, endDate, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (userId) filter.userId = userId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const [attendances, total] = await Promise.all([
      Attendance.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email'),
      Attendance.countDocuments(filter),
    ]);

    return {
      attendances,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async checkIn(data: IAttendanceCheckIn) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if already checked in
    const existingAttendance = await Attendance.findOne({
      userId: data.userId,
      date: {
        $gte: today,
        $lt: tomorrow,
      },
    });

    if (existingAttendance) {
      throw new Error('Already checked in today');
    }

    // Determine if late based on configured work hours (e.g., 9 AM)
    const now = new Date();
    const workStartHour = 9;
    const isLate = now.getHours() >= workStartHour;

    const attendance = new Attendance({
      userId: data.userId,
      checkIn: now,
      date: today,
      status: isLate ? 'Late' : 'On-Time',
      source: 'Web',
      location: data.location,
    });

    await attendance.save();
    return attendance;
  }

  async checkOut(data: IAttendanceCheckOut) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      userId: data.userId,
      date: {
        $gte: today,
        $lt: tomorrow,
      },
    });

    if (!attendance) {
      throw new Error('No check-in record found for today');
    }

    if (attendance.checkOut) {
      throw new Error('Already checked out today');
    }

    // Determine if early exit based on configured work hours (e.g., 5 PM)
    const now = new Date();
    const workEndHour = 17;
    const isEarlyExit = now.getHours() < workEndHour;

    attendance.checkOut = now;
    attendance.status = isEarlyExit ? 'Early-Exit' : attendance.status;
    if (data.location) attendance.location = data.location;

    await attendance.save();
    return attendance;
  }

  async getTodayStatus(userId: Types.ObjectId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await Attendance.findOne({
      userId,
      date: {
        $gte: today,
        $lt: tomorrow,
      },
    });

    return attendance || { status: 'Not Checked In' };
  }
}

export const attendanceService = new AttendanceService(); 