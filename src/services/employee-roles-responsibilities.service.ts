import { Types } from 'mongoose';
import {
  EmployeeRoleResponsibilityStatus,
  EmployeeRolesResponsibilities,
  type IEmployeeRolesResponsibilities,
} from '../models/employee-roles-responsibilities.model';
import { User } from '../models/user.model';
import type { RequestContext } from '../types/context';
import { auditService } from './audit.service';
import { BaseService } from './base.service';

export type EmployeeRoleResponsibilityEntryView = {
  id: string;
  serialNo: number;
  description: string;
  status: 'DRAFT' | 'SUBMITTED';
  isVisible: boolean;
  submittedAt?: Date;
};

export type EmployeeRolesResponsibilitiesView = {
  id?: string;
  employeeId: string;
  entries: EmployeeRoleResponsibilityEntryView[];
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export class EmployeeRolesResponsibilitiesError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
  }
}

const ADMIN_ROLES = new Set([
  'admin',
  'superadmin',
  'super_admin',
  'hr',
  'hr_admin',
  'hradmin',
]);
const MAX_ENTRIES = 50;
const MAX_DESCRIPTION_LENGTH = 1000;

export class EmployeeRolesResponsibilitiesService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async getOwn(): Promise<EmployeeRolesResponsibilitiesView> {
    const actorId = this.actorId();
    const record = await EmployeeRolesResponsibilities.findOne({ employeeId: actorId });
    return record ? this.toView(record) : this.emptyView(actorId.toString());
  }

  async saveEntryDraft(
    descriptionInput: unknown,
    entryId?: string,
    serialNoInput?: unknown,
    employeeId?: string,
  ): Promise<EmployeeRolesResponsibilitiesView> {
    this.assertCanManage();
    const description = this.description(descriptionInput, true);
    const actorId = this.actorId();
    const targetId = this.writeTargetId(employeeId, actorId);
    const record = await this.employeeRecord(targetId, true, actorId);
    const previous = record.toObject();
    const entry = entryId
      ? this.entry(record, entryId, this.serialNo(serialNoInput))
      : undefined;

    if (!entry && entryId) this.entryNotFound();
    if (!entry && record.entries.length >= MAX_ENTRIES) {
      throw new EmployeeRolesResponsibilitiesError(
        400,
        'ROLES_RESPONSIBILITIES_LIMIT_EXCEEDED',
        `A maximum of ${MAX_ENTRIES} roles and responsibilities is allowed`,
      );
    }

    if (entry) {
      entry.description = description;
      entry.status = EmployeeRoleResponsibilityStatus.DRAFT;
      entry.isVisible = false;
      entry.submittedAt = undefined;
    } else {
      record.entries.push({
        _id: new Types.ObjectId(),
        serialNo: record.entries.length + 1,
        description,
        status: EmployeeRoleResponsibilityStatus.DRAFT,
        isVisible: false,
      });
    }

    await this.save(record, actorId);
    await this.audit('EMPLOYEE_ROLE_RESPONSIBILITY_DRAFT_SAVED', record, previous);
    return this.toView(record);
  }

  async submitEntry(
    descriptionInput: unknown,
    entryId?: string,
    serialNoInput?: unknown,
    employeeId?: string,
  ): Promise<EmployeeRolesResponsibilitiesView> {
    this.assertCanManage();
    const description = this.description(descriptionInput, true);
    const actorId = this.actorId();
    const targetId = this.writeTargetId(employeeId, actorId);
    const record = await this.employeeRecord(targetId, true, actorId);
    const previous = record.toObject();
    const entry = entryId
      ? this.entry(record, entryId, this.serialNo(serialNoInput))
      : undefined;

    if (!entry && entryId) this.entryNotFound();
    if (!entry && record.entries.length >= MAX_ENTRIES) {
      throw new EmployeeRolesResponsibilitiesError(
        400,
        'ROLES_RESPONSIBILITIES_LIMIT_EXCEEDED',
        `A maximum of ${MAX_ENTRIES} roles and responsibilities is allowed`,
      );
    }

    const submittedAt = new Date();
    if (entry) {
      entry.description = description;
      entry.status = EmployeeRoleResponsibilityStatus.SUBMITTED;
      entry.isVisible = true;
      entry.submittedAt = submittedAt;
    } else {
      record.entries.push({
        _id: new Types.ObjectId(),
        serialNo: record.entries.length + 1,
        description,
        status: EmployeeRoleResponsibilityStatus.SUBMITTED,
        isVisible: true,
        submittedAt,
      });
    }

    await this.save(record, actorId);
    await this.audit('EMPLOYEE_ROLE_RESPONSIBILITY_SUBMITTED', record, previous);
    return this.toView(record);
  }

  async setEntryVisibility(
    entryId: string,
    isVisible: boolean,
    serialNoInput?: unknown,
    employeeId?: string,
  ): Promise<EmployeeRolesResponsibilitiesView> {
    this.assertCanManage();
    const actorId = this.actorId();
    const targetId = this.writeTargetId(employeeId, actorId);
    const record = await this.employeeRecord(targetId, false, actorId);
    const previous = record.toObject();
    const entry = this.entry(record, entryId, this.serialNo(serialNoInput));
    if (!entry) this.entryNotFound();
    if (entry.status !== EmployeeRoleResponsibilityStatus.SUBMITTED) {
      throw new EmployeeRolesResponsibilitiesError(
        409,
        'ROLE_RESPONSIBILITY_NOT_SUBMITTED',
        'Only a submitted responsibility can be shown or hidden',
      );
    }

    entry.isVisible = isVisible;
    await this.save(record, actorId);
    await this.audit(
      isVisible
        ? 'EMPLOYEE_ROLE_RESPONSIBILITY_SHOWN'
        : 'EMPLOYEE_ROLE_RESPONSIBILITY_HIDDEN',
      record,
      previous,
    );
    return this.toView(record);
  }

  async deleteEntry(
    entryId: string,
    serialNoInput?: unknown,
    employeeId?: string,
  ): Promise<EmployeeRolesResponsibilitiesView> {
    this.assertCanManage();
    const actorId = this.actorId();
    const targetId = this.writeTargetId(employeeId, actorId);
    const record = await this.employeeRecord(targetId, false, actorId);
    const previous = record.toObject();
    const entry = this.entry(record, entryId, this.serialNo(serialNoInput));
    if (!entry) this.entryNotFound();
    if (record.entries.length <= 1) {
      throw new EmployeeRolesResponsibilitiesError(
        409,
        'ROLE_RESPONSIBILITY_MINIMUM_REQUIRED',
        'At least one responsibility row must remain',
      );
    }

    entry.deleteOne();
    await this.save(record, actorId);
    await this.audit('EMPLOYEE_ROLE_RESPONSIBILITY_REMOVED', record, previous);
    return this.toView(record);
  }

  async getForEmployee(
    employeeId: string,
  ): Promise<EmployeeRolesResponsibilitiesView | null> {
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new EmployeeRolesResponsibilitiesError(
        400,
        'INVALID_EMPLOYEE_ID',
        'A valid employee id is required',
      );
    }

    const actorId = this.actorId();
    const targetId = new Types.ObjectId(employeeId);
    const role = String(this.context.user?.role ?? '').trim().toLowerCase();
    const isOwnRecord = actorId.equals(targetId);

    if (!isOwnRecord && !ADMIN_ROLES.has(role)) {
      const employee = await User.findById(targetId).select('managerId').lean();
      if (!employee) {
        throw new EmployeeRolesResponsibilitiesError(
          404,
          'EMPLOYEE_NOT_FOUND',
          'Employee not found',
        );
      }
      if (String(employee.managerId ?? '') !== actorId.toString()) {
        throw new EmployeeRolesResponsibilitiesError(
          403,
          'ROLES_RESPONSIBILITIES_ACCESS_DENIED',
          'Only the employee’s direct manager or an administrator can view this information',
        );
      }
    }

    if (isOwnRecord) return this.getOwn();

    const record = await EmployeeRolesResponsibilities.findOne({ employeeId: targetId });
    if (!record) return null;
    const view = this.toView(record);
    view.entries = view.entries.filter(
      (entry) =>
        entry.status === EmployeeRoleResponsibilityStatus.SUBMITTED &&
        entry.isVisible,
    );
    return view.entries.length ? view : null;
  }

  async getForEmployeeManagement(employeeId: string): Promise<EmployeeRolesResponsibilitiesView> {
    const targetId = await this.manageEmployee(employeeId);
    const record = await EmployeeRolesResponsibilities.findOne({ employeeId: targetId });
    return record ? this.toView(record) : this.emptyView(targetId.toString());
  }

  async saveEmployeeEntryDraft(employeeId: string, descriptionInput: unknown, entryId?: string, serialNoInput?: unknown) {
    return this.saveManagedEntry(employeeId, descriptionInput, entryId, serialNoInput, false);
  }

  async submitEmployeeEntry(employeeId: string, descriptionInput: unknown, entryId?: string, serialNoInput?: unknown) {
    return this.saveManagedEntry(employeeId, descriptionInput, entryId, serialNoInput, true);
  }

  async setEmployeeEntryVisibility(employeeId: string, entryId: string, isVisible: boolean, serialNoInput?: unknown) {
    const targetId = await this.manageEmployee(employeeId);
    const actorId = this.actorId();
    const record = await this.recordForEmployee(targetId, false);
    const previous = record.toObject();
    const entry = this.entry(record, entryId, this.serialNo(serialNoInput));
    if (!entry) this.entryNotFound();
    if (entry.status !== EmployeeRoleResponsibilityStatus.SUBMITTED) {
      throw new EmployeeRolesResponsibilitiesError(409, 'ROLE_RESPONSIBILITY_NOT_SUBMITTED', 'Only a submitted responsibility can be shown or hidden');
    }
    entry.isVisible = isVisible;
    await this.save(record, actorId);
    await this.audit(isVisible ? 'EMPLOYEE_ROLE_RESPONSIBILITY_SHOWN' : 'EMPLOYEE_ROLE_RESPONSIBILITY_HIDDEN', record, previous);
    return this.toView(record);
  }

  async deleteEmployeeEntry(employeeId: string, entryId: string, serialNoInput?: unknown) {
    const targetId = await this.manageEmployee(employeeId);
    const actorId = this.actorId();
    const record = await this.recordForEmployee(targetId, false);
    const previous = record.toObject();
    const entry = this.entry(record, entryId, this.serialNo(serialNoInput));
    if (!entry) this.entryNotFound();
    if (record.entries.length <= 1) {
      throw new EmployeeRolesResponsibilitiesError(409, 'ROLE_RESPONSIBILITY_MINIMUM_REQUIRED', 'At least one responsibility row must remain');
    }
    entry.deleteOne();
    await this.save(record, actorId);
    await this.audit('EMPLOYEE_ROLE_RESPONSIBILITY_REMOVED', record, previous);
    return this.toView(record);
  }

  private async saveManagedEntry(employeeId: string, descriptionInput: unknown, entryId: string | undefined, serialNoInput: unknown, submitted: boolean) {
    const targetId = await this.manageEmployee(employeeId);
    const actorId = this.actorId();
    const description = this.description(descriptionInput, true);
    const record = await this.recordForEmployee(targetId);
    const previous = record.toObject();
    const entry = entryId ? this.entry(record, entryId, this.serialNo(serialNoInput)) : undefined;
    if (!entry && entryId) this.entryNotFound();
    if (!entry && record.entries.length >= MAX_ENTRIES) {
      throw new EmployeeRolesResponsibilitiesError(400, 'ROLES_RESPONSIBILITIES_LIMIT_EXCEEDED', `A maximum of ${MAX_ENTRIES} roles and responsibilities is allowed`);
    }
    if (entry) {
      entry.description = description;
      entry.status = submitted ? EmployeeRoleResponsibilityStatus.SUBMITTED : EmployeeRoleResponsibilityStatus.DRAFT;
      entry.isVisible = submitted;
      entry.submittedAt = submitted ? new Date() : undefined;
    } else {
      record.entries.push({ _id: new Types.ObjectId(), serialNo: record.entries.length + 1, description, status: submitted ? EmployeeRoleResponsibilityStatus.SUBMITTED : EmployeeRoleResponsibilityStatus.DRAFT, isVisible: submitted, ...(submitted ? { submittedAt: new Date() } : {}) });
    }
    await this.save(record, actorId);
    await this.audit(submitted ? 'EMPLOYEE_ROLE_RESPONSIBILITY_SUBMITTED' : 'EMPLOYEE_ROLE_RESPONSIBILITY_DRAFT_SAVED', record, previous);
    return this.toView(record);
  }

  private async manageEmployee(employeeId: string): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new EmployeeRolesResponsibilitiesError(400, 'INVALID_EMPLOYEE_ID', 'A valid employee id is required');
    }
    const role = String(this.context.user?.role ?? '').trim().toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      throw new EmployeeRolesResponsibilitiesError(403, 'ROLES_RESPONSIBILITIES_ACCESS_DENIED', 'Only an administrator can manage employee roles and responsibilities');
    }
    const targetId = new Types.ObjectId(employeeId);
    if (!await User.exists({ _id: targetId })) {
      throw new EmployeeRolesResponsibilitiesError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
    }
    return targetId;
  }

  private async recordForEmployee(employeeId: Types.ObjectId, create = true) {
    let record = await EmployeeRolesResponsibilities.findOne({ employeeId });
    if (!record && create) {
      const actorId = this.actorId();
      record = new EmployeeRolesResponsibilities({ employeeId, entries: [], status: EmployeeRoleResponsibilityStatus.DRAFT, isVisible: false, version: 1, createdBy: actorId, updatedBy: actorId });
    }
    if (!record) {
      throw new EmployeeRolesResponsibilitiesError(404, 'ROLES_RESPONSIBILITIES_NOT_FOUND', 'Roles and responsibilities were not found');
    }
    this.normalizeLegacyEntries(record);
    return record;
  }

  private async employeeRecord(
    employeeId: Types.ObjectId,
    create: boolean,
    actorId: Types.ObjectId,
  ) {
    let record = await EmployeeRolesResponsibilities.findOne({ employeeId });
    if (!record && create) {
      record = new EmployeeRolesResponsibilities({
        employeeId,
        entries: [],
        status: EmployeeRoleResponsibilityStatus.DRAFT,
        isVisible: false,
        version: 1,
        createdBy: actorId,
        updatedBy: actorId,
      });
    }
    if (!record) {
      throw new EmployeeRolesResponsibilitiesError(
        404,
        'ROLES_RESPONSIBILITIES_NOT_FOUND',
        'Roles and responsibilities were not found',
      );
    }
    this.normalizeLegacyEntries(record);
    return record;
  }

  private normalizeLegacyEntries(record: IEmployeeRolesResponsibilities) {
    for (const entry of record.entries as any[]) {
      if (!entry.status) entry.status = record.status ?? EmployeeRoleResponsibilityStatus.DRAFT;
      if (typeof entry.isVisible !== 'boolean') {
        entry.isVisible =
          entry.status === EmployeeRoleResponsibilityStatus.SUBMITTED &&
          Boolean(record.isVisible);
      }
      if (!entry.submittedAt && entry.status === EmployeeRoleResponsibilityStatus.SUBMITTED) {
        entry.submittedAt = record.submittedAt;
      }
    }
  }

  private entry(
    record: IEmployeeRolesResponsibilities,
    entryId: string,
    legacySerialNo?: number,
  ): any | undefined {
    const byId = Types.ObjectId.isValid(entryId)
      ? record.entries.id(entryId)
      : undefined;
    if (byId) return byId;

    // Entries created by the previous document-level implementation did not
    // persist subdocument IDs. Mongoose generates a different temporary ID on
    // each read, so use the stable serial number once to locate and save them.
    if (legacySerialNo !== undefined) {
      return record.entries.find((entry) => entry.serialNo === legacySerialNo);
    }
    return undefined;
  }

  private serialNo(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const serialNo = Number(value);
    if (!Number.isInteger(serialNo) || serialNo < 1 || serialNo > MAX_ENTRIES) {
      throw new EmployeeRolesResponsibilitiesError(
        400,
        'ROLE_RESPONSIBILITY_SERIAL_INVALID',
        'Responsibility serial number is invalid',
      );
    }
    return serialNo;
  }

  private entryNotFound(): never {
    throw new EmployeeRolesResponsibilitiesError(
      404,
      'ROLE_RESPONSIBILITY_NOT_FOUND',
      'Role or responsibility was not found',
    );
  }

  private description(value: unknown, required: boolean): string {
    const description = String(value ?? '').trim();
    if (required && !description) {
      throw new EmployeeRolesResponsibilitiesError(
        400,
        'ROLE_RESPONSIBILITY_REQUIRED',
        'Enter a role or responsibility first',
      );
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new EmployeeRolesResponsibilitiesError(
        400,
        'ROLE_RESPONSIBILITY_DESCRIPTION_TOO_LONG',
        `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`,
      );
    }
    return description;
  }

  private async save(record: IEmployeeRolesResponsibilities, actorId: Types.ObjectId) {
    record.entries.forEach((entry, index) => {
      entry.serialNo = index + 1;
    });
    const submitted = record.entries.filter(
      (entry) => entry.status === EmployeeRoleResponsibilityStatus.SUBMITTED,
    );
    record.status = submitted.length
      ? EmployeeRoleResponsibilityStatus.SUBMITTED
      : EmployeeRoleResponsibilityStatus.DRAFT;
    record.isVisible = submitted.some((entry) => entry.isVisible);
    record.submittedAt = submitted
      .map((entry) => entry.submittedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    record.updatedBy = actorId;
    record.version += record.isNew ? 0 : 1;
    await record.save();
  }

  private actorId(): Types.ObjectId {
    const value = this.context.user?._id?.toString();
    if (!value || !Types.ObjectId.isValid(value)) {
      throw new EmployeeRolesResponsibilitiesError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required',
      );
    }
    return new Types.ObjectId(value);
  }

  private assertCanManage(): void {
    const role = String(this.context.user?.role ?? '')
      .trim()
      .replace(/[ /-]/g, '_')
      .toUpperCase();
    if (!['ADMIN', 'SUPERADMIN', 'SUPER_ADMIN', 'HR', 'HR_ADMIN', 'HRADMIN'].includes(role)) {
      throw new EmployeeRolesResponsibilitiesError(
        403,
        'ROLES_RESPONSIBILITIES_WRITE_ACCESS_DENIED',
        'Only HR or Admin users can add, edit, or delete roles and responsibilities',
      );
    }
  }

  private writeTargetId(employeeId: string | undefined, actorId: Types.ObjectId) {
    return employeeId === undefined ? actorId : this.employeeId(employeeId);
  }

  private employeeId(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new EmployeeRolesResponsibilitiesError(
        400,
        'INVALID_EMPLOYEE_ID',
        'A valid employee id is required',
      );
    }
    return new Types.ObjectId(value);
  }

  private emptyView(employeeId: string): EmployeeRolesResponsibilitiesView {
    return { employeeId, entries: [], version: 0 };
  }

  private toView(record: IEmployeeRolesResponsibilities): EmployeeRolesResponsibilitiesView {
    this.normalizeLegacyEntries(record);
    return {
      id: record._id.toString(),
      employeeId: record.employeeId.toString(),
      entries: record.entries.map((entry) => ({
        id: entry._id.toString(),
        serialNo: entry.serialNo,
        description: entry.description,
        status: entry.status,
        isVisible: entry.isVisible,
        submittedAt: entry.submittedAt,
      })),
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async audit(
    action: string,
    record: IEmployeeRolesResponsibilities,
    previous: unknown,
  ): Promise<void> {
    const actor = this.context.user;
    if (!actor) return;
    await auditService.createAuditLog({
      actorId: actor._id.toString(),
      actorRole: actor.role,
      action,
      entityType: 'EMPLOYEE_ROLES_RESPONSIBILITIES',
      entityId: record._id.toString(),
      previousValue: previous,
      newValue: this.toView(record),
      metadata: { employeeId: record.employeeId.toString() },
    });
  }
}
