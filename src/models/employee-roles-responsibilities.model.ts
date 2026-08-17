import mongoose, { Document, Schema, Types } from 'mongoose';

export const EmployeeRoleResponsibilityStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
} as const;

export type EmployeeRoleResponsibilityStatus =
  (typeof EmployeeRoleResponsibilityStatus)[keyof typeof EmployeeRoleResponsibilityStatus];

export interface IEmployeeRoleResponsibilityEntry {
  _id: Types.ObjectId;
  serialNo: number;
  description: string;
  status: EmployeeRoleResponsibilityStatus;
  isVisible: boolean;
  submittedAt?: Date;
}

export interface IEmployeeRolesResponsibilities extends Document {
  employeeId: Types.ObjectId;
  entries: Types.DocumentArray<IEmployeeRoleResponsibilityEntry>;
  // Retained as derived summary fields for backward compatibility.
  status: EmployeeRoleResponsibilityStatus;
  isVisible: boolean;
  submittedAt?: Date;
  version: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const entrySchema = new Schema<IEmployeeRoleResponsibilityEntry>({
  serialNo: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Serial number must be a whole number',
    },
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  status: {
    type: String,
    enum: Object.values(EmployeeRoleResponsibilityStatus),
    required: true,
  },
  isVisible: {
    type: Boolean,
    required: true,
  },
  submittedAt: Date,
});

entrySchema.pre('validate', function (next) {
  if (this.status === EmployeeRoleResponsibilityStatus.DRAFT && this.isVisible) {
    this.invalidate('isVisible', 'A draft responsibility cannot be visible');
  }
  next();
});

const employeeRolesResponsibilitiesSchema =
  new Schema<IEmployeeRolesResponsibilities>(
    {
      employeeId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      entries: {
        type: [entrySchema],
        default: [],
      },
      status: {
        type: String,
        enum: Object.values(EmployeeRoleResponsibilityStatus),
        default: EmployeeRoleResponsibilityStatus.DRAFT,
        required: true,
      },
      isVisible: {
        type: Boolean,
        default: false,
        required: true,
      },
      submittedAt: Date,
      version: {
        type: Number,
        default: 1,
        min: 1,
        required: true,
      },
      createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    },
    {
      collection: 'employee_roles_responsibilities',
      timestamps: true,
    },
  );

employeeRolesResponsibilitiesSchema.index(
  { employeeId: 1 },
  { unique: true, name: 'uq_employee_roles_responsibilities_employee' },
);
employeeRolesResponsibilitiesSchema.index({ 'entries.status': 1, 'entries.isVisible': 1 });

employeeRolesResponsibilitiesSchema.pre('validate', function (next) {
  this.entries.forEach((entry, index) => {
    entry.serialNo = index + 1;
  });
  next();
});

export const EmployeeRolesResponsibilities =
  mongoose.model<IEmployeeRolesResponsibilities>(
    'EmployeeRolesResponsibilities',
    employeeRolesResponsibilitiesSchema,
  );
