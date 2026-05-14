import { Types } from 'mongoose';
import { PermissionSummary, IPermissionSummary } from '../models/permission-summary.model';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';

export class PermissionSummaryService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async createOrUpdatePermissionSummary(
    userId: Types.ObjectId,
    year: number,
    month: number,
    updates: {
      alloted?: number;
      availed?: number;
      permissionRequestId?: Types.ObjectId;
    }
  ): Promise<IPermissionSummary> {
    // First, ensure the document exists (create if it doesn't)
    let summary = await PermissionSummary.findOne({ userId, year, month });
    
    if (!summary) {
      summary = await PermissionSummary.create({
        userId,
        year,
        month,
        permissions: { alloted: 0, availed: 0, remaining: 0, permissionRequests: [] },
      });
    }

    // Build update object for permissions
    // Convert to plain object if it's a Mongoose subdocument
    const currentPermissions = summary.permissions as any;
    const permissionsUpdate: any = {
      alloted: currentPermissions.alloted || 0,
      availed: currentPermissions.availed || 0,
      remaining: currentPermissions.remaining || 0,
      permissionRequests: currentPermissions.permissionRequests || [],
    };

    if (updates.alloted !== undefined) {
      permissionsUpdate.alloted = updates.alloted;
      permissionsUpdate.remaining = Math.max(0, updates.alloted - (permissionsUpdate.availed || 0));
    }

    if (updates.availed !== undefined) {
      permissionsUpdate.availed = updates.availed;
      const currentAlloted = permissionsUpdate.alloted || 0;
      permissionsUpdate.remaining = Math.max(0, currentAlloted - updates.availed);
    }

    if (updates.permissionRequestId) {
      const currentRequests = permissionsUpdate.permissionRequests || [];
      if (!currentRequests.some((id: Types.ObjectId) => id.toString() === updates.permissionRequestId!.toString())) {
        permissionsUpdate.permissionRequests = [...currentRequests, updates.permissionRequestId];
      }
    }

    // Update the document
    const updatedSummary = await PermissionSummary.findOneAndUpdate(
      { userId, year, month },
      { $set: { permissions: permissionsUpdate } },
      { new: true }
    );

    if (!updatedSummary) {
      throw new Error('Permission summary not found');
    }

    return updatedSummary;
  }

  async getPermissionSummary(
    userId: Types.ObjectId,
    year: number,
    month: number
  ): Promise<IPermissionSummary> {
    let summary = await PermissionSummary.findOne({ userId, year, month });
    if (!summary) {
      summary = new PermissionSummary({
        userId,
        year,
        month,
        permissions: { alloted: 0, availed: 0, remaining: 0, permissionRequests: [] },
      });
    }
    return summary;
  }

  async updatePermissionAllotments(
    userId: Types.ObjectId,
    year: number,
    month: number,
    alloted: number
  ): Promise<IPermissionSummary> {
    return this.createOrUpdatePermissionSummary(userId, year, month, { alloted });
  }

  async getMonthlyPermissionBalance(
    userId: Types.ObjectId,
    year: number,
    month: number
  ): Promise<{
    alloted: number;
    availed: number;
    remaining: number;
  }> {
    const summary = await this.getPermissionSummary(userId, year, month);
    return {
      alloted: summary.permissions.alloted || 0,
      availed: summary.permissions.availed || 0,
      remaining: summary.permissions.remaining || 0,
    };
  }

  /**
   * Bulk update permission allotments for multiple users
   * @param allotments Array of { userId, alloted } objects
   * @param year Year for permission allotment
   * @param month Month for permission allotment (1-12)
   */
  async bulkUpdatePermissionAllotments(
    allotments: Array<{ userId: Types.ObjectId; alloted: number }>,
    year: number,
    month: number
  ): Promise<{
    successCount: number;
    failedCount: number;
    errors: Array<{ userId: string; error: string }>;
    updated: IPermissionSummary[];
  }> {
    const results = {
      successCount: 0,
      failedCount: 0,
      errors: [] as Array<{ userId: string; error: string }>,
      updated: [] as IPermissionSummary[],
    };

    // Process all allotments in parallel
    const promises = allotments.map(async ({ userId, alloted }) => {
      try {
        const updated = await this.updatePermissionAllotments(userId, year, month, alloted);
        results.successCount++;
        results.updated.push(updated);
        return { success: true, userId: userId.toString() };
      } catch (error: any) {
        results.failedCount++;
        results.errors.push({
          userId: userId.toString(),
          error: error.message || 'Unknown error',
        });
        return { success: false, userId: userId.toString(), error: error.message };
      }
    });

    await Promise.all(promises);

    return results;
  }
}

