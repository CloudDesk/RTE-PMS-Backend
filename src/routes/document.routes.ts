import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authenticate } from "../middleware/auth";
import { filesUpload, zipFileUpload } from "../config/multer";
import unzipper from "unzipper";
import { User, IUser } from "../models/user.model";
import path from "path";
import { parseMultipartForm, saveMultipartFile } from "../utilis/parseMultiPartForm";
import { Document } from "../models/document.model";
import { Types } from "mongoose";

export interface IForm12BSubmission {
    employeeId: string;
    financialYear: string;
    previousEmployer: {
        name: string;
        pan: string;
        tan: string;
    };
    employmentPeriod: {
        startDate: string | Date;
        endDate: string | Date;
    };
    salaryEarned: number;
    tdsDeducted: number;
    taxDeclarationId: string;
}

export interface IForm12BBGenerate {
    employeeId: string;
    financialYear: string;
    taxDeclarationId: string;

}


export interface IDocumentQuery {
    access?: 'own' | 'team' | 'global';
    employeeId?: string;
    type?: 'Payslip' | 'TimesheetFile' | 'Form16' | 'Form12B' | 'Form12BB' | 'OfferLetter' | 'HikeLetter' | 'Certificate' | 'AdminUpload' | 'AttendanceFile' | 'TaxProof'
    category?: 'Payroll' | 'Timesheet' | 'Tax' | 'EmployeeLifecycle' | 'Certification' | 'Attendance';
    year?: number;
    month?: number;
    financialYear?: string;
    page?: number;
    limit?: number;
    // Employee filters for managers/admins
    department?: string;
    role?: 'admin' | 'manager' | 'staff';
    activeStatus?: boolean;
    search?: string; // Combined search for name or email
    designation?: string;
    location?: string;
    _id?: string;
}

// Define response type
interface IApiResponse<T> {
    success: boolean;
    data?: T;
    meta?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    error?: { message: string };
    message?: string;
}
interface ITimesheetGenerate {
    userId: string;
    month: number;
    year: number;
}
interface PayslipGenerateRequest {
    monthYear: string; // YYYY-MM
    userIds?: string[];
    filters?: {
        departmentId?: string;
        role?: string;
        status?: string;
        search?: string;
    };
}
interface GetPayslipRequest {
    month?: number;
    year?: number;
    userId: string;
}
interface getPayslipRequestBody {
    userIds: string[],
    month: number,
    year: number
}
interface IPreviewStatusRequest {
    Params: { id: string };
    Body: { isPreviewEnabled: boolean };
}

type GovernmentIdKey = 'pan' | 'aadhaar' | 'passport' | 'voterId' | 'drivingLicense' | 'pf';

function mapIdTypeToGovernmentIdKey(idType?: string): GovernmentIdKey | null {
    switch (idType) {
        case 'PAN':
            return 'pan';
        case 'Aadhaar':
            return 'aadhaar';
        case 'Passport':
            return 'passport';
        case 'VoterID':
            return 'voterId';
        case 'DriverLicense':
            return 'drivingLicense';
        case 'PF':
            return 'pf';
        default:
            return null;
    }
}

export const documentRoutes = async (
    fastify: FastifyInstance
): Promise<void> => {

    //generate timesheet
    fastify.post("/timesheet/generate",
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['userId', 'month', 'year'],
                    properties: {
                        userId: { type: 'string' },
                        month: { type: 'number', minimum: 1, maximum: 12 },
                        year: { type: 'number', minimum: 2000, maximum: 2100 },
                    },
                },
                response: {
                    200: {
                        type: 'object',
                        required: ['success', 'data'],
                        properties: {
                            success: { type: 'boolean', const: true },
                            data: {
                                type: 'object',
                                required: ['documentId', 'filePath'],
                                properties: {
                                    documentId: { type: 'string' },
                                    filePath: { type: 'string', format: 'uri' }
                                }
                            }
                        }
                    },
                    400: {
                        type: 'object',
                        required: ['success', 'error'],
                        properties: {
                            success: { type: 'boolean', const: false },
                            error: {
                                type: 'object',
                                required: ['message'],
                                properties: {
                                    message: { type: 'string' }
                                }
                            }
                        }
                    }
                }

            },
        },
        async (request, reply) => {
            try {
                const { userId, month, year } = request.body as ITimesheetGenerate;
                const timesheet = await request.container!.documentService.generateTimesheet(userId, month, year, request);
                console.log(timesheet, "timesheetRoutes timesheet");
                return reply.send({
                    success: true,
                    data: timesheet,
                });
            } catch (error) {
                return reply.status(400).send({
                    success: false,
                    error: { message: (error as Error).message },
                } as IApiResponse<never>);
            }
        }
    )

    // Generate payslip
    fastify.post("/payslip/generate",
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
                            description: 'Optional filter criteria for bulk payslip generation',
                            properties: {
                                departmentId: { type: 'string' },
                                role: { type: 'string' },
                                status: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Statuses like Active, On Hold, Resigned',
                                },
                                search: { type: 'string' },
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
        async (request, reply) => {
            try {
                // Ensure container is available
                if (!request.container) {
                    return reply.status(500).send({
                        success: false,
                        error: { message: 'Service container not available.' },
                    });
                }

                const { monthYear, userIds, filters } = request.body as PayslipGenerateRequest;
                const [yearStr, monthStr] = monthYear.split('-');
                const year = Number(yearStr);
                const month = Number(monthStr);

                if (year < 2024 || year > 2100 || month < 1 || month > 12) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: '❌ Invalid monthYear format or range.' },
                    });
                }
                let finalUserIds: string[];
                if (userIds) {
                    finalUserIds = userIds;
                } else {
                    const finalFilters = {
                        ...filters,
                        status: Array.isArray(filters?.status) && filters.status.length > 0
                            ? filters.status
                            : ['Active'],
                    };
                    finalUserIds = await request.container!.payrollService.getUserIdsByFilters(finalFilters, monthYear, 'onlyCompleted');
                }
                console.log(finalUserIds, "finalUserIds")
                if (!finalUserIds || finalUserIds.length === 0) {
                    return reply.status(404).send({
                        success: false,
                        error: { message: 'No employees found for processing payslips.' },
                    });
                }
                const salary = await request.container!.payslipPdfService.generatePayslip(
                    month,
                    year,
                    finalUserIds
                );
                // const salary = await request.container!.documentService.generatePayslip(
                //     month,
                //     year,
                //     finalUserIds
                // );

                return reply.send({
                    success: true,
                    data: salary,
                });
            } catch (error: any) {
                console.error('Payslip generation error:', error);
                return reply.status(500).send({
                    success: false,
                    error: { message: error.message || 'Failed to generate payslips.' },
                });
            }
        }
    )

    //My payslips
    fastify.get(
        '/my/payslips',
        {
            // onRequest: [authenticate],
            schema: {
                querystring: {
                    type: 'object',
                    properties: {
                        month: { type: 'number', minimum: 1, maximum: 12 },
                        year: { type: 'number', minimum: 2000, maximum: 2100 },
                        userId: { type: 'string' },
                    },
                    required: ['userId'],
                },
            },
        },
        async (request, reply) => {
            try {
                const { month, year, userId } = request.query as GetPayslipRequest;
                const safeMonth = typeof month === 'number' ? month : new Date().getMonth() + 1;
                const safeYear = typeof year === 'number' ? year : new Date().getFullYear();
                const ids = typeof userId === 'object' ? userId : [userId]
                const result = await request.container!.documentService.getPayslipDocumentsForUsers(ids, safeMonth, safeYear);
                console.log(result, "result my payslip")
                return reply.send({
                    success: true,
                    data: result,
                } as IApiResponse<any>);
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                } as IApiResponse<never>);
            }
        }
    );

    // Send payslips via email
    fastify.post(
        '/payslip/send',
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
                        },
                        userIds: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                        filters: {
                            type: 'object',
                            properties: {
                                departmentId: { type: 'string' },
                                role: { type: 'string' },
                                status: {
                                    type: 'array',
                                    items: { type: 'string' },
                                },
                                search: { type: 'string' },
                            },
                            additionalProperties: false,
                        },
                    },
                    oneOf: [{ required: ['userIds'] }, { required: ['filters'] }],
                },
            },
        },
        async (request, reply) => {
            try {
                const { monthYear, userIds, filters } = request.body as PayslipGenerateRequest;
                const [yearStr, monthStr] = monthYear.split('-');
                const year = Number(yearStr);
                const month = Number(monthStr);

                if (year < 2024 || year > 2100 || month < 1 || month > 12) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'Invalid monthYear format or range.' },
                    } as IApiResponse<never>);
                }
                console.log(month, year, userIds, "userIds req")
                let finalUserIds: string[];
                if (userIds) {
                    finalUserIds = userIds;
                } else {
                    const finalFilters = {
                        ...filters,
                        status: Array.isArray(filters?.status) && filters.status.length > 0 ? filters.status : ['Active'],
                    };
                    finalUserIds = await request.container!.payrollService.getUserIdsByFilters(finalFilters, monthYear, 'onlyCompleted');
                }

                if (!finalUserIds.length) {
                    return reply.status(404).send({
                        success: false,
                        error: { message: 'No employees found for processing payslips.' },
                    } as IApiResponse<never>);
                }
                console.log(finalUserIds, "finalUserIds")
                const payload = {
                    month: month,
                    year: year,
                    recipients: finalUserIds
                }
                console.log(payload, "payload")
                const result = await request.container!.documentService.sendPayslipDocuments(
                    payload,
                    request.user._id as string,
                );
                return reply.send({
                    success: true,
                    data: result,
                } as IApiResponse<any>);
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                } as IApiResponse<never>);
            }
        }
    );

    /**
     * Admin Upload Payslip - Upload payslip for employee
     * POST /documents/payslip/admin/upload
     * Uses same structure as generated payslips (type='Payslip', category='Payroll')
     */
    fastify.post(
        '/payslip/admin/upload',
        {
            onRequest: [authenticate],
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                // Parse multipart form data
                const { body, files } = await parseMultipartForm(request);

                if (!files || files.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: 'No file uploaded'
                    });
                }

                const file = files[0];

                // Extract form data
                const { employeeId, month, year, netSalary, isExport } = body;

                // Validate required fields
                if (!employeeId || !month || !year) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Missing required fields: employeeId, month, year'
                    });
                }

                // Validate month and year
                const monthNum = parseInt(month as string);
                const yearNum = parseInt(year as string);

                if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Invalid month. Month must be between 1 and 12.'
                    });
                }

                if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Invalid year. Year must be between 2000 and 2100.'
                    });
                }

                // Parse netSalary if provided
                const netSalaryNum = netSalary ? parseFloat(netSalary as string) : undefined;
                const isExportFlag = String(isExport).toLowerCase() === 'true';

                const documentService = request.container!.documentService;

                // Upload payslip document
                const document = await documentService.adminUploadPayslip(
                    employeeId as string,
                    monthNum,
                    yearNum,
                    file,
                    netSalaryNum,
                    isExportFlag
                );

                const employee = await User.findById(employeeId as string);

                return reply.status(200).send({
                    success: true,
                    message: 'Payslip uploaded successfully',
                    data: {
                        documentId: document._id,
                        employeeId: employeeId,
                        employeeName: employee?.name,
                        month: monthNum,
                        year: yearNum,
                        monthYear: `${yearNum}-${monthNum <= 9 ? `0${monthNum}` : monthNum}`,
                        fileName: document.fileName,
                        filePath: document.filePath,
                        status: document.status,
                        uploadedAt: document.uploadDate
                    }
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error during admin payslip upload:', errorMessage);
                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`
                });
            }
        }
    );

    /**
     * Admin Upload Payslips For Year - Upload multiple payslips for a full year in single API
     * Validates months based on employee's joining date
     * POST /documents/payslip/admin/upload/year
     */
    fastify.post(
        '/payslip/admin/upload/year',
        {
            onRequest: [authenticate],
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                // Parse multipart form data
                const { body, files } = await parseMultipartForm(request);

                // Extract required fields
                const { employeeId, year, isExport } = body;

                // Pre-validation (fail-fast)
                if (!employeeId) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Missing required field: employeeId'
                    });
                }

                if (!year) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Missing required field: year'
                    });
                }

                const yearNum = parseInt(year as string);
                const isExportFlag = String(isExport).toLowerCase() === 'true';
                if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Invalid year. Year must be between 2000 and 2100.'
                    });
                }

                // Validate files exist
                if (!files || files.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: 'No files uploaded. Expected 1-12 files (one per month).'
                    });
                }

                // Map files to months
                // Expected field names: file_01, file_02, ..., file_12
                const filesMap = new Map<number, { file: any; netSalary?: number }>();
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

                for (const file of files) {
                    // Extract month from fieldname (file_01, file_02, etc.)
                    const match = file.fieldname.match(/^file_(\d{2})$/);
                    if (!match) {
                        return reply.status(400).send({
                            success: false,
                            error: `Invalid file field name: ${file.fieldname}. Expected format: file_01, file_02, ..., file_12`
                        });
                    }

                    const month = parseInt(match[1]);
                    if (month < 1 || month > 12) {
                        return reply.status(400).send({
                            success: false,
                            error: `Invalid month number in field name ${file.fieldname}. Month must be 01-12.`
                        });
                    }

                    if (filesMap.has(month)) {
                        return reply.status(400).send({
                            success: false,
                            error: `Duplicate file for month ${month} (${monthNames[month - 1]}). Only one file per month allowed.`
                        });
                    }

                    // Extract netSalary if provided (netSalary_01, netSalary_02, etc.)
                    const netSalaryField = `netSalary_${match[1]}`;
                    const netSalary = body[netSalaryField]
                        ? parseFloat(body[netSalaryField] as string)
                        : undefined;

                    filesMap.set(month, { file, netSalary });
                }

                // Validate at least 1 file, max 12 files
                if (filesMap.size === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: 'No valid files found. Expected files with field names: file_01, file_02, ..., file_12'
                    });
                }

                if (filesMap.size > 12) {
                    return reply.status(400).send({
                        success: false,
                        error: `Too many files. Maximum 12 files allowed (one per month). Found: ${filesMap.size}`
                    });
                }

                // Get employee for response and validation
                const employee = await User.findById(employeeId as string);
                if (!employee) {
                    return reply.status(404).send({
                        success: false,
                        error: `Employee with ID ${employeeId} not found`
                    });
                }

                if (!employee.active) {
                    return reply.status(400).send({
                        success: false,
                        error: `Employee ${employee.name} is not active`
                    });
                }

                // Validate joining date and calculate valid months
                if (!employee.joiningDate) {
                    return reply.status(400).send({
                        success: false,
                        error: `Employee ${employee.name} does not have a joining date`
                    });
                }

                const joiningDate = new Date(employee.joiningDate);
                const joiningYear = joiningDate.getFullYear();
                const joiningMonth = joiningDate.getMonth() + 1; // JavaScript months are 0-based

                // Calculate valid months based on joining date
                let validMonths: number[] = [];
                if (yearNum === joiningYear) {
                    // Same year: can only upload from joining month onwards
                    validMonths = Array.from({ length: 12 - joiningMonth + 1 }, (_, i) => joiningMonth + i);
                } else if (yearNum > joiningYear) {
                    // Future year: can upload all 12 months
                    validMonths = Array.from({ length: 12 }, (_, i) => i + 1);
                } else {
                    // Past year: invalid (employee not joined yet)
                    return reply.status(400).send({
                        success: false,
                        error: `Cannot upload payslips for year ${yearNum}. Employee joined on ${joiningDate.toISOString().split('T')[0]} (year ${joiningYear})`
                    });
                }

                // Validate all uploaded months are valid
                const uploadedMonths = Array.from(filesMap.keys());
                const invalidMonths = uploadedMonths.filter(month => !validMonths.includes(month));

                if (invalidMonths.length > 0) {
                    const invalidMonthNames = invalidMonths.map(m => monthNames[m - 1]).join(', ');
                    const validMonthNames = validMonths.map(m => monthNames[m - 1]).join(', ');
                    return reply.status(400).send({
                        success: false,
                        error: `Cannot upload payslips for months: ${invalidMonthNames}. Employee joined on ${joiningDate.toISOString().split('T')[0]} (${monthNames[joiningMonth - 1]} ${joiningYear}). Valid months for ${yearNum}: ${validMonthNames}`
                    });
                }

                // Call service method
                const documentService = request.container!.documentService;
                const result = await documentService.adminUploadPayslipsForYear(
                    employeeId as string,
                    yearNum,
                    filesMap,
                    isExportFlag
                );

                // Format response
                return reply.status(200).send({
                    success: result.failed === 0,
                    message: result.failed === 0
                        ? `All ${result.success} payslips uploaded successfully`
                        : `${result.success} payslips uploaded, ${result.failed} failed`,
                    data: {
                        employeeId: employeeId,
                        employeeName: employee.name,
                        year: yearNum,
                        uploaded: result.success,
                        failed: result.failed,
                        total: filesMap.size,
                        payslips: result.payslips,
                        errors: result.errors
                    }
                });

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error during bulk year payslip upload:', errorMessage);
                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`
                });
            }
        }
    );

    // Get payslip records for specific users
    fastify.post(
        '/payslip/search',
        {
            // onRequest: [authenticate],
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
                                        _id: { type: 'string' }, // Document record ID
                                        userId: { type: 'string' },
                                        accessLevel: {
                                            type: 'string',
                                            enum: ['Public', 'Private']
                                        },
                                        status: {
                                            type: 'string',
                                            enum: ['Generated', 'Sent', 'Exported']
                                        },
                                        payslipUrl: { type: 'string', format: 'uri' },
                                        isExport: { type: 'boolean' },
                                        month: { type: 'number' },
                                        year: { type: 'number' },
                                        monthYear: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
                                        // netSalary: { type: 'number' },
                                        // grossSalary: { type: 'number' },
                                        // totalDeductions: { type: 'number' },
                                        // reimbursement: { type: 'number' },
                                        // bonus: { type: 'number' }
                                    }
                                }
                            }
                        }
                    },
                    400: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean', default: false },
                            message: { type: 'string' }
                        }
                    }
                },
            }
        },
        async (request, reply) => {
            console.log("inside /payslip/search route", request.body);
            const { userIds, month, year } = request.body as getPayslipRequestBody;
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
                const data = await request.container!.documentService.getPayslipDocumentsForUsers(userIds, month, year);
                console.log(data, "response data")
                return reply.send({ success: true, data: data });
            } catch (error: any) {
                return reply.status(400).send({ success: false, error: error.message });
            }
        }
    );

    //Admin: Upload Form 16 ZIP  
    fastify.post(
        '/form16/upload',
        {
            preHandler: [zipFileUpload],
            schema: {
                consumes: ['multipart/form-data'],
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            errors: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        fileName: { type: 'string' },
                                        error: { type: 'string' }
                                    }
                                }
                            },
                            validFiles: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        fileName: { type: 'string' },
                                        pan: { type: 'string' },
                                        user: {
                                            type: 'object',
                                            properties: {
                                                _id: { type: 'string' },
                                                employeeId: { type: 'string' },
                                                name: { type: 'string' },
                                                email: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            },
                            processed: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        fileName: { type: 'string' },
                                        pan: { type: 'string' },
                                        documentId: { type: 'string' },
                                        user: {
                                            type: 'object',
                                            properties: {
                                                _id: { type: 'string' },
                                                employeeId: { type: 'string' },
                                                name: { type: 'string' },
                                                email: { type: 'string' }
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
        async (request, reply) => {
            console.log("*******")
            console.log(request.file)
            console.log("*******")
            console.log(request.files)
            console.log("*******")
            console.log("first")
            try {
                const file = (request as any).file;
                console.log(file, "file");
                const today = new Date();
                const year = today.getFullYear();
                const month = today.getMonth() + 1; // JS months are 0-based

                const startYear = month >= 4 ? year : year - 1;
                const endYear = startYear + 1;

                const FY = `${startYear}-${endYear}`;

                let financialYear: string;
                if (
                    typeof request.body === 'object' &&
                    request.body !== null &&
                    'financialYear' in request.body &&
                    typeof (request.body as any).financialYear === 'string'
                ) {
                    financialYear = (request.body as any).financialYear;
                } else {
                    financialYear = FY;
                }

                if (!file || !file.buffer) {
                    return reply.status(200).send({
                        success: false,
                        errors: [{ fileName: '', error: 'No ZIP file uploaded or file is empty.' }],
                    });
                }

                const validationErrors: { fileName: string, error: string }[] = [];
                const validFiles: { entry: any, pan: string, user: any, justFileName: string }[] = [];

                try {
                    const directory = await unzipper.Open.buffer(file.buffer);
                    for (const entry of directory.files) {
                        const fileName = entry.path;
                        const justFileName = path.basename(fileName);

                        // Skip directories and macOS resource fork files
                        if (entry.type !== 'File' || justFileName.startsWith('._')) {
                            continue;
                        }

                        // 1. Check PDF
                        if (!justFileName.toLowerCase().endsWith('.pdf')) {
                            validationErrors.push({ fileName: justFileName, error: 'Not a PDF file' });
                            continue;
                        }

                        // 2. Check PAN format
                        const panMatch = justFileName.match(/^([A-Z]{5}[0-9]{4}[A-Z]{1})\.pdf$/i);
                        if (!panMatch) {
                            validationErrors.push({ fileName: justFileName, error: 'Invalid PAN format' });
                            continue;
                        }
                        const pan = panMatch[1].toUpperCase();

                        // 3. Check PAN exists
                        //get the document with category= Certification
                        /*  const user = await User.findOne({ 'governmentIds.pan.number': new RegExp(`^${pan}$`, 'i') }).lean() as (IUser & { _id: any });
                          if (!user) {
                              validationErrors.push({ fileName: justFileName, error: 'PAN not found in system' });
                              continue;
                          }
                              */
                        const document = await Document.findOne({
                            category: 'Certification',
                            'metadata.certificate.certificateType': 'IdentityProof',
                            'metadata.certificate.idDetails.idType': 'PAN',
                            'metadata.certificate.idDetails.idNumber': new RegExp(`^${pan}$`, 'i')
                        }).lean();
                        console.log(document, "get Document")
                        console.log("first")
                        if (!document) {
                            validationErrors.push({ fileName: justFileName, error: 'PAN not found in system' });
                            continue;
                        }

                        // Fetch the user based on the document's employeeId
                        const user = await User.findById(document.employeeId).lean() as (IUser & { _id: any });
                        if (!user) {
                            validationErrors.push({ fileName: justFileName, error: 'User not found for the given PAN' });
                            continue;
                        }

                        // If all checks pass, add to validFiles
                        validFiles.push({ entry, pan, user, justFileName });
                    }
                } catch (zipError) {
                    request.log.error(zipError, 'Error processing ZIP file');
                    return reply.status(200).send({
                        success: false,
                        errors: [{ fileName: '', error: 'Invalid or corrupt ZIP file.' }],
                    });
                }

                if (validationErrors.length > 0) {
                    // Optionally, map validFiles to a preview array for FE
                    const validFilesPreview = validFiles.map(({ pan, user, justFileName }) => ({
                        fileName: justFileName,
                        pan,
                        user: {
                            _id: user._id,
                            employeeId: user._id,
                            name: user.name,
                            email: user.email,
                        }
                    }));
                    return reply.status(200).send({ success: false, errors: validationErrors, validFiles: validFilesPreview });
                }

                // If all valid, process validFiles as before
                const processed: any[] = [];
                for (const { entry, pan, user, justFileName } of validFiles) {
                    const fileContent = await entry.buffer();
                    const document = await request.container!.documentService.uploadForm16(user._id, user.name, pan, justFileName, fileContent, financialYear);
                    processed.push({
                        fileName: justFileName,
                        pan,
                        documentId: document._id,
                        user: {
                            _id: user._id,
                            employeeId: user._id,
                            name: user.name,
                            email: user.email,
                        },
                    });
                }

                return reply.status(200).send({
                    success: true,
                    processed
                });

            } catch (error: any) {
                request.log.error((error as Error).message || error);
                return reply.status(500).send({
                    success: false,
                    error: 'Internal server error during Form 16 upload process.',
                });
            }
        }
    );

    //Get Docs 
    fastify.get<{ Querystring: IDocumentQuery }>(
        '/',
        {
            onRequest: [authenticate],
            schema: {
                querystring: {
                    type: 'object',
                    properties: {
                        access: { type: 'string', enum: ['own', 'team', 'global'], default: 'own' },
                        employeeId: { type: 'string' },
                        type: { type: 'string', enum: ['Payslip', 'TimesheetFile', 'Form16', 'Form12B', 'Form12BB', 'OfferLetter', 'HikeLetter', 'Certificate', 'AdminUpload', 'AttendanceFile', 'TaxProof'] },
                        category: { type: 'string', enum: ['Payroll', 'Timesheet', 'Tax', 'EmployeeLifecycle', 'Certification', 'Attendance'] },
                        year: { type: 'integer' },
                        month: { type: 'integer' },
                        financialYear: { type: 'string' },
                        page: { type: 'integer', minimum: 1, default: 1 },
                        limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
                        department: { type: 'string' },
                        role: { type: 'string', enum: ['admin', 'manager', 'staff'] },
                        activeStatus: { type: 'boolean' },
                        designation: { type: 'string' },
                        location: { type: 'string' },
                        search: { type: 'string' }
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
                                        _id: { type: 'string' },
                                        employeeId: {
                                            type: 'object',
                                            properties: {
                                                _id: { type: 'string' },
                                                name: { type: 'string' },
                                                email: { type: 'string' }
                                            }
                                        },
                                        type: {
                                            type: 'string',
                                            enum: ['Payslip', 'TimesheetFile', 'Form16', 'OfferLetter', 'HikeLetter', 'Certificate', 'Form12B', 'Form12BB', 'AdminUpload', 'AttendanceFile', 'TaxProof']
                                        },
                                        category: {
                                            type: 'string',
                                            enum: ['Payroll', 'Timesheet', 'Tax', 'EmployeeLifecycle', 'Certification', 'Attendance']
                                        },
                                        tags: {
                                            type: 'array',
                                            items: { type: 'string' }
                                        },
                                        fileName: { type: 'string' },
                                        filePath: { type: 'string' },
                                        uploadDate: { type: 'string', format: 'date-time' },
                                        uploadedBy: {
                                            type: 'object',
                                            properties: {
                                                name: { type: 'string' },
                                                email: { type: 'string' }
                                            }
                                        },
                                        accessLevel: {
                                            type: 'string',
                                            enum: ['Public', 'Private', 'Role-Based']
                                        },
                                        status: {
                                            type: 'string',
                                            enum: ['Uploaded', 'Assigned', 'Acknowledged', 'Generated', 'Sent', 'Exported']
                                        },
                                        version: { type: 'number' },
                                        expiryDate: { type: 'string', format: 'date-time' },
                                        metadata: {
                                            type: 'object',
                                            properties: {
                                                payslip: {
                                                    type: 'object',
                                                    properties: {
                                                        payrollId: { type: 'string' },
                                                        monthYear: { type: 'string' },
                                                        month: { type: 'number' },
                                                        year: { type: 'number' },
                                                        netSalary: { type: 'number' },
                                                        paySummary: {
                                                            type: 'object',
                                                            properties: {
                                                                gross: { type: 'number' },
                                                                net: { type: 'number' },
                                                                deductions: { type: 'number' },
                                                                bonus: { type: 'number' },
                                                                reimbursement: { type: 'number' }
                                                            }
                                                        },
                                                        isExport: { type: 'boolean' },
                                                        emailHistory: {
                                                            type: 'array',
                                                            items: {
                                                                type: 'object',
                                                                properties: {
                                                                    sentAt: { type: 'string', format: 'date-time' },
                                                                    status: { type: 'string', enum: ['Sent', 'Failed'] },
                                                                    sentBy: { type: 'string' },
                                                                    recipientEmail: { type: 'string' },
                                                                    errorMessage: { type: 'string' },
                                                                    messageId: { type: 'string' }
                                                                }
                                                            }
                                                        }
                                                    }
                                                },
                                                timesheet: {
                                                    type: 'object',
                                                    properties: {
                                                        month: { type: 'number' },
                                                        year: { type: 'number' }
                                                    }
                                                },
                                                form16: {
                                                    type: 'object',
                                                    properties: {
                                                        financialYear: { type: 'string' },
                                                        pan: { type: 'string' },
                                                        tdsAmount: { type: 'number' }
                                                    }
                                                },
                                                offerLetter: {
                                                    type: 'object',
                                                    properties: {
                                                        offerDate: { type: 'string', format: 'date-time' },
                                                        joiningDate: { type: 'string', format: 'date-time' },
                                                        designation: { type: 'string' },
                                                        ctc: { type: 'number' },
                                                        candidateName: { type: 'string' },
                                                        candidateEmail: { type: 'string' },
                                                        dispatchId: { type: 'string' },
                                                        annexure: {
                                                            type: 'object',
                                                            properties: {
                                                                fileName: { type: 'string' },
                                                                filePath: { type: 'string' }
                                                            }
                                                        }
                                                    }
                                                },
                                                hikeLetter: {
                                                    type: 'object',
                                                    properties: {
                                                        effectiveDate: { type: 'string', format: 'date-time' },
                                                        newCtc: { type: 'number' },
                                                        percentageIncrease: { type: 'number' },
                                                        employeeName: { type: 'string' },
                                                        employeeEmail: { type: 'string' },
                                                        employeeCode: { type: 'string' },
                                                        dispatchId: { type: 'string' },
                                                        batchName: { type: 'string' },
                                                        isAnnexure: { type: 'boolean' },
                                                        monthlyGross: { type: 'number' },
                                                        signatoryName: { type: 'string' },
                                                        signatoryDesignation: { type: 'string' },
                                                        signatureBase64: { type: 'string' }
                                                    }
                                                },
                                                certificate: {
                                                    type: 'object',
                                                    properties: {
                                                        certificateType: { type: 'string', enum: ['Academic', 'Experience', 'Skill', 'IdentityProof'] },
                                                        title: { type: 'string' },
                                                        issuingAuthority: { type: 'string' },
                                                        issueDate: { type: 'string', format: 'date-time' },
                                                        expiryDate: { type: 'string', format: 'date-time' },
                                                        description: { type: 'string' },
                                                        comments: { type: 'string' },
                                                        certificateId: { type: 'string' },
                                                        idDetails: {
                                                            type: 'object',
                                                            properties: {
                                                                idType: { type: 'string', enum: ['Aadhaar', 'PAN', 'Passport', 'DriverLicense', 'VoterID', 'Other'] },
                                                                idNumber: { type: 'string' },
                                                                country: { type: 'string' },
                                                            }
                                                        },
                                                        skillDetails: {
                                                            type: 'object',
                                                            properties: {
                                                                skillName: { type: 'string' },
                                                                proficiencyLevel: {
                                                                    type: 'string'
                                                                },
                                                                category: {
                                                                    type: 'string'
                                                                },
                                                            }
                                                        },
                                                        academicDetails: {
                                                            type: 'object',
                                                            properties: {
                                                                qualificationType: { type: 'string' },
                                                                fieldOfStudy: { type: 'string' },
                                                                grade: { type: 'string' },
                                                                institution: { type: 'string' },
                                                                yearOfCompletion: { type: 'number' }
                                                            }
                                                        },
                                                        experienceDetails: {
                                                            type: 'object',
                                                            properties: {
                                                                companyName: { type: 'string' },
                                                                role: { type: 'string' },
                                                                startDate: { type: 'string', format: 'date-time' },
                                                                endDate: { type: 'string', format: 'date-time' },
                                                                duration: { type: 'string' },
                                                            }
                                                        },
                                                        verificationStatus: { type: 'string', enum: ['Pending', 'Verified', 'Rejected'] },
                                                        verificationDetails: {
                                                            type: 'object',
                                                            properties: {
                                                                verifiedBy: { type: 'string' },
                                                                verifiedAt: { type: 'string', format: 'date-time' },
                                                                comments: { type: 'string' },
                                                            }
                                                        }
                                                    }
                                                },
                                                form12B: {
                                                    type: 'object',
                                                    properties: {
                                                        previousEmployer: {
                                                            type: 'object',
                                                            properties: {
                                                                name: { type: 'string' },
                                                                pan: { type: 'string' },
                                                                tan: { type: 'string' }
                                                            }
                                                        },
                                                        employmentPeriod: {
                                                            type: 'object',
                                                            properties: {
                                                                startDate: { type: 'string', format: 'date-time' },
                                                                endDate: { type: 'string', format: 'date-time' }
                                                            }
                                                        },
                                                        salaryEarned: { type: 'number' },
                                                        tdsDeducted: { type: 'number' },
                                                        financialYear: { type: 'string' },
                                                        status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'ResubmissionRequested'] },
                                                        isLocked: { type: 'boolean' }
                                                    }
                                                },
                                                form12BB: {
                                                    type: 'object',
                                                    properties: {
                                                        financialYear: { type: 'string' },
                                                        regime: { type: 'string' },
                                                        taxDeclarationId: { type: 'string' },
                                                        totalIncome: { type: 'string' },
                                                        deductions: { type: 'string' },
                                                        taxPayable: { type: 'string' },
                                                        isLocked: { type: 'boolean' },
                                                        isPreviewEnabled: { type: 'boolean' },
                                                        tdsPaid: { type: 'string' },
                                                    }
                                                }
                                            }
                                        },
                                        auditLog: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    action: {
                                                        type: 'string',
                                                        enum: ['Upload', 'View', 'Download', 'Send', 'Generate', 'Acknowledge', 'Verify']
                                                    },
                                                    performedBy: { type: 'string' },
                                                    timestamp: { type: 'string', format: 'date-time' },
                                                    details: { type: 'string' }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            meta: {
                                type: 'object',
                                properties: {
                                    page: { type: 'number' },
                                    limit: { type: 'number' },
                                    total: { type: 'number' },
                                    totalPages: { type: 'number' }
                                },
                                required: ['page', 'limit', 'total', 'totalPages']
                            }
                        },
                        required: ['success', 'data', 'meta']
                    },
                    400: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            error: { type: 'string' }
                        },
                        required: ['success', 'error']
                    },
                    403: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            error: { type: 'string' }
                        },
                        required: ['success', 'error']
                    }
                }
            }
        },
        async (request, reply) => {
            console.log(request.query, "request query in route")
            try {
                const result = await request.container!.documentService.getDocuments(request, reply);
                console.log(result.data, "result get docs")
                return reply.send({
                    success: true,
                    data: result.data,
                    meta: result.meta
                });
            } catch (error) {
                return reply.status(400).send({
                    success: false,
                    error: (error as Error).message
                });
            }
        }
    );

    //get by Doc Id
    fastify.get<{ Params: { id: string } }>(
        '/:id',
        {
            onRequest: [authenticate],
            schema: {
                params: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    },
                    required: ['id']
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'object',
                                properties: {
                                    _id: { type: 'string' },
                                    employeeId: {
                                        type: 'object',
                                        properties: {
                                            _id: { type: 'string' },
                                            name: { type: 'string' },
                                            email: { type: 'string' }
                                        },
                                        required: ['_id', 'name', 'email']
                                    },
                                    type: { type: 'string', enum: ['Payslip', 'TimesheetFile', 'Form16', 'OfferLetter', 'HikeLetter', 'Certificate', 'Form12B', 'Form12BB', 'AdminUpload', 'AttendanceFile', 'TaxProof'] },
                                    category: { type: 'string', enum: ['Payroll', 'Timesheet', 'Tax', 'EmployeeLifecycle', 'Certification', 'Attendance'] },
                                    tags: { type: 'array', items: { type: 'string' } },
                                    fileName: { type: 'string' },
                                    filePath: { type: 'string' },
                                    uploadDate: { type: 'string', format: 'date-time' },
                                    uploadedBy: {
                                        type: 'object',
                                        properties: {
                                            _id: { type: 'string' },
                                            name: { type: 'string' },
                                            email: { type: 'string' }
                                        },
                                        required: ['_id', 'name', 'email']
                                    },
                                    accessLevel: { type: 'string', enum: ['Public', 'Private', 'Role-Based'] },
                                    status: { type: 'string', enum: ['Uploaded', 'Assigned', 'Acknowledged', 'Generated', 'Sent', 'Exported'] },
                                    version: { type: 'number' },
                                    expiryDate: { type: ['string', 'null'], format: 'date-time' },
                                    metadata: { type: 'object', additionalProperties: true },
                                    auditLog: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                action: { type: 'string', enum: ['Upload', 'View', 'Download', 'Send', 'Generate', 'Acknowledge', 'Verify'] },
                                                performedBy: { type: 'string' },
                                                timestamp: { type: 'string', format: 'date-time' },
                                                details: { type: ['string', 'null'] }
                                            },
                                            required: ['action', 'performedBy', 'timestamp']
                                        }
                                    },
                                    createdAt: { type: 'string', format: 'date-time' },
                                    updatedAt: { type: 'string', format: 'date-time' },
                                    __v: { type: 'number' }
                                },
                                required: ['_id', 'employeeId', 'type', 'category', 'tags', 'fileName', 'filePath', 'uploadDate', 'uploadedBy', 'accessLevel', 'status', 'version', 'metadata', 'auditLog', 'createdAt', 'updatedAt', '__v']
                            }
                        },
                        required: ['success', 'data']
                    },
                    400: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            error: { type: 'string' }
                        },
                        required: ['success', 'error']
                    },
                    401: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            error: { type: 'string' }
                        },
                        required: ['success', 'error']
                    },
                    403: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            error: { type: 'string' }
                        },
                        required: ['success', 'error']
                    },
                    404: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            error: { type: 'string' }
                        },
                        required: ['success', 'error']
                    }
                }
            }
        },
        async (request, reply) => {
            console.log(request.params, 'request params in route');
            const { id } = request.params;
            try {
                const result = await request.container!.documentService.getByIdDocuments(id, request);
                request.log.info({ response: result }, 'Sending response to client');
                return reply.send(result);
            } catch (error: any) {
                request.log.error({ error: error.message }, 'Error in getById route');
                if (error.message === 'Invalid document ID') {
                    return reply.status(400).send({
                        success: false,
                        error: error.message
                    });
                }
                if (error.message === 'Document not found') {
                    return reply.status(404).send({
                        success: false,
                        error: error.message
                    });
                }
                return reply.status(500).send({
                    success: false,
                    error: 'Failed to retrieve document'
                });
            }
        }
    );

    //upload Certifications
    fastify.post('/certifications', {
        preHandler: [authenticate, filesUpload]
    }, async (request, reply) => {
        try {
            console.log("*******")
            console.log(request.file, "file");
            console.log("*******")
            console.log(request.files, "files")
            console.log("*******")
            console.log(request.body, "req body")
            console.log("*******")
            const { documentData, employeeId } = request.body as { documentData: string, employeeId: string };
            const files = (request as any).files;
            const user = request.user;

            if (!files || files.length === 0) {
                return reply.status(400).send({ success: false, error: 'No file uploaded.' });
            }

            if (!documentData || !employeeId) {
                return reply.status(400).send({ success: false, error: 'Missing documentData or employeeId in the request body.' });
            }

            // Validate employeeId: Employees can only upload for themselves, admins/managers can upload for anyone
            if (user && user.role.toLowerCase() !== 'admin' && user.role.toLowerCase() !== 'manager') {
                if (user._id.toString() !== employeeId) {
                    return reply.status(403).send({
                        success: false,
                        error: 'Forbidden: You can only upload certificates for yourself.'
                    });
                }
            }

            const parsedData = JSON.parse(documentData);
            const file = files[0];
            console.log(parsedData, "parsedData");
            console.log(file, "file")

            // No restrictions on certificate types - employees can upload Academic, Experience, and IdentityProof
            const newDocument = await request.container!.documentService.createCertificate(employeeId, parsedData, file);

            return reply.status(201).send({
                success: true,
                data: newDocument
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error during certification upload:', errorMessage);
            return reply.status(500).send({
                success: false,
                error: `Internal server error: ${errorMessage}`,
            });
        }
    });

    //update certifications
    fastify.put<{ Params: { id: string } }>(
        '/certifications/:id',
        {
            preHandler: [authenticate],

        },
        async (request, reply) => {

            const { body, files } = await parseMultipartForm(request);
            console.log(body, "parseMultipartForm body");
            console.log(files, "parseMultipartForm files");
            console.log("first")

            const { id } = request.params;
            const { documentData, employeeId } = body as { documentData: string; employeeId: string };
            const user = request.user;

            console.log(id, "id ")
            console.log(documentData, "documentData");
            console.log(employeeId, "employeeId");
            console.log(files, "files")
            try {
                // Validate employeeId
                if (!employeeId) {
                    return reply.status(400).send({ success: false, error: 'Invalid employee ID' });
                }

                // Validate ownership: Employees can only update their own certificates, admins/managers can update any
                if (user && user.role.toLowerCase() !== 'admin' && user.role.toLowerCase() !== 'manager') {
                    if (user._id.toString() !== employeeId) {
                        return reply.status(403).send({
                            success: false,
                            error: 'Forbidden: You can only update your own certificates.'
                        });
                    }
                }

                // Parse documentData
                let parsedData;
                try {
                    parsedData = JSON.parse(documentData);
                } catch (err) {
                    return reply.status(400).send({ success: false, error: 'Invalid documentData format' });
                }

                const file = files && files.length > 0 ? files[0] : null;
                // No restrictions on certificate types - employees can update Academic, Experience, and IdentityProof
                const updatedDocument = await request.container!.documentService.updateCertificate(id, parsedData, file, request);

                return reply.status(200).send({ success: true, data: updatedDocument });
            } catch (error: any) {
                request.log.error({ error: error.message }, 'Error in update certifications route');
                if (error.message === 'Invalid document ID') {
                    return reply.status(400).send({ success: false, error: error.message });
                }
                if (error.message === 'Document not found') {
                    return reply.status(404).send({ success: false, error: error.message });
                }
                if (error.message.includes('User') || error.message.includes('Certificate metadata') || error.message.includes('Document type') || error.message.includes('Document category')) {
                    return reply.status(400).send({ success: false, error: error.message });
                }
                return reply.status(500).send({
                    success: false,
                    error: 'Failed to update certificate'
                });
            }

        }
    );
    //verify certifications
    fastify.patch('/certifications/:id/verify', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        try {
            const adminUser = request.user;
            if (adminUser?.role !== 'admin') {
                return reply.status(403).send({ success: false, error: 'Forbidden: Only admins can verify documents.' });
            }

            const { id } = request.params as { id: string };
            const { status, comments } = request.body as { status: 'Verified' | 'Rejected', comments: string };

            if (!status || !['Verified', 'Rejected'].includes(status)) {
                return reply.status(400).send({ success: false, error: 'Invalid status. Must be "Verified" or "Rejected".' });
            }

            const updatedDocument = await request.container!.documentService.verifyDocument(id, status, comments, adminUser._id.toString());

            if (status === 'Verified') {
                const certificate = updatedDocument?.metadata?.certificate;
                const idDetails = certificate?.idDetails;
                const governmentIdKey = mapIdTypeToGovernmentIdKey(idDetails?.idType);

                if (
                    updatedDocument?.employeeId &&
                    certificate?.certificateType === 'IdentityProof' &&
                    governmentIdKey
                ) {
                    const governmentIdUpdate: Record<string, any> = {
                        [`governmentIds.${governmentIdKey}.number`]: idDetails?.idNumber,
                        [`governmentIds.${governmentIdKey}.country`]: idDetails?.country,
                        [`governmentIds.${governmentIdKey}.documentUrl`]: updatedDocument.filePath,
                        [`governmentIds.${governmentIdKey}.documentId`]: updatedDocument._id,
                        [`governmentIds.${governmentIdKey}.verificationStatus`]: 'Verified'
                    };

                    if (governmentIdKey === 'pf') {
                        governmentIdUpdate['governmentIds.pf.uan'] = idDetails?.uanNumber;
                    }

                    Object.keys(governmentIdUpdate).forEach((key) => {
                        if (governmentIdUpdate[key] === undefined) {
                            delete governmentIdUpdate[key];
                        }
                    });

                    await User.findByIdAndUpdate(updatedDocument.employeeId, {
                        $set: governmentIdUpdate
                    });
                }
            }

            return reply.status(200).send({
                success: true,
                data: updatedDocument
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error during document verification:', errorMessage);
            return reply.status(500).send({
                success: false,
                error: `Internal server error: ${errorMessage}`,
            });
        }
    });

    //delete certifications
    fastify.delete('/:id', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        try {
            console.log("inside delete route", request.params)
            const { id } = request.params as { id: string };
            const user = request.user;
            const deletedDocument = await request.container!.documentService.deleteDocument(id, user._id.toString(), user.role);
            return reply.status(200).send({
                success: true,
                data: deletedDocument
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error during document deletion:', errorMessage);
            return reply.status(errorMessage.includes('Forbidden') ? 403 : 500).send({
                success: false,
                error: errorMessage.includes('Forbidden') ? errorMessage : 'Internal server error',
            });
        }
    });

    //delete bulk payslips
    fastify.delete('/payroll/bulk', {
        preHandler: [authenticate]
    }, async (request, reply) => {
        try {
            const { month, year } = request.query as { month: string, year: string };
            const user = request.user;
            if (user?.role.toLowerCase() !== 'admin') {
                return reply.status(403).send({ success: false, error: 'Forbidden: Only admins can bulk delete payslips.' });
            }
            if (!month || !year) {
                return reply.status(400).send({ success: false, error: 'Month and year are required.' });
            }
            const deletedCount = await request.container!.documentService.deletePayrollDocuments(parseInt(month), parseInt(year));

            // Also delete from the legacy Payslip collection for synchronization
            try {
                await request.container!.payslipService.deletePayroll(parseInt(month), parseInt(year));
            } catch (err) {
                console.warn('Failed to delete from legacy Payslip collection during bulk delete:', err);
            }

            return reply.status(200).send({
                success: true,
                message: `Bulk deletion successful. Deleted ${deletedCount} payslips.`,
                deletedCount
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error during bulk payslip deletion:', errorMessage);
            return reply.status(500).send({
                success: false,
                error: 'Internal server error during bulk deletion',
            });
        }
    });

    //upload Form12B
    fastify.post('/form12b', {
        preHandler: [filesUpload]
    }, async (request, reply) => {
        try {
            console.log(request.file, "file");
            console.log(request.files, "files")
            console.log(request.body, "req body")
            console.log("first")

            const file = (request as any).files;
            if (!file || file.length === 0) {
                return reply.status(400).send({ success: false, error: 'No file uploaded.' });
            }
            console.log(file, "file in route")
            const { documentData } = request.body as { documentData: string };
            console.log(documentData, "documentData in route")
            console.log(typeof documentData, "typeof documentData in route")
            let parsedData: IForm12BSubmission = JSON.parse(documentData);
            console.log(parsedData, "parsedData")
            let userId = request.user?._id?.toString() || '68355851969275367d77b3bc';
            console.log(userId, "userId")

            const form12BDoc = await request.container!.documentService.uploadForm12B(file, parsedData, userId);

            return reply.status(200).send({
                success: true,
                data: form12BDoc
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error during document deletion:', errorMessage);
            return reply.status(errorMessage.includes('Forbidden') ? 403 : 500).send({
                success: false,
                error: errorMessage.includes('Forbidden') ? errorMessage : 'Internal server error',
            });
        }
    })

    //update Form12B status
    fastify.put('/form12b/:id/status',
        {
            // preHandler: [authenticate],
        },
        async (request, reply) => {
            console.log(request.params, "request params in route")
            console.log(request.body, "request body in route");
            const { id } = request.params as { id: string };
            const { status, comments } = request.body as { status: 'Verified' | 'Rejected' | 'ResubmissionRequested', comments?: string };
            const user = request?.user;
            // if (user.role !== 'admin') {
            //     return reply.status(403).send({ success: false, error: 'Forbidden: Only admins can update Form12B status.' });
            // }
            const userId = user?._id?.toString() || '68355851969275367d77b3bc'; // Default userId for testing, replace with actual user ID from request

            if (!status || !['Verified', 'Rejected', 'ResubmissionRequested'].includes(status)) {
                return reply.status(400).send({ success: false, error: 'Invalid status. Must be "Verified", "Rejected" or "ResubmissionRequested".' });
            }

            try {
                const updatedDocument = await request.container!.documentService.updateForm12BStatus(id, status, userId, comments);
                return reply.status(200).send({
                    success: true,
                    data: updatedDocument
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error during Form12B status update:', errorMessage);
                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`,
                });
            }
        })

    //Generate Form12BB
    fastify.post('/generate-form12bb',
        {
            preHandler: [authenticate],
        },
        async (request, reply) => {
            console.log(request.body, "data in form12bb generate route");
            try {
                const updatedDocument = await request.container!.documentService.generateForm12BB(request.body as IForm12BBGenerate);

                return reply.status(200).send({
                    success: true,
                    data: updatedDocument
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error during Form12B status update:', errorMessage);
                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`,
                });
            }
        }
    );

    //preview Status UpdateForm12BB
    fastify.put<IPreviewStatusRequest>(
        "/form12bb/:id/preview-status",
        { preHandler: [authenticate] },
        async (request: FastifyRequest<IPreviewStatusRequest>, reply: FastifyReply) => {
            const { isPreviewEnabled } = request.body;
            const { id } = request.params;
            const user = request.user;

            if (typeof isPreviewEnabled !== "boolean") {
                return reply.status(400).send({ success: false, error: "isPreviewEnabled must be true or false." });
            }

            try {
                const updatedDocument = await request.container!.documentService.updateForm12BBPreview(
                    id,
                    isPreviewEnabled,
                    user
                );
                if (!updatedDocument) {
                    return reply.status(404).send({ success: false, error: "Form12BB document not found." });
                }
                console.log(updatedDocument, "updatedDocument in route");
                return reply.status(200).send({
                    success: true,
                    data: updatedDocument,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("Error during Form12BB preview status update:", errorMessage);
                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`,
                });
            }
        }
    );

    /**
     * Admin Upload Document - Simple upload for payslips, timesheets, etc.
     * POST /documents/admin/upload
     */
    fastify.post(
        '/admin/upload',
        {
            onRequest: [authenticate],
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                // Parse multipart form data
                const { body, files } = await parseMultipartForm(request);

                if (!files || files.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: 'No file uploaded'
                    });
                }

                const file = files[0];

                // Extract form data
                const { employeeId, documentType, documentName, documentDate, description } = body;

                // Validate required fields
                if (!employeeId || !documentType || !documentName || !documentDate) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Missing required fields: employeeId, documentType, documentName, documentDate'
                    });
                }

                // Validate documentDate
                const docDate = new Date(documentDate as string);
                if (isNaN(docDate.getTime())) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Invalid document date'
                    });
                }

                // Validate document type
                if (!['Payslip', 'Timesheet', 'Other'].includes(documentType as string)) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Document type must be Payslip, Timesheet, or Other'
                    });
                }

                const documentService = request.container!.documentService;

                // Upload document
                const document = await documentService.adminUploadDocument(
                    employeeId as string,
                    documentType as 'Payslip' | 'Timesheet' | 'Other',
                    documentName as string,
                    docDate,
                    file,
                    description
                );

                const employee = await User.findById(employeeId as string);

                return reply.status(200).send({
                    success: true,
                    message: 'Document uploaded successfully',
                    data: {
                        documentId: document._id,
                        documentName: documentName,
                        fileName: document.fileName,
                        employeeName: employee?.name,
                        documentType: documentType,
                        documentDate: docDate,
                        uploadedAt: document.uploadDate
                    }
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error during admin document upload:', errorMessage);
                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`
                });
            }
        }
    );

    /**
     * Get Admin Uploaded Documents with Filters
     * GET /documents/admin/uploads
     */
    fastify.get(
        '/admin/uploads',
        {
            onRequest: [authenticate],
            schema: {
                description: 'Get admin uploaded documents with filters',
                tags: ['Documents'],
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                querystring: {
                    type: 'object',
                    properties: {
                        employeeId: { type: 'string', description: 'Filter by employee ID' },
                        documentType: { type: 'string', enum: ['Payslip', 'Timesheet', 'Other'], description: 'Filter by document type' },
                        startDate: { type: 'string', format: 'date', description: 'Filter from date (YYYY-MM-DD)' },
                        endDate: { type: 'string', format: 'date', description: 'Filter to date (YYYY-MM-DD)' },
                        page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
                        limit: { type: 'number', minimum: 1, maximum: 100, default: 10, description: 'Items per page' }
                    }
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
                                        _id: { type: 'string' },
                                        employeeId: {
                                            type: 'object',
                                            properties: {
                                                _id: { type: 'string' },
                                                name: { type: 'string' },
                                                email: { type: 'string' },
                                                employeeId: { type: 'string' }
                                            }
                                        },
                                        type: { type: 'string', enum: ['AdminUpload'] },
                                        category: { type: 'string', enum: ['Payroll', 'Timesheet', 'Tax', 'EmployeeLifecycle', 'Certification'] },
                                        tags: {
                                            type: 'array',
                                            items: { type: 'string' }
                                        },
                                        fileName: { type: 'string' },
                                        filePath: { type: 'string' },
                                        uploadedBy: {
                                            type: 'object',
                                            properties: {
                                                _id: { type: 'string' },
                                                name: { type: 'string' },
                                                email: { type: 'string' }
                                            }
                                        },
                                        version: { type: 'number' },
                                        accessLevel: { type: 'string', enum: ['Private', 'Team', 'Public'] },
                                        status: { type: 'string', enum: ['Uploaded', 'Processing', 'Completed', 'Failed'] },
                                        metadata: {
                                            type: 'object',
                                            properties: {
                                                adminUpload: {
                                                    type: 'object',
                                                    properties: {
                                                        documentType: { type: 'string', enum: ['Payslip', 'Timesheet', 'Other'] },
                                                        documentName: { type: 'string' },
                                                        documentDate: { type: 'string', format: 'date-time' },
                                                        description: { type: 'string' },
                                                        uploadedAt: { type: 'string', format: 'date-time' }
                                                    }
                                                }
                                            }
                                        },
                                        auditLog: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    _id: { type: 'string' },
                                                    action: { type: 'string' },
                                                    performedBy: {
                                                        type: 'object',
                                                        properties: {
                                                            _id: { type: 'string' },
                                                            name: { type: 'string' },
                                                            email: { type: 'string' }
                                                        }
                                                    },
                                                    timestamp: { type: 'string', format: 'date-time' },
                                                    details: { type: 'string' }
                                                }
                                            }
                                        },
                                        uploadDate: { type: 'string', format: 'date-time' },
                                        createdAt: { type: 'string', format: 'date-time' },
                                        updatedAt: { type: 'string', format: 'date-time' }
                                    }
                                }
                            },
                            meta: {
                                type: 'object',
                                properties: {
                                    page: { type: 'number' },
                                    limit: { type: 'number' },
                                    total: { type: 'number' },
                                    totalPages: { type: 'number' }
                                }
                            }
                        }
                    }
                }
            }
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const query = request.query as any;
                const documentService = request.container!.documentService;

                const result = await documentService.getAdminUploadedDocuments({
                    employeeId: query.employeeId,
                    documentType: query.documentType,
                    startDate: query.startDate ? new Date(query.startDate) : undefined,
                    endDate: query.endDate ? new Date(query.endDate) : undefined,
                    page: query.page ? parseInt(query.page) : 1,
                    limit: query.limit ? parseInt(query.limit) : 10
                });

                return reply.status(200).send({
                    success: true,
                    data: result.documents,
                    meta: {
                        page: result.page,
                        limit: query.limit || 10,
                        total: result.total,
                        totalPages: result.totalPages
                    }
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error fetching admin uploaded documents:', errorMessage);
                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`
                });
            }
        }
    );

    /**
     * Update Admin Uploaded Document
     * PUT /documents/admin/uploads/:id
     */
    fastify.put<{ Params: { id: string }; Body: { documentType: string; documentDate: string; documentName: string; description?: string } }>(
        '/admin/uploads/:id',
        {
            onRequest: [authenticate],
            schema: {
                description: 'Update an admin uploaded document',
                tags: ['Documents'],
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'string', description: 'Document ID' }
                    }
                },
                body: {
                    type: 'object',
                    required: ['documentType', 'documentDate', 'documentName'],
                    properties: {
                        documentType: {
                            type: 'string',
                            enum: ['Payslip', 'Timesheet', 'Other'],
                            description: 'Type of document'
                        },
                        documentDate: {
                            type: 'string',
                            format: 'date',
                            description: 'Document date (YYYY-MM-DD)'
                        },
                        documentName: {
                            type: 'string',
                            description: 'Name of the document'
                        },
                        description: {
                            type: 'string',
                            description: 'Optional description'
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
                                    _id: { type: 'string' },
                                    employeeId: { type: 'object' },
                                    fileName: { type: 'string' },
                                    filePath: { type: 'string' },
                                    metadata: {
                                        type: 'object',
                                        properties: {
                                            adminUpload: {
                                                type: 'object',
                                                properties: {
                                                    documentType: { type: 'string' },
                                                    documentName: { type: 'string' },
                                                    documentDate: { type: 'string', format: 'date-time' },
                                                    description: { type: 'string' },
                                                    uploadedAt: { type: 'string', format: 'date-time' }
                                                }
                                            }
                                        }
                                    },
                                    updatedAt: { type: 'string', format: 'date-time' }
                                }
                            }
                        }
                    },
                    404: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean', default: false },
                            error: { type: 'string' }
                        }
                    }
                }
            }
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as { id: string };
                const { documentType, documentDate, documentName, description } = request.body as {
                    documentType: string;
                    documentDate: string;
                    documentName: string;
                    description?: string;
                };

                const documentService = request.container!.documentService;

                const updatedDocument = await documentService.updateAdminDocument(
                    id,
                    {
                        documentType: documentType as "Payslip" | "Timesheet" | "Other",
                        documentDate,
                        documentName,
                        description
                    }
                );

                return reply.status(200).send({
                    success: true,
                    data: updatedDocument
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error updating admin document:', errorMessage);

                if (errorMessage.includes('not found')) {
                    return reply.status(404).send({
                        success: false,
                        error: 'Document not found'
                    });
                }

                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`
                });
            }
        }
    );

    /**
     * Update Admin Uploaded Document with new file
     * PUT /documents/admin/uploads/:id/file
     */
    fastify.put<{ Params: { id: string } }>(
        '/admin/uploads/:id/file',
        {
            onRequest: [authenticate],
            schema: {
                description: 'Update an admin uploaded document with new file',
                tags: ['Documents'],
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'string', description: 'Document ID' }
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
                                    _id: { type: 'string' },
                                    employeeId: { type: 'object' },
                                    fileName: { type: 'string' },
                                    filePath: { type: 'string' },
                                    metadata: {
                                        type: 'object',
                                        properties: {
                                            adminUpload: {
                                                type: 'object',
                                                properties: {
                                                    documentType: { type: 'string' },
                                                    documentName: { type: 'string' },
                                                    documentDate: { type: 'string', format: 'date-time' },
                                                    description: { type: 'string' },
                                                    uploadedAt: { type: 'string', format: 'date-time' }
                                                }
                                            }
                                        }
                                    },
                                    updatedAt: { type: 'string', format: 'date-time' }
                                }
                            }
                        }
                    },
                    404: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean', default: false },
                            error: { type: 'string' }
                        }
                    }
                }
            }
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as { id: string };
                const documentService = request.container!.documentService;

                // Parse multipart form data
                const { body, files } = await parseMultipartForm(request);

                if (!files || files.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: 'No file uploaded'
                    });
                }

                const file = files[0];

                // Extract form data
                const documentType = body.documentType as string;
                const documentDate = body.documentDate as string;
                const documentName = body.documentName as string;
                const description = body.description as string;
                const employeeId = body.employeeId as string;

                if (!documentType || !documentDate || !documentName || !employeeId) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Missing required fields: documentType, documentDate, documentName, employeeId'
                    });
                }

                const updatedDocument = await documentService.updateAdminDocumentWithFile(
                    id,
                    {
                        file,
                        documentType: documentType as "Payslip" | "Timesheet" | "Other",
                        documentDate,
                        documentName,
                        description,
                        employeeId
                    }
                );

                return reply.status(200).send({
                    success: true,
                    data: updatedDocument
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error updating admin document with file:', errorMessage);

                if (errorMessage.includes('not found')) {
                    return reply.status(404).send({
                        success: false,
                        error: 'Document not found'
                    });
                }

                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`
                });
            }
        }
    );

    /**
     * Debug Admin Uploaded Document (temporary endpoint)
     * GET /documents/admin/uploads/:id/debug
     */
    fastify.get<{ Params: { id: string } }>(
        '/admin/uploads/:id/debug',
        {
            onRequest: [authenticate],
            schema: {
                description: 'Debug admin uploaded document (temporary)',
                tags: ['Documents'],
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'string', description: 'Document ID' }
                    }
                }
            }
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as { id: string };
                const documentService = request.container!.documentService;

                // Get raw document without population
                const rawDocument = await documentService.getDocumentByIdRaw(id);

                // Get populated document
                const populatedDocument = await documentService.getAdminUploadedDocuments({
                    employeeId: rawDocument.employeeId.toString(),
                    page: 1,
                    limit: 1
                });

                return reply.status(200).send({
                    success: true,
                    data: {
                        rawDocument: {
                            _id: rawDocument._id,
                            employeeId: rawDocument.employeeId,
                            type: rawDocument.type,
                            metadata: rawDocument.metadata
                        },
                        populatedDocument: populatedDocument.documents[0] || null
                    }
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return reply.status(500).send({
                    success: false,
                    error: `Debug error: ${errorMessage}`
                });
            }
        }
    );

    /**
     * Delete Admin Uploaded Document
     * DELETE /documents/admin/uploads/:id
     */
    fastify.delete<{ Params: { id: string } }>(
        '/admin/uploads/:id',
        {
            onRequest: [authenticate],
            schema: {
                description: 'Delete an admin uploaded document',
                tags: ['Documents'],
                security: [{ bearerAuth: [] }, { cookieAuth: [] }],
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'string', description: 'Document ID' }
                    }
                },
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            message: { type: 'string' }
                        }
                    },
                    404: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            error: { type: 'string' }
                        }
                    }
                }
            }
        },
        async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
            try {
                const { id } = request.params;

                // Find document
                const document = await Document.findById(id);
                if (!document) {
                    return reply.status(404).send({
                        success: false,
                        error: 'Document not found'
                    });
                }

                // Check if it's an admin upload
                if (document.type !== 'AdminUpload') {
                    return reply.status(400).send({
                        success: false,
                        error: 'Only admin uploaded documents can be deleted via this endpoint'
                    });
                }

                // Delete from database
                await Document.findByIdAndDelete(id);

                // Optional: Delete from GCP storage
                // await deleteFileFromGCP(document.filePath);

                return reply.status(200).send({
                    success: true,
                    message: 'Document deleted successfully'
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('Error deleting admin document:', errorMessage);
                return reply.status(500).send({
                    success: false,
                    error: `Internal server error: ${errorMessage}`
                });
            }
        }
    );

    // Admin: Upload Attendance File
    fastify.post(
        '/attendance/upload',
        {
            preHandler: [authenticate, filesUpload],
            schema: {
                consumes: ['multipart/form-data'],
                response: {
                    200: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean' },
                            data: {
                                type: 'object',
                                properties: {
                                    documentId: { type: 'string' },
                                    fileName: { type: 'string' },
                                    documentName: { type: 'string' },
                                    year: { type: 'number' },
                                    fileUrl: { type: 'string' }
                                }
                            },
                            message: { type: 'string' }
                        }
                    },
                    400: {
                        type: 'object',
                        properties: {
                            success: { type: 'boolean', const: false },
                            error: { type: 'string' }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                // Check if user is admin
                if (request.user.role?.toLowerCase() !== 'admin') {
                    return reply.status(403).send({
                        success: false,
                        error: 'Only admins can upload attendance files'
                    });
                }

                // Get uploaded file (filesUpload uses .any(), so files are in request.files array)
                const files = (request as any).files;
                if (!files || files.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: 'No file uploaded'
                    });
                }
                const file = files[0]; // Get the first file

                // Get form fields from request.body (multer already parsed them)
                const employeeId = (request.body as any)?.employeeId as string;
                const documentName = (request.body as any)?.documentName as string;
                const year = parseInt((request.body as any)?.year as string);
                const description = (request.body as any)?.description as string | undefined;

                // Validate required fields
                if (!employeeId || !documentName || !year) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Employee ID, document name and year are required'
                    });
                }

                // Validate year format
                if (isNaN(year)) {
                    return reply.status(400).send({
                        success: false,
                        error: 'Year must be a valid number'
                    });
                }

                // Validate employee exists
                const employee = await User.findById(employeeId).lean();
                if (!employee) {
                    return reply.status(404).send({
                        success: false,
                        error: 'Employee not found'
                    });
                }

                // Upload the file
                const document = await request.container!.documentService.uploadAttendanceFile(
                    file,
                    documentName,
                    year,
                    description,
                    new Types.ObjectId(employeeId),
                    new Types.ObjectId(request.user._id)
                );

                return reply.status(200).send({
                    success: true,
                    data: {
                        documentId: document._id.toString(),
                        fileName: document.fileName,
                        documentName: document.metadata.attendanceFile?.documentName,
                        year: document.metadata.attendanceFile?.year,
                        fileUrl: document.filePath
                    },
                    message: 'Attendance file uploaded successfully'
                });

            } catch (error: any) {
                console.error('Error uploading attendance file:', error);
                return reply.status(400).send({
                    success: false,
                    error: error.message || 'Failed to upload attendance file'
                });
            }
        }
    );

    /**
     * Send Offer Letter
     */
    fastify.post("/offer-letter/send", { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const { body, files } = await parseMultipartForm(request);
            if (!files || files.length === 0) {
                return reply.code(400).send({ success: false, error: "No file uploaded" });
            }

            const { uploadFileToGCP } = await import("../utilis/gcpStorage");
            const { promises: fsPromises } = await import("fs");
            const path = await import("path");

            const attachments = [];
            const tempPaths: string[] = [];

            for (const file of files) {
                const fileName = `OfferLetter_${Date.now()}_${file.filename}`;
                const tempPath = path.join(process.cwd(), "uploads", fileName);
                tempPaths.push(tempPath);

                await saveMultipartFile(file, tempPath);

                const gcpResult = await uploadFileToGCP({
                    filePath: tempPath,
                    fileName,
                    employeeId: "Offer",
                    category: "EmployeeLifecycle",
                    type: "OfferLetter"
                });

                if (gcpResult.success) {
                    attachments.push({
                        fileName: file.filename,
                        filePath: gcpResult.fileUrl!,
                        localPath: tempPath,
                        fieldname: file.fieldname
                    });
                }
            }

            const { documentService } = request.container!;
            const document = await documentService.sendOfferLetter({
                name: body.name,
                email: body.email,
                attachments,
                uploadedBy: (request as any).user._id
            });

            // Cleanup
            for (const p of tempPaths) {
                try { await fsPromises.unlink(p); } catch (e) { }
            }

            return { success: true, data: document };
        } catch (error: any) {
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    /**
     * Preview Hike Letter
     */
    fastify.post("/hike-letter/preview", { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const { parseMultipartForm, saveMultipartFile } = await import("../utilis/parseMultiPartForm");
            const { body, files } = await parseMultipartForm(request);
            const { documentService } = request.container!;

            // Handle both single employeeId and multiple employeeIds
            let employeeIds: string[] = [];
            if (body.employeeIds) {
                employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds : JSON.parse(body.employeeIds);
            } else if (body.employeeId) {
                employeeIds = [body.employeeId];
            }

            if (employeeIds.length === 0) {
                throw new Error("No employees selected for preview");
            }

            const signatureFile = files.find(f => f.fieldname === 'signature');

            const tempFiles: string[] = [];
            let signaturePath: string | undefined;

            const { promises: fsPromises } = await import("fs");
            const path = await import("path");
            const uploadsDir = path.resolve(process.cwd(), "uploads");

            if (signatureFile) {
                signaturePath = path.join(uploadsDir, `sig_prev_${Date.now()}_${signatureFile.filename}`);
                await saveMultipartFile(signatureFile, signaturePath);
                tempFiles.push(signaturePath);
            } else if (body.signatureBase64) {
                const match = body.signatureBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
                if (match) {
                    const ext = match[1];
                    const base64Data = match[2];
                    const buffer = Buffer.from(base64Data, 'base64');
                    signaturePath = path.join(uploadsDir, `sig_prev_cached_${Date.now()}.${ext}`);
                    await fsPromises.writeFile(signaturePath, buffer);
                    tempFiles.push(signaturePath);
                }
            }

            const result = await documentService.previewHikeLetter({
                employeeIds,
                signatory: {
                    name: body.signatoryName,
                    designation: body.signatoryDesignation,
                    signaturePath
                }
            });

            // Cleanup
            for (const f of tempFiles) {
                try { await fsPromises.unlink(f); } catch (e) { }
            }

            return { success: true, data: result };
        } catch (error: any) {
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    /**
     * Generate and Send Hike Letter
     */
    fastify.post("/hike-letter/generate-send", { preHandler: [authenticate] }, async (request, reply) => {
        try {
            const { parseMultipartForm, saveMultipartFile } = await import("../utilis/parseMultiPartForm");
            const { body, files } = await parseMultipartForm(request);
            const { documentService } = request.container!;

            // Handle both single employeeId and multiple employeeIds
            let employeeIds: string[] = [];
            if (body.employeeIds) {
                employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds : JSON.parse(body.employeeIds);
            } else if (body.employeeId) {
                employeeIds = [body.employeeId];
            }

            if (employeeIds.length === 0) {
                throw new Error("No employees selected");
            }

            const signatureFile = files.find(f => f.fieldname === 'signature');

            const tempFiles: string[] = [];
            let signaturePath: string | undefined;
            let signatureBase64ForDb: string | undefined = body.signatureBase64;

            const { promises: fsPromises } = await import("fs");
            const path = await import("path");
            const uploadsDir = path.resolve(process.cwd(), "uploads");

            if (signatureFile) {
                signaturePath = path.join(uploadsDir, `sig_${Date.now()}_${signatureFile.filename}`);
                await saveMultipartFile(signatureFile, signaturePath);
                tempFiles.push(signaturePath);

                // Convert newly uploaded signature into Base64 for the database cache natively
                const sigBuffer = await fsPromises.readFile(signaturePath);
                const ext = path.extname(signatureFile.filename).slice(1) || 'png';
                signatureBase64ForDb = `data:image/${ext};base64,${sigBuffer.toString('base64')}`;
            } else if (body.signatureBase64) {
                // If a cached base64 signature was provided, rehydrate it into a physical temp file for the PDF Generator
                const match = body.signatureBase64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
                if (match) {
                    const ext = match[1];
                    const base64Data = match[2];
                    const buffer = Buffer.from(base64Data, 'base64');
                    signaturePath = path.join(uploadsDir, `sig_cached_${Date.now()}.${ext}`);
                    await fsPromises.writeFile(signaturePath, buffer);
                    tempFiles.push(signaturePath);
                }
            }

            // 1. Handle Dispatch ID for Campaign Grouping
            let dispatchId = body.dispatchId;
            if (!dispatchId) {
                dispatchId = `Hike_Batch_${Date.now()}`;
            }

            const results = [];

            for (const empId of employeeIds) {
                try {
                    console.error("DEBUG_HIKE_ROUTE: body is", body);
                    console.error("DEBUG_HIKE_ROUTE: batchName is", body.batchName);
                    const result = await documentService.generateAndSendHikeLetter({
                        employeeId: empId,
                        signatory: {
                            name: body.signatoryName,
                            designation: body.signatoryDesignation,
                            signaturePath
                        },
                        adminId: (request as any).user._id,
                        dispatchId,
                        batchName: body.batchName,
                        percentageIncrease: body.percentageIncrease ? Number(body.percentageIncrease) : undefined,
                        signatureBase64: signatureBase64ForDb
                    });
                    results.push({ employeeId: empId, success: true, document: result });
                } catch (err: any) {
                    results.push({ employeeId: empId, success: false, error: err.message });
                }
            }

            // Cleanup
            for (const f of tempFiles) {
                try { await fsPromises.unlink(f); } catch (e) { }
            }

            return {
                success: true,
                data: {
                    total: employeeIds.length,
                    successful: results.filter(r => r.success).length,
                    results
                }
            };
        } catch (error: any) {
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

}


/*
| Action                          | Method | Path                                 | Notes                                     |
| -------------------------------|--------|--------------------------------------|-------------------------------------------|
| Generate Payslip               | POST   | `/documents/payslip/generate`        | Requires: userId, month, year             |
| Generate Timesheet             | POST   | `/documents/timesheet/generate`      | Requires: userId, month, year             |
| Send Payslip to Employees      | POST   | `/documents/payslip/send`            | Bulk or individual sends                  |
| My Payslips                    | GET    | `/documents/my/payslips`             | Query: month, year                        |
| My Timesheets                  | GET    | `/documents/my/timesheets`           | Query: month, year                        |
| My Form 16                     | GET    | `/documents/my/form16`               | Query: financialYear                      |
| Admin: Get Payslips for Users  | POST   | `/documents/payslip/query`           | Query: userIds[], month, year             |
| Admin: Upload Form 16 ZIP      | POST   | `/documents/form16/upload`           | .zip file named by PAN                    |
| Admin: Get Documents (All)     | GET    | `/documents`                         | Query: type, category, userId, year, etc. |
| Admin: Delete Document         | DELETE | `/documents/:id`                     | Delete by Document ID                     |
| Admin: Document Audit Log      | GET    | `/documents/:id/audit-log`           | Returns array of audit trail              |
| Get Payslips for Users (Bulk)  | POST   | `/documents/payslip/search`          | userIds[], month, year in body            |


# Get own documents
GET /documents?access=own

# Manager getting team documents
GET /documents?access=team

# Admin getting all documents for specific employee
GET /documents?access=global&employeeId=679235bfa892ecaccad0ccd5

# Filter by type and date
GET /documents?access=own&type=Payslip&year=2024&month=12
*/
