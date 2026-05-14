import { Schema, model } from 'mongoose';

export interface IEmployeeAverage {
    userId: string;
    userName: string;
    averageWorkHours: string;
    presentDays: number;
    attendancePercentage: number;
    department?: string;
}

export interface ISocialEventSummary {
    _id: string;
    type: string;
    subject: string;
    message: string;
    bannerImage?: string;
    attachments?: string[];
    eventDate: Date;
    postedBy: string;
    employeeId?: any;
    metadata?: any;
}

export interface IDashboardMetrics {
    totalEmployees: number;
    individualAverageHours?: IEmployeeAverage[];
    pendingApprovals: {
        leaves: number;
        regularizations: number;
        overtime: number;
        wfh: number;
        total: number;
        byDepartment: Array<{
            departmentId: string;
            count: number;
        }>;
        byType: Array<{
            leaveType: string;
            count: number;
        }>;
    };
    leaveBalances: {
        annual: { alloted: number; availed: number; remaining: number };
        sick: { alloted: number; availed: number; remaining: number };
        compOff: { alloted: number; availed: number; remaining: number };
        lossOfPay: { alloted: number; availed: number; remaining: number };
        otherPaid: { alloted: number; availed: number; remaining: number };
        otherUnpaid: { alloted: number; availed: number; remaining: number };
        maternity: { alloted: number; availed: number; remaining: number };
    };
    payrollProcessed: {
        amount: number;
        count: number;
        totalCTC: number;
        totalDeductions: number;
        totalOvertimePay: number;
        totalBonus: number;
        totalReimbursement: number;
        byStatus: Array<{
            status: string;
            count: number;
            totalAmount: number;
        }>;
    };
    departmentWiseEmployees: Array<{
        departmentId: string;
        departmentName: string;
        count: number;
        employees: Array<{
            name: string;
            email: string;
            role: string;
        }>;
    }>;
    todayAttendance: {
        present: number;
        leave: number;
        absent: number;
        totalActive: number;
    };
    upcomingHolidays: Array<{
        date: Date;
        name: string;
        description?: string;
        type?: string;
    }>;
    resignationStatus: Array<{
        month: string;
        pending: number;
        approved: number;
    }>;
    socialEvents?: ISocialEventSummary[];
}

export interface IUserDashboardMetrics {
    workHighlights: {
        averageWorkHours: string;
        attendancePercentage: number;
        presentDays: number;
        totalWorkingDays: number;
    };
    socialEvents?: ISocialEventSummary[];
}

// This is a virtual model for aggregation purposes only
const dashboardSchema = new Schema({}, { strict: false });

export const Dashboard = model('Dashboard', dashboardSchema);
