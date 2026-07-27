import mongoose, { Document, Schema, Types } from 'mongoose';

export const PmsEmployeeProfileUpdateSource = {
  EXCEL_IMPORT: 'EXCEL_IMPORT',
  MANUAL_EDIT: 'MANUAL_EDIT',
} as const;

export type PmsEmployeeProfileUpdateSource =
  (typeof PmsEmployeeProfileUpdateSource)[keyof typeof PmsEmployeeProfileUpdateSource];

export interface IPmsCareerProgressionPastEntry {
  year: number;
  grade?: string;
  progression?: string;
  function?: string;
  unitOrDepartment?: string;
  sequence: number;
}

export interface IPmsEmployeeCareerProfile extends Document {
  employeeId: Types.ObjectId;
  employeeCode: string;
  qualification?: string;
  currentGrade: string;
  gradeEffectiveDate?: Date;
  yearsInGrade?: number;
  previousExperienceYears?: number;
  asOfDate: Date;
  careerProgressionPast: IPmsCareerProgressionPastEntry[];
  profileVersion: number;
  lastUpdatedSource: PmsEmployeeProfileUpdateSource;
  sourceImportId?: Types.ObjectId;
  lastImportedAt?: Date;
  lastImportedBy?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const careerProgressionPastEntrySchema = new Schema<IPmsCareerProgressionPastEntry>(
  {
    year: {
      type: Number,
      required: true,
      min: 1900,
      max: 2200,
      validate: {
        validator: Number.isInteger,
        message: 'Career progression year must be a whole number',
      },
    },
    grade: { type: String, trim: true, maxlength: 100 },
    progression: { type: String, trim: true, maxlength: 150 },
    function: { type: String, trim: true, maxlength: 150 },
    unitOrDepartment: { type: String, trim: true, maxlength: 150 },
    sequence: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Career progression sequence must be a whole number',
      },
    },
  },
  { _id: false },
);

careerProgressionPastEntrySchema.pre('validate', function (next) {
  if (
    !this.grade &&
    !this.progression &&
    !this.function &&
    !this.unitOrDepartment
  ) {
    return next(
      new Error(
        'Career progression requires Grade, Progression, Function, or Unit / Department',
      ),
    );
  }
  next();
});

const pmsEmployeeCareerProfileSchema = new Schema<IPmsEmployeeCareerProfile>(
  {
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
    qualification: { type: String, trim: true, maxlength: 250 },
    currentGrade: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    gradeEffectiveDate: Date,
    yearsInGrade: { type: Number, min: 0, max: 80 },
    previousExperienceYears: { type: Number, min: 0, max: 80 },
    asOfDate: { type: Date, required: true },
    careerProgressionPast: {
      type: [careerProgressionPastEntrySchema],
      default: [],
    },
    profileVersion: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Profile version must be a whole number',
      },
    },
    lastUpdatedSource: {
      type: String,
      required: true,
      enum: Object.values(PmsEmployeeProfileUpdateSource),
    },
    sourceImportId: {
      type: Schema.Types.ObjectId,
      ref: 'PmsEmployeeProfileImport',
    },
    lastImportedAt: Date,
    lastImportedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    collection: 'pms_employee_career_profiles',
    timestamps: true,
  },
);

pmsEmployeeCareerProfileSchema.index(
  { employeeId: 1 },
  {
    unique: true,
    name: 'uq_pms_employee_career_profile_employee',
  },
);
pmsEmployeeCareerProfileSchema.index(
  { employeeCode: 1 },
  {
    unique: true,
    name: 'uq_pms_employee_career_profile_employee_code',
    collation: { locale: 'en', strength: 2 },
  },
);
pmsEmployeeCareerProfileSchema.index({ currentGrade: 1, asOfDate: -1 });
pmsEmployeeCareerProfileSchema.index({ updatedAt: -1 });
pmsEmployeeCareerProfileSchema.index({ sourceImportId: 1 });

pmsEmployeeCareerProfileSchema.pre('validate', function (next) {
  if (!this.gradeEffectiveDate && this.yearsInGrade === undefined) {
    this.invalidate(
      'yearsInGrade',
      'Years in Grade is required when Grade Effective Date is unavailable',
    );
  }

  if (
    this.gradeEffectiveDate &&
    this.asOfDate &&
    this.gradeEffectiveDate.getTime() > this.asOfDate.getTime()
  ) {
    this.invalidate(
      'gradeEffectiveDate',
      'Grade Effective Date cannot be later than the Last verified date',
    );
  }

  const asOfYear = this.asOfDate?.getUTCFullYear();
  const careerYearGradeKeys = new Set<string>();
  for (const [index, entry] of this.careerProgressionPast.entries()) {
    if (asOfYear && entry.year > asOfYear) {
      this.invalidate(
        `careerProgressionPast.${index}.year`,
        'Career progression year cannot be later than the Last verified year',
      );
    }

    const normalizedGrade =
      String(entry.grade ?? '').trim().toLocaleLowerCase() || '<blank>';
    const normalizedProgression = String(entry.progression ?? '')
      .trim()
      .toLocaleLowerCase();
    const yearGradeKey = normalizedProgression
      ? `${entry.year}:${normalizedGrade}:${normalizedProgression}`
      : `${entry.year}:${normalizedGrade}`;
    if (careerYearGradeKeys.has(yearGradeKey)) {
      this.invalidate(
        `careerProgressionPast.${index}.grade`,
        'Career progression Year and Grade combination must be unique for an employee',
      );
    }
    careerYearGradeKeys.add(yearGradeKey);
  }

  if (
    this.lastUpdatedSource === PmsEmployeeProfileUpdateSource.EXCEL_IMPORT &&
    !this.sourceImportId
  ) {
    this.invalidate(
      'sourceImportId',
      'Source Import is required for an Excel-imported profile',
    );
  }

  next();
});

export const PmsEmployeeCareerProfile = mongoose.model<IPmsEmployeeCareerProfile>(
  'PmsEmployeeCareerProfile',
  pmsEmployeeCareerProfileSchema,
);
