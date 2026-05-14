import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import {
    initializeFinalSettlement,
    saveFinalSettlement,
    getFinalSettlement,
    getAllFinalSettlements,
    confirmFinalSettlement,
    deleteFinalSettlement,
    calculateFinalSettlement,
    unlockFinalSettlement,
    downloadSettlementFile
} from '../services/final-settlement.service';

export default async function finalSettlementRoutes(fastify: FastifyInstance) {

    // Get All Final Settlements (List with Pagination)
    fastify.get('/final-settlement', {
        onRequest: [authenticate],
        schema: {
            description: 'Get all final settlements with pagination and search',
            tags: ['Final Settlement'],
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 10 },
                    status: { type: 'string', enum: ['Draft', 'Confirmed'] },
                    search: { type: 'string', description: 'Search by employee name, code, or status' } // ✅ Updated
                }
            }
        }
    }, getAllFinalSettlements as any);

    // Initialize Final Settlement (Auto-fill)
    fastify.get('/final-settlement/initialize/:employeeId', {
        onRequest: [authenticate],
        schema: {
            description: 'Initialize final settlement with auto-filled data from payroll, leave, and resignation records',
            tags: ['Final Settlement'],
            params: {
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'string', description: 'Employee ID' }
                }
            }
        }
    }, initializeFinalSettlement as any);

    // Save/Update Final Settlement (Draft)
    fastify.post('/final-settlement/save/:employeeId', {
        onRequest: [authenticate],
        schema: {
            description: 'Save or update final settlement as draft',
            tags: ['Final Settlement'],
            params: {
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'string', description: 'Employee ID' }
                }
            },
            body: {
                type: 'object',
                // employeeId is optional in body now since it's in params, but can remain for compatibility
                properties: {
                    employeeName: { type: 'string' },
                    employeeCode: { type: 'string' },
                    resignationSubmittedOn: { type: 'string', format: 'date-time' },
                    leavingDate: { type: 'string', format: 'date-time' },
                    leavingReason: { type: 'string' },
                    settlementDate: { type: 'string', format: 'date-time' },
                    noticeRequired: { type: 'boolean' },
                    noticePeriodDays: { type: 'number' },
                    daysServed: { type: 'number' },
                    excessInNotice: { type: 'number' },
                    noticePeriodRecovery: { type: 'number' },
                    mode: { type: 'string', enum: ['automatic', 'manual'] },
                    initiatedBy: { type: 'string' }
                }
            }
        }
    }, saveFinalSettlement as any);

    // Get Final Settlement
    fastify.get('/final-settlement/:employeeId', {
        onRequest: [authenticate],
        schema: {
            description: 'Get final settlement for an employee',
            tags: ['Final Settlement'],
            params: {
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'string', description: 'Employee ID' }
                }
            }
        }
    }, getFinalSettlement as any);

    // Confirm Final Settlement
    fastify.post('/final-settlement/confirm/:employeeId', {
        onRequest: [authenticate],
        schema: {
            description: 'Confirm final settlement and change status from Draft to Confirmed',
            tags: ['Final Settlement'],
            params: {
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'string', description: 'Employee ID' }
                }
            },
            body: {
                type: 'object',
                required: ['confirmedBy'],
                properties: {
                    confirmedBy: { type: 'string', description: 'Admin user ID who confirmed' }
                },
                additionalProperties: true
            }
        }
    }, confirmFinalSettlement as any);

    // Delete Final Settlement Draft
    fastify.delete('/final-settlement/:employeeId', {
        onRequest: [authenticate],
        schema: {
            description: 'Delete final settlement draft',
            tags: ['Final Settlement'],
            params: {
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'string', description: 'Employee ID' }
                }
            }
        }
    }, deleteFinalSettlement as any);

    // Calculate Final Settlement
    fastify.post('/final-settlement/calculate', {
        onRequest: [authenticate],
        schema: {
            description: 'Calculate final settlement totals based on provided data',
            tags: ['Final Settlement'],
            body: {
                type: 'object',
                properties: {
                    holdPayrolls: { type: 'array' },
                    unpaidMonths: { type: 'array' },
                    leaveBalance: { type: 'array' },
                    reimbursements: { type: 'array' },
                    otherAdditions: { type: 'array' },
                    otherDeductions: { type: 'array' },
                    noticePeriodRecovery: { type: 'number' }
                }
            }
        }
    }, calculateFinalSettlement as any);

    // Unlock (Re-open) Final Settlement
    fastify.post('/final-settlement/unlock/:employeeId', {
        onRequest: [authenticate],
        schema: {
            description: 'Unlock a confirmed final settlement to return it to Draft status for editing',
            tags: ['Final Settlement'],
            params: {
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'string', description: 'Employee ID' }
                }
            },
            body: {
                type: 'object',
                required: ['unlockedBy'],
                properties: {
                    unlockedBy: { type: 'string', description: 'Admin user ID who unlocked' }
                }
            }
        }
    }, unlockFinalSettlement as any);

    // Download Settlement File (GCP stream with forced download headers)
    fastify.get('/final-settlement/download-file', {
        onRequest: [authenticate],
        schema: {
            description: 'Download a settlement file (PDF) from GCP storage with forced download headers',
            tags: ['Final Settlement'],
            querystring: {
                type: 'object',
                required: ['filePath'],
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'GCP object path, e.g. 69cb.../Settlement/FNF_EMP15_xxx.pdf'
                    }
                }
            }
        }
    }, downloadSettlementFile as any);
}
