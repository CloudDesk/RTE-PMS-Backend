import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
// import { ReportService } from '../services/reports.service';
import { Types } from 'mongoose';

// Define the request types
interface CreateReportRequest {
    Body: {
        _id?: string;
        name: string;
        apiName: string;
        description?: string;
        object: string;
        fields: Array<{
            apiName: string;
            fieldType: string;
            label: string;
            referenceTo: string;
        }>;
        filters?: Array<{
            field: string;
            condition: string;
            value: string;
            nestedFields: string[];
            subFilters: any[];
            isNestedObject: boolean;
        }>;
        filterLogic?: string;
        sortFields?: Array<{
            field: string;
            order: "Ascending" | "Descending";
        }>;
        limit?: number;
        preview?: any;
    };
}

interface GetReportsRequest {
    Querystring: {
        name?: string;
        apiName?: string;
        object?: string;
        description?: string;
        search?: string; // General search across multiple fields
        page?: number;
        limit?: number;
    };
}
interface GetReportByIdRequest {
    Params: {
        id: string;
    }
}
interface ExecuteReportRequest {
    Body: {
        reportId?: string;
        query?: string;
        parameters?: Record<string, any>;
    };
}

export const reportRoutes = async (
    fastify: FastifyInstance,
    _opts: FastifyPluginOptions,
): Promise<void> => {
    // Create or Update a Report
    fastify.post<CreateReportRequest>(
        '/',
        async (request, reply) => {
            try {
                // Validate required fields
                const { name, apiName, object, fields } = request.body;
                if (!name || !apiName || !object || !fields || !Array.isArray(fields)) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'Missing required fields: name, apiName, object, and fields are required' }
                    });
                }

                // Check if this is an update operation
                if (request.body._id) {
                    const updatedReport = await request.container!.reportService.updateReport(request.body._id, request.body);
                    return reply.send({
                        success: true,
                        data: updatedReport,
                    });
                } else {
                    // This is a create operation
                    const newReport = await request.container!.reportService.createReport(request.body);
                    return reply.status(201).send({
                        success: true,
                        data: newReport,
                    });
                }
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );

    // Get All Reports with filters and pagination
    fastify.get<GetReportsRequest>(
        '/',
        async (request, reply) => {
            try {
                const { name, apiName, object, description, search, page = 1, limit = 10 } = request.query;
                const filter: Record<string, any> = {};

                // Apply specific field filters if provided
                if (name) filter.name = { $regex: name, $options: 'i' };
                if (apiName) filter.apiName = { $regex: apiName, $options: 'i' };
                if (object) filter.object = object;
                if (description) filter.description = { $regex: description, $options: 'i' };

                // Apply general search across multiple fields if provided
                if (search) {
                    const searchRegex = { $regex: search, $options: 'i' };
                    filter.$or = [
                        { name: searchRegex },
                        { apiName: searchRegex },
                        { description: searchRegex },
                        { object: searchRegex }
                    ];
                }

                const skip = (page - 1) * limit;

                const reports = await request.container!.reportService.getReports(filter, skip, limit);
                const total = await request.container!.reportService.countReports(filter);

                return reply.send({
                    success: true,
                    data: reports,
                    pagination: {
                        total,
                        page,
                        limit,
                        totalPages: Math.ceil(total / limit)
                    }
                });
            } catch (error: any) {
                return reply.status(500).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );

    // Execute Report Query
    fastify.post<ExecuteReportRequest>(
        '/execute',
        async (request, reply) => {
            try {
                const { reportId, query, parameters } = request.body;

                if (!reportId && !query) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'Either reportId or query must be provided' }
                    });
                }

                // Security check - ensure the reportId is a valid ObjectId
                if (reportId && !Types.ObjectId.isValid(reportId)) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: 'Invalid report ID format' }
                    });
                }

                const results = await request.container!.reportService.executeReport(reportId, query, parameters);
                console.log(results, "result in routes")
                return reply.send({
                    success: true,
                    data: results.data,
                    metadata: {
                        count: results.count,
                        query: results.queryExecuted
                    }
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );

    //get by id
    fastify.get<{ Params: { id: string } }>(
        '/:id',
        async (request: FastifyRequest<GetReportByIdRequest>, reply) => {
            console.log("getRecbyId", request.params)
            try {
                const report = await request.container!.reportService.getReportById(request.params.id);
                return reply.send({
                    success: true,
                    data: report
                });
            } catch (error: any) {
                if (error.message === 'Report not found') {
                    return reply.status(404).send({
                        success: false,
                        error: { message: error.message }
                    });
                }
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    // Get readable query string for a report
    fastify.get<{ Params: { id: string } }>(
        '/:id/query',
        async (request: FastifyRequest<GetReportByIdRequest>, reply) => {
            try {
                const queryInfo = await request.container!.reportService.getReadableQueryString(request.params.id);
                return reply.send({
                    success: true,
                    data: queryInfo
                });
            } catch (error: any) {
                if (error.message === 'Report not found') {
                    return reply.status(404).send({
                        success: false,
                        error: { message: error.message }
                    });
                }
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );
};