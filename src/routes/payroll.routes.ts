import { FastifyInstance, FastifyRequest } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { filesUpload } from '../config/multer';
import { getCurrentFinancialYear } from '../utilis/dates';

interface PayrollGenerateRequest {
    monthYear: string; // YYYY-MM
    userIds?: string[];
    filters?: {
        departmentId?: string;
        role?: string;
        status?: string;
        search?: string;
        country?: string;
    };
}


enum PayrollStatus {
    Draft = "Draft",
    PendingApproval = "PendingApproval",
    InPayment = "InPayment",
    Completed = "Completed",
    Failed = "Failed",
    RetryPending = "RetryPending",
    Cancelled = "Cancelled",
    Hold = "Hold"
}
interface PayrollSummaryRequest {
    month: number;
    year: number;
    status?: PayrollStatus[];
    country?: string;
}

interface PayrollRequestBody {
    userIds: string[];
    month: number;
    year: number;
}

interface StatusUpdateRequest {
    id?: string; // Single record ID
    recordIds?: string[]; // Multiple record IDs
    status: PayrollStatus;
    failureReason?: string; // Required for Failed status
    utrNumber?: string; // Required for Completed status
}
export interface DeductionQuery {
    month: string; // e.g., "Jul"
    financialYear?: string; // e.g., "2025-2026"
    department?: string;
    location?: string;
    employeeId?: string;
    exportFormat?: "csv" | "excel" | "json";
}

export const payrollRoutes: RouteHandler = async (fastify: FastifyInstance): Promise<void> => {
    // Generate payroll for all employees
    fastify.post(
        '/generate',
        {
            onRequest: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['monthYear'],
                    properties: {
                        monthYear: {
                            type: 'string',
                            pattern: '^\\d{4}-\\d{2}$',
                            description: 'Month and Year in YYYY-MM format',
                        },
                        userIds: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Optional array of user IDs',
                        },
                        filters: {
                            type: 'object',
                            description: 'Optional filter criteria for bulk payroll generation',
                            properties: {
                                departmentId: { type: 'string' },
                                role: { type: 'string' },
                                status: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Statuses like Active, On Hold, Resigned',
                                },
                                search: { type: 'string' },
                                country: { type: 'string', enum: ['AE', 'IN'] },
                            },
                            additionalProperties: false,
                        },
                    },
                    oneOf: [
                        { required: ['userIds'] },
                        { required: ['filters'] },
                    ],
                },
            },
        },
        async (request: FastifyRequest<{ Body: PayrollGenerateRequest }>, reply) => {
            console.log('in payroll routes');
            try {
                const { monthYear, userIds, filters } = request.body;
                console.log(monthYear, userIds, filters, 'req body');

                const [yearStr, monthStr] = monthYear.split('-');
                const year = Number(yearStr);
                const monthIndex = Number(monthStr) - 1;

                if (year < 2024 || year > 2100 || monthIndex < 0 || monthIndex > 11) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: '❌ Invalid monthYear format or range.' },
                    });
                }

                const monthNames = [
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December',
                ];
                const month = monthNames[monthIndex];

                let finalUserIds: string[];
                if (userIds) {
                    finalUserIds = userIds;
                } else {
                    // Default status to ['Active'] if not provided
                    const finalFilters = {
                        ...filters,
                        status: Array.isArray(filters?.status) && filters.status.length > 0
                            ? filters.status
                            : ['Active'],
                    };

                    finalUserIds = await request.container!.payrollService.getUserIdsByFilters(finalFilters, monthYear);
                }
                console.log(finalUserIds, "finalUserIds")
                if (!finalUserIds || finalUserIds.length === 0) {
                    return reply.status(404).send({
                        success: false,
                        error: { message: 'No employees found for processing payroll.' },
                    });
                }
                console.log(month, year, 'month and year');
                console.log(finalUserIds.length, 'final user ids');
                const result = await request.container!.payrollService.initiatePayroll(month, year, finalUserIds);

                return reply.status(200).send({
                    success: true,
                    data: result,
                });
            } catch (error: any) {
                console.log(error, 'error 1');
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        },
    );


    // Get payroll summary for a specific month and year
    fastify.get(
        '/summary',
        {
            onRequest: [authenticate],
            schema: {
                querystring: {
                    type: 'object',
                    required: ['month', 'year'],
                    properties: {
                        month: { type: 'number', minimum: 1, maximum: 12 },
                        year: { type: 'number', minimum: 2024, maximum: 2100 },
                        status: {
                            type: 'array',
                            items: {
                                type: 'string',
                                enum: ['Draft', 'PendingApproval', 'InPayment',
                                    'Completed', 'Failed', 'RetryPending', 'Cancelled', 'Hold']
                            },
                            description: 'Optional array of payroll statuses to filter by'
                        },
                        country: {
                            type: 'string',
                            enum: ['AE', 'IN'],
                            description: 'Optional country filter for payroll summary'
                        }
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'object',
                                properties: {
                                    totalEmployees: { type: 'number' },
                                    totalGrossSalary: { type: 'number' },
                                    totalDeductions: { type: 'number' },
                                    totalNetSalary: { type: 'number' },
                                    totalPresentDays: { type: 'number' },
                                    totalLOPDays: { type: 'number' },
                                    totalPayableDays: { type: 'number' },
                                    statusBreakdown: {
                                        type: 'object',
                                        properties: {
                                            Draft: { type: 'number' },
                                            PendingApproval: { type: 'number' },
                                            InPayment: { type: 'number' },
                                            Completed: { type: 'number' },
                                            Failed: { type: 'number' },
                                            RetryPending: { type: 'number' },
                                            Cancelled: { type: 'number' },
                                            Hold: { type: 'number' }
                                        }
                                    },
                                    failedRecords: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                employeeId: { type: 'string' },
                                                failureReason: { type: 'string' },
                                                retryCount: { type: 'number' }
                                            }
                                        }
                                    },
                                    exportableDetails: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                _id: { type: 'string' },
                                                employeeId: { type: 'string' },
                                                employeeName: { type: 'string' },
                                                bankAccountNumber: { type: 'string' },
                                                ifscCode: { type: 'string' },
                                                bankName: { type: 'string' },
                                                netSalary: { type: 'number' },
                                                monthlyGross: { type: 'number' },
                                                presentDays: { type: 'number' },
                                                totalDaysInMonth: { type: 'number' },
                                                lopDays: { type: 'number' },
                                                payableDays: { type: 'number' },
                                                overtimeHours: { type: 'number' },
                                                overtimePay: { type: 'number' },
                                                status: { type: 'string' },
                                                type: { type: 'string', enum: ['Regular', 'FinalSettlement'] },
                                                customReimbursements: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        properties: {
                                                            name: { type: 'string' },
                                                            value: { type: 'number' }
                                                        }
                                                    }
                                                },
                                                customDeductions: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        properties: {
                                                            name: { type: 'string' },
                                                            value: { type: 'number' }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
        },
        async (request: FastifyRequest<{ Querystring: PayrollSummaryRequest }>, reply) => {
            try {
                const { month, year, status, country } = request.query;
                console.log(month, year, 'req query');
                if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'Invalid monthYear format. Use YYYY-MM.' },
                    });
                }

                if (status && status.some(s => !Object.values(PayrollStatus).includes(s))) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: `Invalid status value. Must be one of: ${Object.values(PayrollStatus).join(', ')}` }
                    });
                }
                const result = await request.container!.payrollService.getPayrollSummary(month, year, status, country);
                console.log(result, 'result');
                return reply.send({
                    success: true,
                    data: result,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        },
    );
    // Get payroll records for specific users by month and year
    fastify.post('/by-users',
        {
            onRequest: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['userIds', 'month', 'year'],
                    properties: {
                        userIds: {
                            type: 'array',
                            items: { type: 'string' },
                            minItems: 1,
                            description: 'Array of user IDs to fetch payroll records for',
                        },
                        month: {
                            type: 'number',
                            minimum: 1,
                            maximum: 12,
                            description: 'Month for which payroll records are requested (1-12)',
                        },
                        year: {
                            type: 'number',
                            minimum: 2000,
                            maximum: 2100,
                            description: 'Year for which payroll records are requested (2000-2100)',
                        },
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        _id: { type: 'string' }, // payroll record ID
                                        employeeId: { type: 'string' },
                                        status: {
                                            type: 'string',
                                            enum: [
                                                'Draft',
                                                'PendingApproval',
                                                'Processing',
                                                'Processed',
                                                'InPayment',
                                                'Completed',
                                                'Failed',
                                                'RetryPending',
                                                'Cancelled',
                                                'Hold'
                                            ]
                                        },
                                        paymentConfirmedAt: { type: 'string', format: 'date-time', description: 'Timestamp when payment was confirmed' },
                                        type: { type: 'string', enum: ['Regular', 'FinalSettlement'] },
                                    },
                                    required: ['_id', 'employeeId', 'status']
                                },
                            },
                        },
                    },
                    400: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean', default: false },
                            message: { type: 'string' },
                        },
                    },
                },
            }
        },
        async (request, reply) => {
            console.log("inside /by-users route", request.body);
            const { userIds, month, year } = request.body as PayrollRequestBody;
            console.log(typeof month, typeof year, 'month and year types');
            const isUserIdsInvalid = !Array.isArray(userIds) || userIds.length === 0 || !userIds.every(id => typeof id === 'string');
            const isMonthInvalid = typeof month !== 'number' || month < 1 || month > 12;
            const isYearInvalid = typeof year !== 'number' || year < 2000 || year > 2100;

            console.log({ isUserIdsInvalid, isMonthInvalid, isYearInvalid });
            if (isUserIdsInvalid || isMonthInvalid || isYearInvalid) {
                return {
                    success: false,
                    message: 'Invalid request body: userIds (non-empty array of strings), month (1–12), and year (2000–2100) are required.'
                };
            }

            try {
                const data = await request.container!.payrollService.getPayrollRecordsForUsers(userIds, month, year);
                return reply.send({ success: true, data });
            } catch (error: any) {
                return reply.status(400).send({ success: false, error: error.message });
            }
        }
    );

    //Update payroll status
    fastify.post(
        '/status-update',
        {
            onRequest: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['status'],
                    properties: {
                        id: { type: 'string', description: 'Single payroll record ID' },
                        recordIds: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Array of payroll record IDs'
                        },
                        status: {
                            type: 'string',
                            enum: [
                                'Draft',
                                'PendingApproval',
                                'InPayment',
                                'Completed',
                                'Failed',
                                'RetryPending',
                                'Cancelled',
                                'Hold'
                            ]
                        },
                        failureReason: { type: 'string', description: 'Reason for failure (required for Failed status)' },
                        utrNumber: { type: 'string', description: 'UTR number (required for Completed status)' }
                    },
                    oneOf: [
                        { required: ['id'] },
                        { required: ['recordIds'] }
                    ]
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'object',
                                properties: {
                                    updatedCount: { type: 'number' },
                                    failedRecords: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'string' },
                                                reason: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { id, recordIds, status, failureReason, utrNumber } = request.body as StatusUpdateRequest;
                const user = request.user;
                console.log(request, "request object in status update route");
                console.log(request.user)
                // Validate user
                // if (!user || !user._id) {
                //     return reply.status(401).send({
                //         success: false,
                //         error: { message: 'Authentication required. Invalid or missing user information.' },
                //     });
                // }
                // Validate status
                if (!Object.values(PayrollStatus).includes(status)) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: `Invalid status. Must be one of: ${Object.values(PayrollStatus).join(', ')}` }
                    });
                }
                // Validate id or recordIds
                if ((id && recordIds) || (!id && !recordIds)) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'Provide either id or recordIds, not both or neither.' }
                    });
                }

                const result = await request.container!.payrollService.updatePayrollStatus({
                    id,
                    recordIds,
                    status,
                    userId: user._id.toString(),
                    failureReason,
                    utrNumber
                });

                return reply.send({
                    success: true,
                    data: result
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );
    //Payment status update import route
    fastify.post(
        '/import-payments',
        {
            onRequest: [authenticate, filesUpload],
            schema: {
                consumes: ['multipart/form-data'],

                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        payrollId: { type: 'string' },
                                        employeeName: { type: 'string' },
                                        status: { type: 'string', enum: ['Completed', 'Failed'] },
                                        utrNumber: { type: 'string' },
                                        failureReason: { type: 'string' },
                                        errors: { type: 'array', items: { type: 'string' } }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                console.log('Request files:', request.files);
                const userId = request.user._id;
                // Use Fastify's multipart API to get the uploaded file
                const files: any = request.files;
                if (!files || !files[0]) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'No file uploaded.' },
                    });
                }
                const result = await request.container!.payrollService.importPayrollPayments(files[0], userId.toString());
                return reply.send({
                    success: true,
                    data: result
                });
            } catch (error: any) {
                console.error('Error in import-payments route:', error);
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message || 'Failed to process Excel file' }
                });
            }
        }

    );
    //status update confirmation from excel to json 
    fastify.post(
        '/status-update-excel',
        {
            onRequest: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['records'],
                    properties: {
                        records: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['id', 'status'],
                                properties: {
                                    id: { type: 'string' },
                                    status: {
                                        type: 'string',
                                        enum: ['Draft', 'PendingApproval', 'InPayment', 'Completed', 'Failed', 'RetryPending', 'Cancelled', 'Hold']
                                    },
                                    utrNumber: { type: 'string' },
                                    failureReason: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'object',
                                properties: {
                                    updatedCount: { type: 'number' },
                                    failedRecords: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'string' },
                                                reason: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request: FastifyRequest<{ Body: { records: { id: string; status: string; utrNumber?: string; failureReason?: string }[] } }>, reply) => {
            try {
                const { records } = request.body;
                const user = request.user;

                if (!Array.isArray(records) || records.length === 0) {
                    return reply.status(400).send({ success: false, error: { message: 'No records provided.' } });
                }

                const mappedRecords = records.map(record => ({
                    ...record,
                    status: PayrollStatus[record.status as keyof typeof PayrollStatus]
                }));
                console.log(records, "records in update-status-excel route");
                console.log(mappedRecords, "mappedRecords in update-status-excel route");
                const result = await request.container!.payrollService.batchUpdatePayrollStatus({
                    records: mappedRecords,
                    userId: user._id.toString()
                });
                return reply.send({
                    success: true,
                    data: result
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    )

    fastify.get(
        '/salary-statement',
        {
            onRequest: [authenticate],
            schema: {
                querystring: {
                    type: 'object',
                    required: ['month', 'year'],
                    properties: {
                        month: { type: 'number', minimum: 1, maximum: 12 },
                        year: { type: 'number', minimum: 2024, maximum: 2100 },
                        preview: { type: 'boolean', default: false, description: 'If true, generates statement without run payroll data' }
                    },
                },
            },
        },
        async (request: FastifyRequest<{ Querystring: { month: number; year: number; preview?: boolean; country?: string } }>, reply) => {
            try {
                const { month, year, preview, country } = request.query;
                // const workbook = await request.container!.payrollService.generateSalaryStatement(month, year);
                const workbook = await request.container!.salaryStatementService.generateSalaryStatement(Number(month), Number(year), preview, country);

                const buffer = await workbook.xlsx.writeBuffer();

                const monthNames = [
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                ];
                const fileName = `Salary_Statement_${monthNames[month - 1]}_${year}.xlsx`;

                reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                reply.header('Content-Disposition', `attachment; filename=${fileName}`);
                return reply.send(buffer);
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );

    fastify.get('/deduction-summary', async (request, reply) => {
        try {
            const query = request.query as DeductionQuery;
            const result = await request.container!.payrollService.getDeductions(query);

            console.log(result, 'result in deduction summary');

            if (query.exportFormat === 'csv') {
                reply.header('Content-Type', 'text/csv');
                reply.header('Content-Disposition', `attachment; filename=deductions_${query.month}_${query.financialYear || getCurrentFinancialYear()}.csv`);
                return result;
            } else if (query.exportFormat === 'excel') {
                reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                reply.header('Content-Disposition', `attachment; filename=deductions_${query.month}_${query.financialYear || getCurrentFinancialYear()}.xlsx`);
                return result;
            } else {
                return reply.send({
                    success: true,
                    data: result,
                });
            }
        } catch (error: any) {
            return reply.status(400).send({
                success: false,
                message: error.message,
            });
        }


    });


    fastify.delete(
        '/delete',
        {
            onRequest: [authenticate],
            schema: {
                querystring: {
                    type: 'object',
                    required: ['month', 'year'],
                    properties: {
                        month: { type: 'number', minimum: 1, maximum: 12 },
                        year: { type: 'number', minimum: 2000, maximum: 2100 },
                        country: { type: 'string', enum: ['AE', 'IN'] },
                    },
                },
            },
        },
        async (request, reply) => {
            try {

                let { month, year, country } = request.query as { month: number; year: number; country?: string };
                console.log(month, year, 'req query');
                if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'Invalid monthYear format. Use YYYY-MM.' },
                    });
                }
                const result: any = await request.container!.payrollService.deletePayroll(month, year, country);
                if (!result) {
                    return reply.status(404).send({
                        success: false,
                        error: { message: 'No payroll records found for the specified month and year.' },
                    });
                }
                console.log(result, 'result');

                return reply.send({
                    success: true,
                    data: result,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );

    // Delete single payroll record
    fastify.delete(
        '/record/:id',
        {
            onRequest: [authenticate],
            schema: {
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'string' }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { id } = request.params as { id: string };
                // Call deletePayrollRecord which ensures status is 'Draft'
                const result = await request.container!.payrollService.deletePayrollRecord(id);
                return reply.send({
                    success: true,
                    data: result
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    // Update custom components for a draft payroll record
    fastify.put(
        '/record/:id/custom-components',
        {
            onRequest: [authenticate],
            schema: {
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'string' }
                    }
                },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        customReimbursements: {
                            type: 'array',
                            maxItems: 25,
                            items: {
                                type: 'object',
                                required: ['name', 'value'],
                                additionalProperties: false,
                                properties: {
                                    name: { type: 'string', minLength: 1, maxLength: 100 },
                                    value: { type: 'number', minimum: 0, maximum: 1000000 }
                                }
                            }
                        },
                        customDeductions: {
                            type: 'array',
                            maxItems: 25,
                            items: {
                                type: 'object',
                                required: ['name', 'value'],
                                additionalProperties: false,
                                properties: {
                                    name: { type: 'string', minLength: 1, maxLength: 100 },
                                    value: { type: 'number', minimum: 0, maximum: 1000000 }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { id } = request.params as { id: string };
                const { customReimbursements, customDeductions } = request.body as any;
                
                const result = await request.container!.payrollService.updateCustomComponents(id, customReimbursements, customDeductions);
                
                return reply.send({
                    success: true,
                    data: result
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    fastify.put(
        '/records/custom-components',
        {
            onRequest: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['payrollIds'],
                    additionalProperties: false,
                    properties: {
                        payrollIds: {
                            type: 'array',
                            minItems: 1,
                            items: { type: 'string' }
                        },
                        customReimbursements: {
                            type: 'array',
                            maxItems: 25,
                            items: {
                                type: 'object',
                                required: ['name', 'value'],
                                additionalProperties: false,
                                properties: {
                                    name: { type: 'string', minLength: 1, maxLength: 100 },
                                    value: { type: 'number', minimum: 0, maximum: 1000000 }
                                }
                            }
                        },
                        customDeductions: {
                            type: 'array',
                            maxItems: 25,
                            items: {
                                type: 'object',
                                required: ['name', 'value'],
                                additionalProperties: false,
                                properties: {
                                    name: { type: 'string', minLength: 1, maxLength: 100 },
                                    value: { type: 'number', minimum: 0, maximum: 1000000 }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const { payrollIds, customReimbursements, customDeductions } = request.body as any;

                const result = await request.container!.payrollService.updateCustomComponentsBulk(
                    payrollIds,
                    customReimbursements,
                    customDeductions
                );

                return reply.send({
                    success: true,
                    data: result
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    /*
        fastify.put(
            '/approval/status',
            {
                onRequest: [authenticate],
                schema: {
                    body: {
                        type: 'object',
                        properties: {
                            status: {
                                type: 'string',
                                enum: ['Processing', 'Cancelled', 'Pending Approval'],
                            },
                        },
                        required: ['status'],
                    },
                },
            },
    
            async (request: FastifyRequest<{ Querystring: PayrollApprovalSummaryRequest }>, reply) => {
                try {
                    const { month, year } = request.query;
                    const { status } = request.body as {
                        status: 'Processing' | 'Cancelled' | 'Pending Approval';
                    };
                    console.log(request.body, 'reqBody');
                    console.log(month, year, 'req query');
                    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
                        return reply.status(400).send({
                            success: false,
                            error: { message: 'Invalid monthYear format. Use YYYY-MM.' },
                        });
                    }
                    const result = await payrollService.processPayrollStatus(month, year, status);
                    // const result = true;
                    console.log(result, 'result');
                    return reply.send({
                        success: true,
                        data: result,
                    });
                } catch (error: any) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: error.message },
                    });
                }
            },
        );
    
        // Get overall status
        fastify.get(
            '/status',
            {
                onRequest: [authenticate],
            },
            async (request: FastifyRequest<{ Querystring: PayrollApprovalSummaryRequest }>, reply) => {
                try {
                    const { month, year } = request.query;
                    console.log(month, year, 'req query');
                    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
                        return reply.status(400).send({
                            success: false,
                            error: { message: 'Invalid monthYear format. Use YYYY-MM.' },
                        });
                    }
                    const result = await payrollStatusService.getPayrollStatus(month, year);
                    console.log(result, 'result');
                    return reply.send({
                        success: true,
                        data: result,
                    });
                } catch (error: any) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: error.message },
                    });
                }
            },
        );
        // Check if initiation is possible
        fastify.get(
            '/can-initiate',
            {
                onRequest: [authenticate],
                schema: {
                    querystring: {
                        type: 'object',
                        required: ['month', 'year'],
                        properties: {
                            month: { type: 'number', minimum: 1, maximum: 12 },
                            year: { type: 'number', minimum: 2024, maximum: 2100 },
                        },
                    },
                },
            },
            async (request: FastifyRequest<{ Querystring: PayrollApprovalSummaryRequest }>, reply) => {
                try {
                    const { month, year } = request.query;
                    console.log(month, year, 'req query');
                    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
                        return reply.status(400).send({
                            success: false,
                            error: { message: 'Invalid monthYear format. Use YYYY-MM.' },
                        });
                    }
                    const result = await payrollStatusService.canInitiatePayroll(month, year);
                    console.log(result, 'result');
                    return reply.send({
                        success: true,
                        data: result,
                    });
                } catch (error: any) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: error.message },
                    });
                }
            },
        );
        // Check if approval is possible
        fastify.get(
            '/can-approve',
            {
                onRequest: [authenticate],
                schema: {
                    querystring: {
                        type: 'object',
                        required: ['month', 'year'],
                        properties: {
                            month: { type: 'number', minimum: 1, maximum: 12 },
                            year: { type: 'number', minimum: 2024, maximum: 2100 },
                        },
                    },
                },
            },
            async (request: FastifyRequest<{ Querystring: PayrollApprovalSummaryRequest }>, reply) => {
                try {
                    const { month, year } = request.query;
                    console.log(month, year, 'req query');
                    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
                        return reply.status(400).send({
                            success: false,
                            error: { message: 'Invalid monthYear format. Use YYYY-MM.' },
                        });
                    }
                    const result = await payrollStatusService.canApprovePayroll(month, year);
                    console.log(result, 'result');
                    return reply.send({
                        success: true,
                        data: result,
                    });
                } catch (error: any) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: error.message },
                    });
                }
            },
        );
    
       
            */
}

/* // Retrieve payroll approval data
   fastify.get(
       '/approval-summary',
       {
           onRequest: [authenticate],
           schema: {
               tags: ['Payroll Management'],
               summary: 'Fetch payroll approval summary',
               description: 'Retrieve payroll summary and exportable details for the given month and year',
               querystring: {
                   type: 'object',
                   required: ['monthYear'],
                   properties: {
                       monthYear: {
                           type: 'string',
                           pattern: '^\\d{4}-\\d{2}$',
                           description: 'Month and Year in YYYY-MM format'
                       }
                   }
               },
               response: {
                   200: {
                       type: 'object',
                       properties: {
                           success: { type: 'boolean' },
                           data: {
                               type: 'object',
                               properties: {
                                   totalEmployees: { type: 'number' },
                                   totalGrossSalary: { type: 'number' },
                                   totalDeductions: { type: 'number' },
                                   totalNetSalary: { type: 'number' },
                                   exportableDetails: {
                                       type: 'array',
                                       items: {
                                           type: 'object',
                                           properties: {
                                               employeeId: { type: 'string' },
                                               employeeName: { type: 'string' },
                                               bankAccountNumber: { type: 'string' },
                                               ifscCode: { type: 'string' },
                                               netSalary: { type: 'number' },
                                               overtimeHours: { type: 'number' },
                                               overtimePay: { type: 'number' }
                                           }
                                       }
                                   }
                               }
                           }
                       }
                   },
                   400: {
                       type: 'object',
                       properties: {
                           success: { type: 'boolean', default: false },
                           error: {
                               type: 'object',
                               properties: {
                                   message: { type: 'string' }
                               }
                           }
                       }
                   }
               }
           }
       },
       async (request: FastifyRequest<{ Querystring: PayrollApprovalSummaryRequest }>, reply) => {
           console.log("/approval-summary", request.query)
           try {
 
               const { month, year } = request.query;
 
               if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
                   return reply.status(400).send({
                       success: false,
                       error: { message: 'Invalid monthYear format. Use YYYY-MM.' }
                   });
               }
 
               const result = await payrollService.getPayrollApprovalSummary(month, year);
               console.log(result, "result")
               return reply.send({
                   success: true,
                   data: result
               });
           } catch (error: any) {
               return reply.status(400).send({
                   success: false,
                   error: { message: error.message }
               });
           }
       }
   );*/


/*
    // Generate individual payslip
    fastify.post(
        '/generatePayslip',
        {
            onRequest: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['payrollId'],
                    properties: {
                        payrollId: { type: 'string' }
                    }
                }
            }
        },
        async (request: FastifyRequest<{ Body: PayslipGenerateRequest }>, reply) => {
            try {
                const { payrollId } = request.body;

                const result = await payrollService.generatePayslips(payrollId);

                return reply.status(200).send({
                    success: true,
                    data: result
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    // Get payroll list
    fastify.get(
        '/list',
        {
            onRequest: [authenticate]
        },
        async (request, reply) => {
            try {
                console.log(request)
                // Implement pagination, filtering, etc.
                const payrolls = await payrollService.findPayroll()

                return reply.status(200).send({
                    success: true,
                    data: payrolls
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    */
