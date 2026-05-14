import { FastifyInstance, } from "fastify";
import { authenticate } from "../middleware/auth";
import { ITaxDeclarationCreate, ITaxDeclarationUpdate, IMigrationAdjustmentInput } from "../services/tax-declaration.service";
import { Types } from "mongoose";
import { filesUpload } from "../config/multer";
import * as xlsx from 'xlsx';
import fs from 'fs';

export async function taxDeclarationRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/hra-context/:employeeId',
        { preHandler: [authenticate] },
        async (request, reply) => {
            try {
                const { employeeId } = request.params as { employeeId: string };
                const { financialYear } = request.query as { financialYear?: string };

                if (!financialYear) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'financialYear is required' },
                    });
                }

                const data = await request.container!.taxSalaryContextService.getHraContext(
                    employeeId,
                    financialYear,
                );

                return reply.send({
                    success: true,
                    data,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )
    //get all tax declarations
    fastify.get('/', { preHandler: [authenticate] },
        async (request, reply) => {
            console.log(request.query, "request salary structre");
            const { page, limit, search, financialYear, isSubmissionsEnabled, isMigrationAdjusted, isMigrationInitialized } = request.query as {
                page?: number;
                limit?: number;
                search?: string;
                financialYear?: string;
                isSubmissionsEnabled?: boolean;
                isMigrationAdjusted?: boolean;
                isMigrationInitialized?: boolean;
            };
            console.log(page, limit, search, financialYear, "*****")

            try {
                const result = await request.container!.taxDeclarationService.findAll({
                    page,
                    limit,
                    search,
                    financialYear,
                    isSubmissionsEnabled,
                    isMigrationAdjusted,
                    isMigrationInitialized
                });
                return reply.send({
                    success: true,
                    data: result.taxDeclarations,
                    meta: result.meta
                })
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )
    //create a new tax declaration
    fastify.post('/', { preHandler: [authenticate] },
        async (request, reply) => {
            try {
                const taxDeclaration = await request.container!.taxDeclarationService.create(request.body as ITaxDeclarationCreate);
                return reply.send({
                    success: true,
                    data: taxDeclaration,
                })
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )
    //update a tax declaration
    fastify.put('/:id', { preHandler: [authenticate] },
        async (request, reply) => {
            try {
                const taxDeclaration = await request.container!.taxDeclarationService.update(request.body as ITaxDeclarationUpdate);
                return reply.send({
                    success: true,
                    data: taxDeclaration,
                })
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )
    //get deduction sections (section + subsection config aligned with FE)
    fastify.get('/sections', { preHandler: [authenticate] },
        async (request, reply) => {
            try {
                const sections = request.container!.taxDeclarationService.getDeductionSections();
                return reply.send({
                    success: true,
                    data: sections,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )
    //get a tax declaration Current FY and userId
    fastify.get('/user/:userId/current-fy', { preHandler: [authenticate] },
        async (request, reply) => {
            console.log("first", request.params)
            try {
                const { userId }: any = request.params;
                console.log(userId, "userId")
                const declaration = await request.container!.taxDeclarationService.getUserCurrentFY(new Types.ObjectId(userId));
                if (!declaration) {
                    return reply.status(404).send({
                        success: false,
                        error: {
                            message: 'Tax declaration not found'
                        }
                    });
                }
                return reply.send({
                    success: true,
                    data: declaration,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )
    //Tax declartion -declarations documents
    fastify.post<{ Params: { id: string } }>('/:id/update-documents',
        {
            preHandler: [authenticate, filesUpload],
        },
        async (request, reply) => {
            console.log(request.files, "req files")
            try {
                const { id } = request.params;
                console.log(id, "id")

                let taxDeclaration = await request.container!.taxDeclarationService.updateDocuments(new Types.ObjectId(id), request)
                console.log(taxDeclaration, "taxDeclaration routes")
                return reply.send({
                    success: true,
                    data: taxDeclaration
                });

            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    )
    //Tax declartion -review declarations documents
    fastify.post<{ Params: { id: string } }>('/:id/review',
        {
            preHandler: [authenticate],
        },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const updateData = {
                    ...(request.body as any),
                    userInfo: { _id: (request.user as any)._id, name: (request.user as any).name, email: (request.user as any).email },
                };

                let taxDeclaration = await request.container!.taxDeclarationService.reviewDeclarations(new Types.ObjectId(id), updateData)
                console.log(taxDeclaration, "taxDeclaration routes")
                return reply.send({
                    success: true,
                    data: taxDeclaration
                });

            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    )

    // Bulk enable Form12B for migration (Admin only - one-time operation)
    fastify.post('/bulk-enable-form12b',
        {
            preHandler: [authenticate]
        },
        async (request, reply) => {
            try {
                const { employeeIds, financialYear } = request.body as {
                    employeeIds: string[];
                    financialYear: string;
                };

                // Validate input
                if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'employeeIds must be a non-empty array' }
                    });
                }

                if (!financialYear) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'financialYear is required' }
                    });
                }

                const result = await request.container!.taxDeclarationService.bulkEnableForm12B({
                    employeeIds,
                    financialYear
                });

                return reply.send({
                    success: result.success,
                    message: `Form12B enabled for ${result.updated} employee(s)`,
                    data: {
                        updated: result.updated,
                        failed: result.failed.length,
                        failedEmployees: result.failed,
                        details: result.details
                    }
                });

            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    )

    // Bulk create tax declarations for migration (Admin only - one-time operation)
    fastify.post('/bulk-create',
        {
            preHandler: [authenticate]
        },
        async (request, reply) => {
            try {
                const { employeeIds, financialYear, regime } = request.body as {
                    employeeIds: string[];
                    financialYear: string;
                    regime: 'new' | 'old';
                };

                // Validate input
                if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'employeeIds must be a non-empty array' }
                    });
                }

                if (!financialYear) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'financialYear is required' }
                    });
                }

                if (!regime || (regime !== 'new' && regime !== 'old')) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'regime must be either "new" or "old"' }
                    });
                }

                const result = await request.container!.taxDeclarationService.bulkCreateTaxDeclarations({
                    employeeIds,
                    financialYear,
                    regime
                });

                return reply.send({
                    success: result.success,
                    message: `Created: ${result.created}, Skipped: ${result.skipped}, Failed: ${result.failed}`,
                    data: {
                        created: result.created,
                        skipped: result.skipped,
                        skippedEmployees: result.skippedEmployees,
                        failed: result.failed,
                        failedEmployees: result.failedEmployees,
                        details: result.details
                    }
                });

            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    )

    // Migration Adjustment Upload (Admin only - December 2025)

    // Download Migration Template
    fastify.get('/migration-adjustment/template',
        {
            preHandler: [authenticate]
        },
        async (request, reply) => {
            try {
                const buffer = await request.container!.taxDeclarationService.generateMigrationTemplate();

                reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                reply.header('Content-Disposition', 'attachment; filename="migration_adjustment_template.xlsx"');

                return reply.send(buffer);
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    )

    // Migration Adjustment Upload - PREVIEW (Admin only - December 2025)
    fastify.post('/migration-adjustment/preview',
        {
            onRequest: [authenticate, filesUpload]
        },
        async (request, reply) => {
            try {
                // 1. Check if file is uploaded
                const files = (request as any).files;

                console.log('[MIGRATION PREVIEW] Files received:', files);
                if (files) {
                    console.log('[MIGRATION PREVIEW] Files type:', typeof files);
                    console.log('[MIGRATION PREVIEW] Is array:', Array.isArray(files));
                    if (Array.isArray(files)) {
                        console.log('[MIGRATION PREVIEW] Files length:', files.length);
                    }
                }

                if (!files || !Array.isArray(files) || files.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'No Excel file uploaded or invalid file format' }
                    });
                }

                const file = files[0];
                console.log('[MIGRATION PREVIEW] Uploaded file details:', {
                    fieldname: file.fieldname,
                    originalname: file.originalname,
                    path: file.path,
                    size: file.size
                });

                // 2. Parse Excel file (Read from disk since we use diskStorage)
                if (!file.path) {
                    throw new Error('File path not found. Multer might be misconfigured.');
                }

                if (!fs.existsSync(file.path)) {
                    throw new Error(`File not found on disk at ${file.path}`);
                }

                const fileBuffer = fs.readFileSync(file.path);
                const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = xlsx.utils.sheet_to_json(worksheet);

                if (!jsonData || jsonData.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'Excel file is empty or invalid' }
                    });
                }

                // 3. Transform to IMigrationAdjustmentInput format
                const migrationData: IMigrationAdjustmentInput[] = jsonData.map((row: any) => ({
                    employeeId: row.user,
                    regime: row.regime?.toUpperCase(), // Normalize case
                    financialYear: row.FY,
                    externalTaxPaid: Number(row.tax_paid_amount || 0),
                    externalTaxPaidMonths: Number(row.tax_paid_months || 0),
                    newSystemTaxToPay: Number(row.tax_to_be_paid_amount || 0),
                    newSystemTaxMonths: Number(row.tax_to_be_paid_months || 0)
                }));

                // 4. Get validation preview
                const previewResult = await request.container!.taxDeclarationService.previewMigrationAdjustment(migrationData);

                // Clean up the temporary file (standard practice for bulk uploads)
                try {
                    fs.unlinkSync(file.path);
                    console.log('[MIGRATION PREVIEW] Temporary file cleaned up');
                } catch (cleanupError) {
                    console.warn('[MIGRATION PREVIEW] Failed to cleanup file:', cleanupError);
                }

                return reply.status(200).send({
                    success: true,
                    data: previewResult,
                    message: `Parsed ${migrationData.length} rows. Found ${previewResult.summary.validRows} valid rows.`
                });

            } catch (error: any) {
                console.error('[MIGRATION PREVIEW ERROR]', error);
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    )

    // Migration Adjustment Upload - CONFIRM (Admin only - December 2025)
    fastify.post('/migration-adjustment/confirm',
        {
            preHandler: [authenticate]
        },
        async (request, reply) => {
            try {
                const { validRows } = request.body as { validRows: IMigrationAdjustmentInput[] };

                if (!validRows || validRows.length === 0) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'No valid rows provided for confirmation' }
                    });
                }

                // Apply migration adjustment to the confirmed rows
                const result = await request.container!.taxDeclarationService.applyMigrationAdjustment(
                    validRows,
                    (request.user as any)._id.toString()
                );

                return reply.status(200).send({
                    success: result.success,
                    message: `Migration completed. Processed: ${result.processed}, Failed: ${result.failed}`,
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

    // Initialize Migration Tax (Even split across 12 months, optionally lock past months)
    fastify.post<{ Params: { id: string }, Body: { uptoMonth?: string, lockPastMonths?: boolean } }>('/:id/initialize-migration',
        {
            preHandler: [authenticate]
        },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const { uptoMonth, lockPastMonths = true } = request.body || {};

                const result = await request.container!.taxDeclarationService.initializeMigrationTax(
                    new Types.ObjectId(id),
                    lockPastMonths ? (uptoMonth || "Jan") : undefined,
                    request.user?._id ? new Types.ObjectId(request.user._id) : undefined,
                    lockPastMonths
                );

                return reply.send({
                    success: true,
                    message: lockPastMonths
                        ? `Tax successfully even-split and locked upto ${uptoMonth || "Jan"}`
                        : "Tax successfully even-split across all 12 months without locking any month",
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

    // Toggle Submissions Window
    fastify.post<{ Params: { id: string }, Body: { enabled: boolean } }>('/:id/toggle-submissions',
        {
            preHandler: [authenticate]
        },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const { enabled } = request.body;
                const result = await request.container!.taxDeclarationService.toggleSubmissions(new Types.ObjectId(id), enabled);
                return reply.send({
                    success: true,
                    message: `Submissions ${enabled ? 'enabled' : 'disabled'} for user`,
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

    // Mass Reject Unverified Proofs (Deadline reached)
    fastify.post<{ Params: { id: string } }>('/:id/bulk-reject-proofs',
        {
            preHandler: [authenticate]
        },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const result = await request.container!.taxDeclarationService.bulkRejectMissingProofs(new Types.ObjectId(id));
                return reply.send({
                    success: true,
                    message: "All unverified declarations have been rejected by the system.",
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
}
