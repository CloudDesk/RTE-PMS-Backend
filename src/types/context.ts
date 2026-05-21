import { Types } from 'mongoose';

export interface RequestContext {
  reqRole: string;
  requestId: string;
  pmsCurrentDate?: Date;
  user?: {
    _id: Types.ObjectId | string;
    email: string;
    name: string;
    role: string;
    departmentId: string;
    active: boolean;
    // New fields for UAE + external user support
    country: string;
    currency: string;
    licenseType: string;
    portalAccess: boolean;
  };
} 
