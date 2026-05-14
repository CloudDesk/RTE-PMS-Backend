import { Types } from "mongoose";
import { Payroll } from "../models";

export enum PayrollStatus {
    Draft = "Draft",
    PendingApproval = "PendingApproval",
    InPayment = "InPayment",
    Completed = "Completed",
    Failed = "Failed",
    RetryPending = "RetryPending",
    Cancelled = "Cancelled",
    Hold = "Hold" // ⭐ NEW: Payroll on hold (not paid yet)
}

interface PayrollRecord {
    employeeId: Types.ObjectId;
    salaryAssignmentId: Types.ObjectId;
    monthlyGross: number;
    attendanceAdjustGross: number;
    totalDaysInMonth: number;
    payableDays: number;
    basic: number;
    hra: number;
    da: number;
    otherAllowance: number;
    epfEmployee: number;
    epfEmployer: number;
    esiEmployee: number;
    esiEmployer: number;
    professionalTax: number;
    incomeTax: number;
    totalDeductions: number;
    overtimeHours: number;
    overtimePay: number;
    leaveDeductions: number;
    reimbursement: number;
    bonus: number;
    netSalary: number;
    ctc: number;
    monthYear: string;
    month: number;
    year: number;
    processedAt: Date;
    status: PayrollStatus;
    failureReason?: string;
    retryCount?: number;
    statusHistory?: Array<{ status: string; timestamp: Date; reason?: string }>;
}

export class PayrollStatusManager {
    private static stateTransitions: Record<PayrollStatus, PayrollStatus[]> = {
        [PayrollStatus.Draft]: [PayrollStatus.PendingApproval, PayrollStatus.Cancelled],
        [PayrollStatus.PendingApproval]: [PayrollStatus.InPayment, PayrollStatus.Cancelled],
        [PayrollStatus.InPayment]: [PayrollStatus.Completed, PayrollStatus.Failed],
        [PayrollStatus.Completed]: [], // No further transitions allowed
        [PayrollStatus.Failed]: [PayrollStatus.RetryPending, PayrollStatus.Cancelled],
        [PayrollStatus.RetryPending]: [PayrollStatus.InPayment, PayrollStatus.Cancelled],
        [PayrollStatus.Cancelled]: [PayrollStatus.Draft], // Allow restoring to Draft
        [PayrollStatus.Hold]: [PayrollStatus.Draft, PayrollStatus.PendingApproval, PayrollStatus.InPayment, PayrollStatus.Completed]
    };


    static canTransition(currentStatus: PayrollStatus, newStatus: PayrollStatus): boolean {
        return this.stateTransitions[currentStatus]?.includes(newStatus) || false;
    }

    static determineOverallStatus(statuses: PayrollStatus[]): PayrollStatus {
        const statusPriority = [
            PayrollStatus.Failed,
            PayrollStatus.RetryPending,
            PayrollStatus.InPayment,
            PayrollStatus.PendingApproval,
            PayrollStatus.Draft,
            PayrollStatus.Completed,
            PayrollStatus.Cancelled
        ];

        for (const priorityStatus of statusPriority) {
            if (statuses.includes(priorityStatus)) {
                return priorityStatus;
            }
        }

        return PayrollStatus.Draft;
    }

    static validateStatusUpdate(
        currentRecords: PayrollRecord[],
        newStatus: PayrollStatus
    ): { isValid: boolean; message: string } {
        const invalidTransitions = currentRecords.filter(
            record => !this.canTransition(record.status as PayrollStatus, newStatus)
        );

        if (invalidTransitions.length > 0) {
            return {
                isValid: false,
                message: `Cannot update status. Some records are in incompatible states: ${invalidTransitions.map(r => r.status).join(', ')}`
            };
        }

        // Additional validation for RetryPending
        if (newStatus === PayrollStatus.RetryPending) {
            const maxRetries = 3;
            const retryIssues = currentRecords.filter(
                record => (record.retryCount || 0) >= maxRetries
            );
            if (retryIssues.length > 0) {
                return {
                    isValid: false,
                    message: `Cannot move to RetryPending. Some records have exceeded max retry attempts: ${retryIssues.map(r => r.employeeId).join(', ')}`
                };
            }
        }

        return {
            isValid: true,
            message: 'Status can be updated'
        };
    }
}

class PayrollStatusService {
    async getPayrollStatus(month: number, year: number): Promise<{
        overallStatus: PayrollStatus;
        statusBreakdown: Record<PayrollStatus, number>;
        totalRecords: number;
        details?: any;
    }> {
        const payrollRecords: any = await Payroll.find({ month, year });

        if (!payrollRecords.length) {
            return {
                overallStatus: PayrollStatus.Draft,
                statusBreakdown: {
                    [PayrollStatus.Draft]: 0,
                    [PayrollStatus.PendingApproval]: 0,
                    [PayrollStatus.InPayment]: 0,
                    [PayrollStatus.Completed]: 0,
                    [PayrollStatus.Failed]: 0,
                    [PayrollStatus.RetryPending]: 0,
                    [PayrollStatus.Cancelled]: 0,
                    [PayrollStatus.Hold]: 0
                },
                totalRecords: 0
            };
        }

        const statusBreakdown = payrollRecords.reduce((acc: any, record: any) => {
            acc[record.status] = (acc[record.status] || 0) + 1;
            return acc;
        }, {
            [PayrollStatus.Draft]: 0,
            [PayrollStatus.PendingApproval]: 0,
            [PayrollStatus.InPayment]: 0,
            [PayrollStatus.Completed]: 0,
            [PayrollStatus.Failed]: 0,
            [PayrollStatus.RetryPending]: 0,
            [PayrollStatus.Cancelled]: 0,
            [PayrollStatus.Hold]: 0
        });

        const statuses = payrollRecords.map((record: any) => record.status);
        const overallStatus = PayrollStatusManager.determineOverallStatus(statuses);

        return {
            overallStatus,
            statusBreakdown,
            totalRecords: payrollRecords.length,
            details: {
                recordStatuses: statuses
            }
        };
    }

    async canInitiatePayroll(month: number, year: number): Promise<{
        canInitiate: boolean;
        reason?: string;
    }> {
        const existingPayroll = await Payroll.findOne({
            month,
            year,
            status: {
                $nin: [PayrollStatus.Draft, PayrollStatus.Cancelled, PayrollStatus.Failed, PayrollStatus.RetryPending]
            }
        });

        if (existingPayroll) {
            return {
                canInitiate: false,
                reason: `Payroll for ${month}/${year} is already in ${existingPayroll.status} status`
            };
        }

        return {
            canInitiate: true
        };
    }

    async canApprovePayroll(month: number, year: number): Promise<{
        canApprove: boolean;
        reason?: string;
    }> {
        const payrollRecords = await Payroll.find({ month, year });

        if (!payrollRecords.length) {
            return {
                canApprove: false,
                reason: 'No payroll records found for the specified month and year'
            };
        }

        const invalidRecords = payrollRecords.filter(
            record => record.status !== PayrollStatus.Draft
        );

        if (invalidRecords.length > 0) {
            return {
                canApprove: false,
                reason: `Cannot approve. Some records are not in Draft status: ${invalidRecords.map(r => r.status).join(', ')}`
            };
        }

        const incompleteRecords = payrollRecords.filter(
            record => !this.isPayrollRecordComplete(record)
        );

        if (incompleteRecords.length > 0) {
            return {
                canApprove: false,
                reason: 'Some payroll records are incomplete'
            };
        }

        return {
            canApprove: true
        };
    }

    private isPayrollRecordComplete(record: any): boolean {
        return !!(
            record.netSalary &&
            record.totalDeductions !== undefined &&
            record.employeeId &&
            record.salaryAssignmentId &&
            record.monthlyGross &&
            record.ctc
        );
    }
}

export const payrollStatusService = new PayrollStatusService();