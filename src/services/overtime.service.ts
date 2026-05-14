import { Overtime } from '../models';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';

export interface IOvertimeCreate {
  userId: string | Types.ObjectId;
  date: Date;
  hours: number;
  remarks?: string;
}

export interface IOvertimeQuery {
  userId?: string | Types.ObjectId;
  status?: 'Pending' | 'Approved' | 'Rejected';
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface IOvertimeStatusUpdate {
  status: 'Approved' | 'Rejected';
  remarks?: string;
  approvedBy: string | Types.ObjectId;
}

export class OvertimeService extends BaseService {
  protected context: RequestContext;

  constructor(context: RequestContext) {
    super(context);
    this.context = context;
  }
  async findById(id: string) {
    return Overtime.findById(id)
      .populate('userId', 'name email')
      .populate('approvedBy', 'name email');
  }

  async findAll(query: IOvertimeQuery) {
    const { userId, status, startDate, endDate, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const [overtimes, total] = await Promise.all([
      Overtime.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email')
        .populate('approvedBy', 'name email'),
      Overtime.countDocuments(filter),
    ]);

    return {
      overtimes,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(overtimeData: IOvertimeCreate) {
    // Check if overtime already logged for the date
    const existingOvertime = await Overtime.findOne({
      userId: overtimeData.userId,
      date: overtimeData.date,
    });

    if (existingOvertime) {
      throw new Error('Overtime already logged for this date');
    }

    const overtime = new Overtime({
      ...overtimeData,
      status: 'Pending',
    });

    await overtime.save();
    return overtime;
  }

  async updateStatus(id: string, updateData: IOvertimeStatusUpdate) {
    const overtime = await Overtime.findById(id);

    if (!overtime) {
      throw new Error('Overtime record not found');
    }

    if (overtime.status !== 'Pending') {
      throw new Error('Overtime record has already been processed');
    }

    overtime.status = updateData.status;
    overtime.approvedBy = updateData.approvedBy as Types.ObjectId;
    overtime.approvedAt = new Date();
    if (updateData.remarks) overtime.remarks = updateData.remarks;

    await overtime.save();
    return overtime;
  }

  async delete(id: string, userId: string) {
    const overtime = await Overtime.findOne({ _id: id, userId });

    if (!overtime) {
      throw new Error('Overtime record not found');
    }

    if (overtime.status !== 'Pending') {
      throw new Error('Cannot delete processed overtime record');
    }

    await overtime.deleteOne();
    return { message: 'Overtime record deleted successfully' };
  }

  async getTotalHours(userId: string, startDate: Date, endDate: Date) {
    const result = await Overtime.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          status: 'Approved',
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalHours: { $sum: '$hours' },
        },
      },
    ]);

    return result.length > 0 ? result[0].totalHours : 0;
  }
}

// export const overtimeService = new OvertimeService(); 