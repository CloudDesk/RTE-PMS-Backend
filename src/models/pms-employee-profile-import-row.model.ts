import mongoose, { Document, Schema, Types } from 'mongoose';
import type { IPmsCareerProgressionPastEntry } from './pms-employee-career-profile.model';

export interface IPmsEmployeeProfileImportRow extends Document {
  importId: Types.ObjectId;
  employeeId: Types.ObjectId;
  employeeCode: string;
  employeeName?: string;
  designation?: string;
  department?: string;
  managerName?: string;
  warnings: string[];
  sourceRowNumber: number;
  currentGrade: string;
  gradeEffectiveDate?: Date;
  yearsInGrade?: number;
  previousExperienceYears?: number;
  qualification?: string;
  asOfDate: Date;
  sourceProfileVersion?: number;
  submittedCareerProgressionPast: IPmsCareerProgressionPastEntry[];
  careerProgressionPast: IPmsCareerProgressionPastEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const careerProgressionPastSchema = new Schema<IPmsCareerProgressionPastEntry>(
  {
    year: { type: Number, required: true },
    grade: { type: String, trim: true, maxlength: 100 },
    progression: { type: String, trim: true, maxlength: 150 },
    function: { type: String, trim: true, maxlength: 150 },
    unitOrDepartment: { type: String, trim: true, maxlength: 150 },
    sequence: { type: Number, required: true },
  },
  { _id: false },
);

const pmsEmployeeProfileImportRowSchema =
  new Schema<IPmsEmployeeProfileImportRow>(
    {
      importId: {
        type: Schema.Types.ObjectId,
        ref: 'PmsEmployeeProfileImport',
        required: true,
      },
      employeeId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      employeeCode: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50,
      },
      employeeName: { type: String, trim: true, maxlength: 200 },
      designation: { type: String, trim: true, maxlength: 200 },
      department: { type: String, trim: true, maxlength: 200 },
      managerName: { type: String, trim: true, maxlength: 200 },
      warnings: {
        type: [{ type: String, trim: true, maxlength: 1000 }],
        default: [],
      },
      sourceRowNumber: { type: Number, required: true, min: 2 },
      currentGrade: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      gradeEffectiveDate: Date,
      yearsInGrade: { type: Number, min: 0, max: 80 },
      previousExperienceYears: { type: Number, min: 0, max: 80 },
      qualification: { type: String, trim: true, maxlength: 250 },
      asOfDate: { type: Date, required: true },
      sourceProfileVersion: { type: Number, min: 0 },
      submittedCareerProgressionPast: {
        type: [careerProgressionPastSchema],
        default: [],
      },
      careerProgressionPast: {
        type: [careerProgressionPastSchema],
        default: [],
      },
    },
    {
      collection: 'pms_employee_profile_import_rows',
      timestamps: true,
    },
  );

pmsEmployeeProfileImportRowSchema.index(
  { importId: 1, employeeId: 1 },
  { unique: true, name: 'uq_pms_employee_profile_import_row' },
);
pmsEmployeeProfileImportRowSchema.index({ importId: 1, sourceRowNumber: 1 });

export const PmsEmployeeProfileImportRow =
  mongoose.model<IPmsEmployeeProfileImportRow>(
    'PmsEmployeeProfileImportRow',
    pmsEmployeeProfileImportRowSchema,
  );
