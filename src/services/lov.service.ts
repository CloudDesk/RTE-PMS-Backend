import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { LOV } from '../models';

export interface ILovCreate {
  name: string;
  type: string;
  values: Array<{
    label: string;
    value: string;
    description?: string;
    isActive?: boolean;
  }>;
}

export interface ILovUpdate {
  name?: string;
  values?: Array<{
    label: string;
    value: string;
    description?: string;
    isActive?: boolean;
  }>;
}

export interface ILovQuery {
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class LovService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async findById(id: string) {
    return LOV.findById(id);
  }

  async findAll(query: ILovQuery) {
    const { type, search, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (type) filter.type = type;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } },
        { 'values.label': { $regex: search, $options: 'i' } },
      ];
    }

    const [lovs, total] = await Promise.all([
      LOV.find(filter).sort({ type: 1 }).skip(skip).limit(limit),
      LOV.countDocuments(filter),
    ]);

    return {
      lovs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByType(type: string) {
    return LOV.findOne({ type });
  }

  async create(lovData: ILovCreate) {
    const existingLov = await LOV.findOne({ type: lovData.type });
    if (existingLov) {
      throw new Error('LOV with this type already exists');
    }

    const lov = new LOV(lovData);
    await lov.save();
    return lov;
  }

  async update(id: string, updateData: ILovUpdate) {
    const lov = await LOV.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!lov) {
      throw new Error('LOV not found');
    }

    return lov;
  }

  async delete(id: string) {
    const lov = await LOV.findByIdAndDelete(id);
    if (!lov) {
      throw new Error('LOV not found');
    }
    return { message: 'LOV deleted successfully' };
  }

  async getActiveValuesByType(type: string) {
    const lov = await LOV.findOne({ type });
    return lov?.values.filter(v => v.isActive) || [];
  }

  async getTypes() {
    return LOV.distinct('type');
  }
}
