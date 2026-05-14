import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { Organization, IOrganization } from '../models/organization.model';
import { Types } from 'mongoose';

export interface IOrganizationCreate {
  name: string;
  code: string;
  parentId?: string;
}

export interface IOrganizationUpdate {
  name?: string;
  parentId?: string;
  active?: boolean;
}

export class OrganizationService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async create(data: IOrganizationCreate): Promise<IOrganization> {
    const existingOrg = await Organization.findOne({ code: data.code.toUpperCase() });
    if (existingOrg) {
      throw new Error('Organization code already exists');
    }

    let level = 0;
    let path = [data.code.toUpperCase()];

    if (data.parentId) {
      const parent = await Organization.findById(data.parentId);
      if (!parent) {
        throw new Error('Parent organization not found');
      }
      level = parent.level + 1;
      path = [...parent.path, data.code.toUpperCase()];
    }

    const org = new Organization({
      ...data,
      code: data.code.toUpperCase(),
      level,
      path,
    });

    await org.save();
    return org;
  }

  async update(id: string, data: IOrganizationUpdate): Promise<IOrganization> {
    const org = await Organization.findById(id);
    if (!org) {
      throw new Error('Organization not found');
    }

    if (data.parentId) {
      const parent = await Organization.findById(data.parentId);
      if (!parent) {
        throw new Error('Parent organization not found');
      }
      
      // Update level and path for this org and all its children
      const newLevel = parent.level + 1;
      const newPath = [...parent.path, org.code];
      
      await this.updateHierarchy(org._id, newLevel, newPath);
    }

    Object.assign(org, data);
    await org.save();
    return org;
  }

  private async updateHierarchy(orgId: Types.ObjectId, level: number, path: string[]) {
    const org = await Organization.findById(orgId);
    if (!org) return;

    org.level = level;
    org.path = path;
    await org.save();

    // Update all children recursively
    const children = await Organization.find({ parentId: orgId });
    for (const child of children) {
      await this.updateHierarchy(
        child._id,
        level + 1,
        [...path, child.code]
      );
    }
  }

  async getHierarchy(rootId?: string): Promise<IOrganization[]> {
    const query = rootId ? { _id: rootId } : { level: 0 };
    const roots = await Organization.find(query);
    
    const result = [];
    for (const root of roots) {
      const children = await Organization.find({
        path: root.code,
        _id: { $ne: root._id }
      }).sort({ code: 1 });
      
      result.push({
        ...root.toObject(),
        children: children.map(child => child.toObject())
      });
    }
    
    return result;
  }

  async delete(id: string): Promise<void> {
    const org = await Organization.findById(id);
    if (!org) {
      throw new Error('Organization not found');
    }

    const hasChildren = await Organization.exists({ parentId: id });
    if (hasChildren) {
      throw new Error('Cannot delete organization with children');
    }

    await org.deleteOne();
  }
}
