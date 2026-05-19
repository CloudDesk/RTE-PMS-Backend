import { Schema, model, Document, Types } from 'mongoose';
import * as argon2 from 'argon2';
import { ObjectId } from '@fastify/mongodb';

// Define an interface for the shift assignment data
interface IShiftAssignmentData {
  startDate: Date | string;
  endDate: Date | string | null;
  shiftCode: string;
  shiftId: ObjectId;
  shiftAssignmentId: ObjectId;
}

interface IHolidayCalendarHistoryEntry {
  calendarId: ObjectId;
  year: number;
  isActive: boolean;
  assignedAt: Date;
  assignedBy?: Types.ObjectId;
}

interface IBankDetails {
  accountHolderName: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
  isActive: boolean; // Main salary account
}

interface IVisaDetails {
  visaType?: 'Standard Employment Visa' | 'Domestic Worker Visa' | 'Green Visa';
  visaExpiryDate?: Date;
  isActive?: boolean; // Only relevant when visa details are provided
}

interface IEmergencyContact {
  name?: string;
  relationship?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  pincode?: number;
  mobileNo?: string;
}

interface IExperienceDetail {
  companyName?: string;
  role?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  duration?: string;
  documentUrl?: string;
  documentId?: string;
  companyAddress?: string;
  lastDrawnSalary?: number;
  reasonForLeaving?: string;
  verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
}

interface ICurrentCompanyExperience {
  years: number;
  months: number;
  totalMonths: number;
}

interface IResignation {
  status: 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';
  summary: string;
  remarks?: string;
  submittedAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  withdrawnAt?: Date;
  approvedBy?: Types.ObjectId; // Changed to ObjectId
  noticePeriodDays?: number;
  preferredLastWorkingDay?: Date;
  approvedLastWorkingDay?: Date;
  finalSettlementDone: boolean;
  isActive: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: string; // e.g., 'admin', 'manager', 'staff', 'external'
  specificRole?: string; // Specific role designation
  isSuperAdmin?: boolean;
  departmentId: string;
  managerId?: string;
  managerName?: string;
  costCenter: string; // Mandatory
  employeeCode: string; // Employee code (mandatory and unique)
  checkinId?: string;
  biometricId?: string; // Optional - not used for UAE users
  active: boolean;
  resetToken?: string;
  resetTokenExpiry?: Date;
  joiningDate: Date;
  confirmationDate?: Date; // Optional - defaults to joiningDate if not provided
  probationDate: string; // Mandatory - changed to string
  location: string;
  phone?: string;
  emergencyContact?: IEmergencyContact;
  address?: string;
  bloodGroup?: string;
  dateOfBirth?: Date;
  fatherName?: string;
  maritalStatus?: string;
  spouseName?: string;
  separationDate?: Date;
  noticePeriod: number; // Mandatory - Notice period in days
  personalMailId?: string;
  nationality?: string;
  employmentStatus: string; // Mandatory
  gender?: string;
  currentCompanyExperience?: ICurrentCompanyExperience | null;
  createdAt: Date;
  updatedAt: Date;
  currentShiftAssignmentData: IShiftAssignmentData | null;
  upcomingShiftAssignmentData: IShiftAssignmentData | null;

  holidayCalendarId?: string;
  holidayCalendarHistory?: IHolidayCalendarHistoryEntry[];
  resignations?: IResignation[];
  experienceDetails?: IExperienceDetail[];

  bankDetails: IBankDetails[]; // Array for multiple bank accounts
  certificateIds?: Types.ObjectId[];

  fcmToken?: string; // Optional field for FCM token

  // Government IDs and academic details
  governmentIds?: {
    pan?: { number?: string; country?: string; documentUrl?: string; documentId?: string; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
    aadhaar?: { number?: string; country?: string; documentUrl?: string; documentId?: string; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
    passport?: { number?: string; country?: string; documentUrl?: string; documentId?: string; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
    voterId?: { number?: string; country?: string; documentUrl?: string; documentId?: string; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
    drivingLicense?: { number?: string; country?: string; documentUrl?: string; documentId?: string; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
    pf?: { number?: string; uan?: string; familyPfNumber?: string; country?: string; documentUrl?: string; documentId?: string; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
  };
  academicDetails?: Array<{
    qualificationType?: string;
    fieldOfStudy?: string;
    institution?: string;
    grade?: string;
    yearOfCompletion?: number | string;
    documentUrl?: string;
    documentId?: string;
    verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
  }>;

  // New fields for UAE + external user support
  country: string; // 'IN' | 'AE'
  currency: string; // 'INR' | 'AED'
  licenseType: string; // 'employee' | 'external'
  portalAccess: boolean; // false for external users

  // UAE-specific visa details
  visaDetails?: IVisaDetails;

  // Client field for employee assignment
  client?: string;

  // Consultancy staff flag - for special tax and PF treatment
  isConsultancy?: boolean;

  // Intern flag - for special payroll treatment (no PF, no tax, no professional tax)
  isIntern?: boolean;

  // PF (Provident Fund) related fields - individual fields (not in governmentIds)
  pfNumber?: string;
  uanNumber?: string;
  familyPfNumber?: string;
  pfJoinDate?: Date; // Optional - PF join date

}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
      // Duplicate email allowed when allowDuplicateEmail=true (payroll-only, portalAccess: false). Uniqueness only when portalAccess: true (partial index below).
    },
    currentShiftAssignmentData: {
      type: {
        startDate: { type: Schema.Types.Mixed },
        endDate: { type: Schema.Types.Mixed },
        shiftCode: { type: String },
        shiftId: { type: ObjectId },
        shiftAssignmentId: { type: ObjectId }

      },
      default: null

    },
    upcomingShiftAssignmentData: {
      type: {
        startDate: { type: Schema.Types.Mixed },
        endDate: { type: Schema.Types.Mixed },
        shiftCode: { type: String },
        shiftId: { type: ObjectId },
        shiftAssignmentId: { type: ObjectId }
      },
      default: null

    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      required: true,
      enum: ['admin', 'manager', 'staff', 'director', 'external'], // Added 'director' and 'external'
    },
    specificRole: {
      type: String,
      required: false,
      description: 'Specific role designation'
    },
    isSuperAdmin: { type: Boolean, default: false },
    departmentId: {
      type: String,
      required: true,
      validate: {
        validator: async function (value: string) {
          try {
            // Allow "external_contract" for external users even if not in LOV
            // Access role from the document context
            const userDoc = this as unknown as IUser;
            if (value === 'external_contract' && userDoc.role === 'external') {
              return true;
            }
            let locDept = await model('Lov').findOne({
              type: 'department',
              'values.value': value,
              'values.isActive': true
            })
            return !!locDept;
          } catch (err) {
            return false;
          }
        },
        message: "Invalid department value"
      }
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    managerName: {
      type: String,
      maxlength: 100,
    },
    costCenter: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    employeeCode: {
      type: String,
      trim: true,
      maxlength: 50,
      required: true,
      unique: true,
      description: 'Employee code (mandatory and unique)'
    },
    checkinId: {
      type: String,
      trim: true,
      maxlength: 20,
      unique: true,
      sparse: true,
    },
    biometricId: {
      type: String,
      trim: true,
      maxlength: 20,
      unique: true,
      sparse: true,
      required: false, // Not required for UAE users
    },
    active: {
      type: Boolean,
      default: true,
    },
    resetToken: {
      type: String,
      select: false,
    },
    resetTokenExpiry: {
      type: Date,
      select: false,
    },
    joiningDate: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    confirmationDate: {
      type: Date,
      required: false, // Optional - defaults to joiningDate if not provided
    },
    probationDate: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    location: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    emergencyContact: {
      type: {
        name: { type: String, required: false, trim: true, maxlength: 100 },
        relationship: { type: String, required: false, trim: true, maxlength: 50 },
        address: { type: String, required: false, trim: true, maxlength: 200 },
        city: { type: String, required: false, trim: true, maxlength: 100 },
        district: { type: String, required: false, trim: true, maxlength: 100 },
        state: { type: String, required: false, trim: true, maxlength: 100 },
        country: { type: String, required: false, trim: true, maxlength: 100 },
        pincode: { type: Number, required: false },
        mobileNo: { type: String, required: false, trim: true, maxlength: 20 },
      },
      required: false,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    gender: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
    },
    nationality: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    employmentStatus: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    bloodGroup: {
      type: String,
      trim: true,
      maxlength: 5,
    },
    dateOfBirth: {
      type: Date,
      required: false,
    },
    fatherName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    maritalStatus: {
      type: String,
      trim: true,
    },
    spouseName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    separationDate: {
      type: Date,
    },
    noticePeriod: {
      type: Number,
      required: true,
      min: 0,
    },
    personalMailId: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 100,
      validate: {
        validator: function (v: string) {
          if (!v) return true; // Optional field
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Invalid personal email format'
      }
    },
    bankDetails: [
      {
        accountHolderName: { type: String, required: true, trim: true },
        accountNumber: { type: String, required: true, trim: true },
        bankName: { type: String, required: true, trim: true },
        ifscCode: { type: String, required: true, trim: true },
        isActive: { type: Boolean, default: false },
      },
    ],

    certificateIds: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    holidayCalendarId: {
      type: Schema.Types.ObjectId,
      ref: 'holidaycalendar',
      required: false,
    },
    holidayCalendarHistory: {
      type: [
        {
          calendarId: { type: ObjectId, ref: 'holidaycalendar', required: true },
          year: { type: Number, required: true },
          isActive: { type: Boolean, default: false },
          assignedAt: { type: Date, default: () => new Date() },
          assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
        }
      ],
      default: [],
    },
    experienceDetails: {
      type: [{
        companyName: { type: String, trim: true, maxlength: 200 },
        role: { type: String, trim: true, maxlength: 150 },
        startDate: { type: Schema.Types.Mixed }, // Supports both Date and string
        endDate: { type: Schema.Types.Mixed }, // Supports both Date and string
        duration: { type: String, trim: true, maxlength: 100 },
        documentUrl: { type: String, trim: true, maxlength: 500 },
        documentId: { type: String, trim: true },
        companyAddress: { type: String, trim: true, maxlength: 300 },
        lastDrawnSalary: { type: Number, min: 0 },
        reasonForLeaving: { type: String, trim: true, maxlength: 300 },
        verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
      }],
      default: [],
    },
    resignations: [{
      status: {
        type: String, enum: ['Pending', 'Approved', 'Rejected', 'Withdrawn']
      },
      summary: { type: String },
      remarks: { type: String },
      submittedAt: { type: Date },
      approvedAt: { type: Date },
      rejectedAt: { type: Date },
      withdrawnAt: { type: Date },
      approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      noticePeriodDays: { type: Number },
      preferredLastWorkingDay: { type: Date },
      approvedLastWorkingDay: { type: Date },
      finalSettlementDone: { type: Boolean },
      isActive: { type: Boolean, default: true }
    }],
    fcmToken: {
      type: String,
      required: false,
    },
    governmentIds: {
      type: {
        pan: {
          type: {
            number: { type: String, trim: true },
            country: { type: String, trim: true },
            documentUrl: { type: String, trim: true },
            documentId: { type: String, trim: true },
            verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
          },
          required: false
        },
        aadhaar: {
          type: {
            number: { type: String, trim: true },
            country: { type: String, trim: true },
            documentUrl: { type: String, trim: true },
            documentId: { type: String, trim: true },
            verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
          },
          required: false
        },
        passport: {
          type: {
            number: { type: String, trim: true },
            country: { type: String, trim: true },
            documentUrl: { type: String, trim: true },
            documentId: { type: String, trim: true },
            verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
          },
          required: false
        },
        voterId: {
          type: {
            number: { type: String, trim: true },
            country: { type: String, trim: true },
            documentUrl: { type: String, trim: true },
            documentId: { type: String, trim: true },
            verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
          },
          required: false
        },
        drivingLicense: {
          type: {
            number: { type: String, trim: true },
            country: { type: String, trim: true },
            documentUrl: { type: String, trim: true },
            documentId: { type: String, trim: true },
            verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
          },
          required: false
        },
        pf: {
          type: {
            number: { type: String, trim: true },
            uan: { type: String, trim: true },
            familyPfNumber: { type: String, trim: true },
            country: { type: String, trim: true },
            documentUrl: { type: String, trim: true },
            documentId: { type: String, trim: true },
            verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
          },
          required: false
        }
      },
      required: false
    },
    academicDetails: {
      type: [{
        qualificationType: { type: String, trim: true },
        fieldOfStudy: { type: String, trim: true, maxlength: 200 },
        institution: { type: String, trim: true, maxlength: 200 },
        grade: { type: String, trim: true, maxlength: 50 },
        yearOfCompletion: { type: Schema.Types.Mixed }, // Supports both number and string
        documentUrl: { type: String, trim: true, maxlength: 500 },
        documentId: { type: String, trim: true },
        verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
      }],
      default: []
    },
    // New fields for UAE + external user support
    country: {
      type: String,
      enum: ['IN', 'AE'], // Extend later for other countries
      default: 'IN'
    },
    currency: {
      type: String,
      required: true,
      enum: ['INR', 'AED'],
      default: 'INR'
    },
    licenseType: {
      type: String,
      enum: ['employee', 'external'],
      default: 'employee'
    },
    portalAccess: {
      type: Boolean,
      default: true
    }, // false for external users

    // UAE-specific visa details
    visaDetails: {
      visaType: {
        type: String,
        enum: ['Standard Employment Visa', 'Domestic Worker Visa', 'Green Visa'],
        required: false
      },
      visaExpiryDate: {
        type: Date,
        required: false,
        validate: {
          validator: function (value: Date) {
            if (value) {
              return value > new Date(); // Visa expiry date should be in the future
            }
            return true;
          },
          message: 'Visa expiry date must be in the future for UAE employees'
        }
      },
      isActive: {
        type: Boolean,
        required: false
      }
    },
    // Client field for employee assignment
    client: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
      description: 'Client name or identifier for employee assignment'
    },
    // Consultancy staff flag - for special tax and PF treatment
    isConsultancy: {
      type: Boolean,
      default: false,
      description: 'Flag to identify consultancy staff (no PF, 1% TDS deduction)'
    },
    // Intern flag - for special payroll treatment
    isIntern: {
      type: Boolean,
      default: false,
      description: 'Flag to identify intern employees (no PF, no tax, no professional tax)'
    },
    // PF (Provident Fund) related fields - individual fields (not in governmentIds)
    pfNumber: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
      description: 'Provident Fund (PF) Number'
    },
    uanNumber: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
      description: 'Universal Account Number (UAN) for PF'
    },
    familyPfNumber: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
      description: 'Family Provident Fund Number'
    },
    pfJoinDate: {
      type: Date,
      required: false,
      description: 'PF join date (optional)'
    }
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
// Email unique only when portalAccess: true (one login per email). Same email allowed when allowDuplicateEmail=true (portalAccess: false).
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { portalAccess: true } }
);
userSchema.index({ employeeCode: 1 }, { unique: true });
userSchema.index({ checkinId: 1 }, { unique: true, sparse: true });
userSchema.index({ biometricId: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { sparse: true }); // For WhatsApp authentication
userSchema.index({ managerId: 1 });
userSchema.index({ role: 1 });
userSchema.index({ active: 1 });
userSchema.index({ country: 1 });
userSchema.index({ licenseType: 1 });
userSchema.index({ portalAccess: 1 });
userSchema.index({ client: 1 });
userSchema.index({ isConsultancy: 1 });
userSchema.index({ isIntern: 1 });

// Initializer hook to handle legacy data where emergencyContact might be an empty string
// This fixes the data as soon as it's loaded from the DB, preventing validation errors later
userSchema.post('init', function (doc) {
  if (doc.emergencyContact === '' as any) {
    doc.emergencyContact = undefined;
  }
});

// Pre-validate hook as a second layer of defense
userSchema.pre('validate', function (next) {
  if (this.emergencyContact === '' as any) {
    this.emergencyContact = undefined;
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  console.log('🔐 User pre-save hook: Password hashing');
  console.log('📋 User data before hashing:', {
    _id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    departmentId: this.departmentId,
    managerId: this.managerId,
    active: this.active,
    isNew: this.isNew,
    isModified: this.isModified()
  });

  if (!this.isModified('password')) {
    console.log('⏭️ Password not modified, skipping hash');
    return next();
  }

  try {
    this.password = await argon2.hash(this.password);
    console.log('✅ Password hashed successfully');
    next();
  } catch (error: any) {
    console.error('❌ Error hashing password:', error);
    next(new Error('Error hashing password: ' + error.message));
  }
});

// Populate manager name before saving
userSchema.pre('save', async function (next) {
  console.log('👥 User pre-save hook: Manager name population');
  console.log('📋 Manager details:', {
    managerId: this.managerId,
    managerName: this.managerName,
    isModifiedManagerId: this.isModified('managerId'),
    hasManagerName: !!this.managerName
  });

  if (this.managerId && (this.isModified('managerId') || !this.managerName)) {
    try {
      console.log('🔍 Looking up manager:', this.managerId);
      const manager = await User.findById(this.managerId).select('name');
      if (manager) {
        this.managerName = manager.name;
        console.log('✅ Manager name populated:', manager.name);
      } else {
        console.log('⚠️ Manager not found:', this.managerId);
      }
    } catch (error: any) {
      console.error('❌ Error populating manager name:', error);
      next(error);
    }
  } else {
    console.log('⏭️ Skipping manager name population');
  }
  next();
});

userSchema.pre('save', function (next) {
  if (this.isSuperAdmin) {
    if (this.role !== 'admin') {
      return next(new Error('SuperAdmin must have role "Admin"'));
    }
    if (this.managerId && !this._id.equals(this.managerId)) {
      return next(new Error('SuperAdmin cannot report to another manager'));
    }
    this.managerId = undefined;
    this.managerName = undefined;
  }
  next();
});

// Pre-save hook to handle external users
userSchema.pre('save', function (next) {
  if (this.licenseType === 'external') {
    // External users should have portalAccess set to false by default
    if (this.isNew) {
      this.portalAccess = false;
    }
    // External users should have role 'external'
    if (this.role !== 'external') {
      this.role = 'external';
    }
  }
  next();
});

// Pre-save hook to validate unique employeeCode
userSchema.pre('save', async function (next) {
  // Only validate if employeeCode is being set or modified
  if (!this.isModified('employeeCode') && !this.isNew) {
    return next();
  }

  if (!this.employeeCode) {
    return next();
  }

  try {
    // Get the User model from the database connection
    const UserModel = this.db.model('User');

    // Build query to find duplicate employeeCode
    const query: any = { employeeCode: this.employeeCode };

    // If this is an update (not a new document), exclude current user from the check
    if (!this.isNew && this._id) {
      query._id = { $ne: this._id };
    }

    const existingUser = await UserModel.findOne(query);

    if (existingUser) {
      return next(new Error(`Employee code "${this.employeeCode}" already exists. Please use a unique employee code.`));
    }

    next();
  } catch (error: any) {
    next(error);
  }
});

// Pre-save hook to automatically set employment status to "confirmed" after 180 days from joining date
userSchema.pre('save', function (next) {
  if (this.joiningDate && this.employmentStatus) {
    const joiningDate = new Date(this.joiningDate);
    const today = new Date();
    const daysSinceJoining = Math.floor((today.getTime() - joiningDate.getTime()) / (1000 * 60 * 60 * 24));

    // If 180 days or more have passed since joining date, automatically set status to "confirmed"
    if (daysSinceJoining >= 180 && this.employmentStatus.toLowerCase() !== 'confirmed') {
      this.employmentStatus = 'Confirmed';
    }
  }
  next();
});

// Pre-save hook to handle UAE-specific visa validation
userSchema.pre('save', function (next) {
  if (this.country === 'AE' && this.visaDetails) {
    // Only validate if visa details are provided (optional field)
    if (!this.visaDetails.visaType || !this.visaDetails.visaExpiryDate) {
      return next(new Error('If visa details are provided, both visa type and expiry date are required'));
    }

    // Check if visa is expired
    if (this.visaDetails.visaExpiryDate <= new Date()) {
      return next(new Error('Visa has expired. Please update with a valid expiry date'));
    }
  }
  next();
});

// Include virtuals in JSON/Object outputs
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// Virtual: current company experience (years, months, totalMonths)
userSchema.virtual('currentCompanyExperience').get(function () {
  if (!this.joiningDate) return null;
  const start = new Date(this.joiningDate);
  if (isNaN(start.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  if (diffMs <= 0) {
    return { years: 0, months: 0, totalMonths: 0 };
  }

  const totalMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  const years = parseFloat((totalMonths / 12).toFixed(1));
  const months = parseFloat(((totalMonths % 12) / 12).toFixed(2));

  return { years, months, totalMonths };
});

export const User = model<IUser>('User', userSchema);
