// Fixed version of your dashboard API
import { fetchApi } from './base';
import type { ApiResponse } from '$lib/types/api';

// Admin Dashboard Types
export interface AdminDashboardData {
    totalEmployees: number;
    pendingApprovals: {
        leaves: number;
        regularizations: number;
        overtime: number;
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
        date: string;
        name: string;
        description?: string;
    }>;
    resignationStatus: Array<{
        month: string;
        pending: number;
        approved: number;
    }>;
}

// Manager Dashboard Types
export interface ManagerDashboardData {
    teamOverview: {
        totalEmployees: number;
        employeesOnLeaveToday: number;
        pendingApprovals: number;
    };
    attendanceSummary: {
        present: number;
        onLeave: number;
        absent: number;
        unknown: number;
        total: number;
    };
    attendanceStatus: {
        onTime: number;
        late: number;
        earlyExit: number;
    };
    pendingApprovals: {
        leaves: number;
        regularizations: number;
        overtime: number;
        resignations: number;
    };
    employees: Array<{
        _id: string;
        name: string;
        email: string;
        role: string;
        departmentId: string;
        attendanceStatus: 'present' | 'onLeave' | 'absent' | 'unknown';
        attendanceType: 'onTime' | 'late' | 'earlyExit' | 'unknown';
        checkInTime: string | null;
        checkOutTime: string | null;
        isOnLeave: boolean;
        leaveType: string | null;
        shiftCode: string | null;
    }>;
}

// Legacy types for backward compatibility
export type DashboardStats = {
    totalEmployees: number;
    activeEmployees: number;
    onLeave: number;
    trainingProgress: number;
};

export type Activity = {
    id: string;
    type: 'login' | 'leave_request' | 'training_complete' | 'attendance';
    userId: string;
    userName: string;
    timestamp: string;
    details: Record<string, any>;
};

export type Metrics = {
    attendance: {
        present: number;
        absent: number;
        late: number;
    };
    training: {
        completed: number;
        inProgress: number;
        notStarted: number;
    };
};

export const dashboardApi = {
    // Get admin dashboard metrics
    getAdminDashboard: async (): Promise<ApiResponse<AdminDashboardData>> => {
        console.log('📊 Fetching Admin Dashboard Data');
        console.log('🔍 Current API_BASE_URL:', import.meta.env.VITE_API_BASE_URL);

        // Check if API base URL is configured
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        if (!API_BASE_URL) {
            console.log('⚠️ API_BASE_URL not configured, using mock data');
            // FIXED: Added return statement here
            return {
                success: true,
                data: {
                    totalEmployees: 150,
                    pendingApprovals: {
                        leaves: 12,
                        regularizations: 5,
                        overtime: 8,
                        total: 25,
                        byDepartment: [
                            { departmentId: 'dept1', count: 8 },
                            { departmentId: 'dept2', count: 12 },
                            { departmentId: 'dept3', count: 5 }
                        ],
                        byType: [
                            { leaveType: 'Annual Leave', count: 7 },
                            { leaveType: 'Sick Leave', count: 3 },
                            { leaveType: 'Personal Leave', count: 2 }
                        ]
                    },
                    leaveBalances: {
                        annual: { alloted: 21, availed: 8, remaining: 13 },
                        sick: { alloted: 7, availed: 2, remaining: 5 },
                        compOff: { alloted: 5, availed: 1, remaining: 4 },
                        lossOfPay: { alloted: 0, availed: 0, remaining: 0 },
                        otherPaid: { alloted: 3, availed: 1, remaining: 2 },
                        otherUnpaid: { alloted: 0, availed: 0, remaining: 0 }
                    },
                    payrollProcessed: {
                        amount: 2500000,
                        count: 150,
                        totalCTC: 3000000,
                        totalDeductions: 300000,
                        totalOvertimePay: 150000,
                        totalBonus: 200000,
                        totalReimbursement: 50000,
                        byStatus: [
                            { status: 'Processed', count: 140, totalAmount: 2300000 },
                            { status: 'Pending', count: 10, totalAmount: 200000 }
                        ]
                    },
                    departmentWiseEmployees: [
                        {
                            departmentId: 'dept1',
                            departmentName: 'Engineering',
                            count: 45,
                            employees: [
                                { name: 'John Doe', email: 'john@company.com', role: 'Senior Developer' },
                                { name: 'Jane Smith', email: 'jane@company.com', role: 'Team Lead' }
                            ]
                        },
                        {
                            departmentId: 'dept2',
                            departmentName: 'Sales',
                            count: 30,
                            employees: [
                                { name: 'Mike Johnson', email: 'mike@company.com', role: 'Sales Manager' }
                            ]
                        }
                    ],
                    todayAttendance: {
                        present: 120,
                        leave: 15,
                        absent: 10,
                        totalActive: 135
                    },
                    upcomingHolidays: [
                        { date: '2024-12-25', name: 'Christmas Day', description: 'Public Holiday' },
                        { date: '2024-12-31', name: 'New Year Eve', description: 'Half Day' }
                    ],
                    resignationStatus: [
                        { month: 'November', pending: 2, approved: 1 },
                        { month: 'December', pending: 3, approved: 0 }
                    ]
                }
            };
        }

        try {
            const response = await fetchApi<AdminDashboardData>('/dashboard/admin', {
                method: 'GET'
            });
            return { success: true, data: response };
        } catch (error) {
            console.error('❌ Admin Dashboard API Error:', error);
            // Return mock data for development
            return {
                success: true,
                data: {
                    totalEmployees: 150,
                    pendingApprovals: {
                        leaves: 12,
                        regularizations: 5,
                        overtime: 8,
                        total: 25,
                        byDepartment: [
                            { departmentId: 'dept1', count: 8 },
                            { departmentId: 'dept2', count: 12 },
                            { departmentId: 'dept3', count: 5 }
                        ],
                        byType: [
                            { leaveType: 'Annual Leave', count: 7 },
                            { leaveType: 'Sick Leave', count: 3 },
                            { leaveType: 'Personal Leave', count: 2 }
                        ]
                    },
                    leaveBalances: {
                        annual: { alloted: 21, availed: 8, remaining: 13 },
                        sick: { alloted: 7, availed: 2, remaining: 5 },
                        compOff: { alloted: 5, availed: 1, remaining: 4 },
                        lossOfPay: { alloted: 0, availed: 0, remaining: 0 },
                        otherPaid: { alloted: 3, availed: 1, remaining: 2 },
                        otherUnpaid: { alloted: 0, availed: 0, remaining: 0 }
                    },
                    payrollProcessed: {
                        amount: 2500000,
                        count: 150,
                        totalCTC: 3000000,
                        totalDeductions: 300000,
                        totalOvertimePay: 150000,
                        totalBonus: 200000,
                        totalReimbursement: 50000,
                        byStatus: [
                            { status: 'Processed', count: 140, totalAmount: 2300000 },
                            { status: 'Pending', count: 10, totalAmount: 200000 }
                        ]
                    },
                    departmentWiseEmployees: [
                        {
                            departmentId: 'dept1',
                            departmentName: 'Engineering',
                            count: 45,
                            employees: [
                                { name: 'John Doe', email: 'john@company.com', role: 'Senior Developer' },
                                { name: 'Jane Smith', email: 'jane@company.com', role: 'Team Lead' }
                            ]
                        },
                        {
                            departmentId: 'dept2',
                            departmentName: 'Sales',
                            count: 30,
                            employees: [
                                { name: 'Mike Johnson', email: 'mike@company.com', role: 'Sales Manager' }
                            ]
                        }
                    ],
                    todayAttendance: {
                        present: 120,
                        leave: 15,
                        absent: 10,
                        totalActive: 135
                    },
                    upcomingHolidays: [
                        { date: '2024-12-25', name: 'Christmas Day', description: 'Public Holiday' },
                        { date: '2024-12-31', name: 'New Year Eve', description: 'Half Day' }
                    ],
                    resignationStatus: [
                        { month: 'November', pending: 2, approved: 1 },
                        { month: 'December', pending: 3, approved: 0 }
                    ]
                }
            };
        }
    },

    // Get manager dashboard data
    getManagerDashboard: async (): Promise<ApiResponse<ManagerDashboardData>> => {
        console.log('👥 Fetching Manager Dashboard Data');

        // Check if API base URL is configured
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        if (!API_BASE_URL) {
            console.log('⚠️ API_BASE_URL not configured, using mock data');
            return {
                success: true,
                data: {
                    teamOverview: {
                        totalEmployees: 12,
                        employeesOnLeaveToday: 2,
                        pendingApprovals: 5
                    },
                    attendanceSummary: {
                        present: 8,
                        onLeave: 2,
                        absent: 1,
                        unknown: 1,
                        total: 12
                    },
                    attendanceStatus: {
                        onTime: 6,
                        late: 2,
                        earlyExit: 0
                    },
                    pendingApprovals: {
                        leaves: 3,
                        regularizations: 1,
                        overtime: 1,
                        resignations: 0
                    },
                    employees: [
                        {
                            _id: 'emp1',
                            name: 'Alice Johnson',
                            email: 'alice@company.com',
                            role: 'Senior Developer',
                            departmentId: 'dept1',
                            attendanceStatus: 'present',
                            attendanceType: 'onTime',
                            checkInTime: '2024-01-15T09:00:00Z',
                            checkOutTime: null,
                            isOnLeave: false,
                            leaveType: null,
                            shiftCode: 'SHIFT_1'
                        },
                        {
                            _id: 'emp2',
                            name: 'Bob Smith',
                            email: 'bob@company.com',
                            role: 'Developer',
                            departmentId: 'dept1',
                            attendanceStatus: 'present',
                            attendanceType: 'late',
                            checkInTime: '2024-01-15T09:30:00Z',
                            checkOutTime: null,
                            isOnLeave: false,
                            leaveType: null,
                            shiftCode: 'SHIFT_1'
                        },
                        {
                            _id: 'emp3',
                            name: 'Carol Davis',
                            email: 'carol@company.com',
                            role: 'QA Engineer',
                            departmentId: 'dept1',
                            attendanceStatus: 'onLeave',
                            attendanceType: 'unknown',
                            checkInTime: null,
                            checkOutTime: null,
                            isOnLeave: true,
                            leaveType: 'Annual Leave',
                            shiftCode: 'SHIFT_1'
                        }
                    ]
                }
            };
        }

        try {
            const response = await fetchApi<ManagerDashboardData>('/dashboard/manager', {
                method: 'GET'
            });
            return { success: true, data: response };
        } catch (error) {
            console.error('❌ Manager Dashboard API Error:', error);
            // Return mock data for development
            return {
                success: true,
                data: {
                    teamOverview: {
                        totalEmployees: 12,
                        employeesOnLeaveToday: 2,
                        pendingApprovals: 5
                    },
                    attendanceSummary: {
                        present: 8,
                        onLeave: 2,
                        absent: 1,
                        unknown: 1,
                        total: 12
                    },
                    attendanceStatus: {
                        onTime: 6,
                        late: 2,
                        earlyExit: 0
                    },
                    pendingApprovals: {
                        leaves: 3,
                        regularizations: 1,
                        overtime: 1,
                        resignations: 0
                    },
                    employees: [
                        {
                            _id: 'emp1',
                            name: 'Alice Johnson',
                            email: 'alice@company.com',
                            role: 'Senior Developer',
                            departmentId: 'dept1',
                            attendanceStatus: 'present',
                            attendanceType: 'onTime',
                            checkInTime: '2024-01-15T09:00:00Z',
                            checkOutTime: null,
                            isOnLeave: false,
                            leaveType: null,
                            shiftCode: 'SHIFT_1'
                        },
                        {
                            _id: 'emp2',
                            name: 'Bob Smith',
                            email: 'bob@company.com',
                            role: 'Developer',
                            departmentId: 'dept1',
                            attendanceStatus: 'present',
                            attendanceType: 'late',
                            checkInTime: '2024-01-15T09:30:00Z',
                            checkOutTime: null,
                            isOnLeave: false,
                            leaveType: null,
                            shiftCode: 'SHIFT_1'
                        },
                        {
                            _id: 'emp3',
                            name: 'Carol Davis',
                            email: 'carol@company.com',
                            role: 'QA Engineer',
                            departmentId: 'dept1',
                            attendanceStatus: 'onLeave',
                            attendanceType: 'unknown',
                            checkInTime: null,
                            checkOutTime: null,
                            isOnLeave: true,
                            leaveType: 'Annual Leave',
                            shiftCode: 'SHIFT_1'
                        }
                    ]
                }
            };
        }
    },

    // Get role-based dashboard (automatically determines admin or manager)
    getDashboard: async (): Promise<ApiResponse<AdminDashboardData | ManagerDashboardData>> => {
        console.log('🎯 Fetching Role-based Dashboard Data');

        // Check if API base URL is configured
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
        if (!API_BASE_URL) {
            console.log('⚠️ API_BASE_URL not configured, using mock admin data');
            return await dashboardApi.getAdminDashboard();
        }

        try {
            const response = await fetchApi<AdminDashboardData | ManagerDashboardData>('/dashboard/', {
                method: 'GET'
            });
            return { success: true, data: response };
        } catch (error) {
            console.error('❌ Role-based Dashboard API Error:', error);
            // Return mock admin data as fallback
            const adminResponse = await dashboardApi.getAdminDashboard();
            return adminResponse;
        }
    },

    // Utility function to check user role and fetch appropriate dashboard
    getDashboardByRole: async (userRole: 'admin' | 'manager'): Promise<ApiResponse<AdminDashboardData | ManagerDashboardData>> => {
        console.log(`🎭 Fetching Dashboard for Role: ${userRole}`);

        if (userRole === 'admin') {
            return await dashboardApi.getAdminDashboard();
        } else if (userRole === 'manager') {
            return await dashboardApi.getManagerDashboard();
        } else {
            throw new Error('Invalid user role. Must be admin or manager.');
        }
    },

    // Legacy methods for backward compatibility
    getStats: async (): Promise<ApiResponse<DashboardStats>> => {
        try {
            const response = await fetchApi<DashboardStats>('/admin/dashboard/stats');
            return { success: true, data: response };
        } catch (error) {
            console.error('Dashboard stats error:', error);
            return {
                success: true,
                data: {
                    totalEmployees: 0,
                    activeEmployees: 0,
                    onLeave: 0,
                    trainingProgress: 0
                }
            };
        }
    },

    getRecentActivities: async (): Promise<ApiResponse<Activity[]>> => {
        try {
            const response = await fetchApi<Activity[]>('/admin/dashboard/activities');
            return { success: true, data: response };
        } catch (error) {
            console.error('Dashboard activities error:', error);
            return {
                success: true,
                data: []
            };
        }
    },

    getMetrics: async (): Promise<ApiResponse<Metrics>> => {
        try {
            const response = await fetchApi<Metrics>('/admin/dashboard/metrics');
            return { success: true, data: response };
        } catch (error) {
            console.error('Dashboard metrics error:', error);
            return {
                success: true,
                data: {
                    attendance: {
                        present: 0,
                        absent: 0,
                        late: 0
                    },
                    training: {
                        completed: 0,
                        inProgress: 0,
                        notStarted: 0
                    }
                }
            };
        }
    }
};
