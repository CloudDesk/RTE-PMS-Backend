// routes/timesheetRoutes.ts
import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { ITimesheet, ITaskEntry } from '../models/timesheet.model';

// Define request body type for POST (subset of ITimesheet)
interface ITimesheetRequestBody {
    userId: string;
    dateUTC: string; // Date in UTC format
    entries: ITaskEntry[];
}

// Define response type
interface IApiResponse<T> {
    success: boolean;
    data?: T;
    error?: { message: string };
    message?: string;
}

interface ITimesheetGenerate {
    userId: string;
    month: number;
    year: number;
}

export const timesheetRoutes = async (
    fastify: FastifyInstance,
    _opts: FastifyPluginOptions
): Promise<void> => {
    // POST /timesheet - Insert or Update Timesheet
    fastify.post<{ Body: ITimesheetRequestBody }>('/', async (
        request: FastifyRequest<{ Body: ITimesheetRequestBody }>,
        reply: FastifyReply
    ) => {
        console.log(request.body, "timesheetRoutes request.body");
        try {
            const { userId, dateUTC, entries } = request.body;
            const timesheet = await request.container!.timesheetService.createOrUpdate({ userId, dateUTC, entries });
            return reply.send({
                success: true,
                data: timesheet,
            } as IApiResponse<ITimesheet>);
        } catch (error) {
            return reply.status(400).send({
                success: false,
                error: { message: (error as Error).message },
            } as IApiResponse<never>);
        }
    });

    // GET /timesheet? - Get Timesheets by Month/Year or Range
    fastify.get<{ Querystring: { userId: string; month?: string; year?: string; startDate?: string; endDate?: string } }>('/', async (
        request: FastifyRequest<{ Querystring: { userId: string; month?: string; year?: string; startDate?: string; endDate?: string } }>,
        reply: FastifyReply
    ) => {
        try {
            const { userId, month, year, startDate, endDate } = request.query;
            const timesheets = await request.container!.timesheetService.getTimesheetsByRange({
                userId,
                month: month ? parseInt(month) : undefined,
                year: year ? parseInt(year) : undefined,
                startDate,
                endDate,
            });
            return reply.send({
                success: true,
                data: timesheets,
            } as IApiResponse<ITimesheet[]>);
        } catch (error) {
            return reply.status(400).send({
                success: false,
                error: { message: (error as Error).message },
            } as IApiResponse<never>);
        }
    });

    // GET /timesheet/by-date? - Get Specific Day’s Timesheet
    fastify.get<{ Querystring: { userId: string; dateUTC: string } }>('/by-date', async (
        request: FastifyRequest<{ Querystring: { userId: string; dateUTC: string } }>,
        reply: FastifyReply
    ) => {
        try {
            const { userId, dateUTC } = request.query;
            const timesheet = await request.container!.timesheetService.getTimesheetByDate({ userId, dateUTC: new Date(dateUTC) });
            if (!timesheet) {
                return reply.status(404).send({
                    success: false,
                    error: { message: 'Timesheet not found' },
                } as IApiResponse<never>);
            }
            return reply.send({
                success: true,
                data: timesheet,
            } as IApiResponse<ITimesheet>);
        } catch (error) {
            return reply.status(400).send({
                success: false,
                error: { message: (error as Error).message },
            } as IApiResponse<never>);
        }
    });

    // DELETE /timesheet/:recordId - Delete Timesheet
    fastify.delete<{ Params: { recordId: string } }>('/:recordId', async (
        request: FastifyRequest<{ Params: { recordId: string } }>,
        reply: FastifyReply
    ) => {
        try {
            const { recordId } = request.params;
            const result = await request.container!.timesheetService.deleteTimesheet(recordId);
            if (!result) {
                return reply.status(404).send({
                    success: false,
                    error: { message: 'Timesheet not found' },
                } as IApiResponse<never>);
            }
            return reply.send({
                success: true,
                message: 'Timesheet deleted successfully',
            } as IApiResponse<never>);
        } catch (error) {
            return reply.status(400).send({
                success: false,
                error: { message: (error as Error).message },
            } as IApiResponse<never>);
        }
    });

    // GET /timesheet/report - Timesheet Summary Report
    fastify.get<{ Querystring: { userId: string; month?: string; year?: string; startDate?: string; endDate?: string } }>('/report', async (
        request: FastifyRequest<{ Querystring: { userId: string; month?: string; year?: string; startDate?: string; endDate?: string } }>,
        reply: FastifyReply
    ) => {
        try {
            const { userId, month, year, startDate, endDate } = request.query;
            const report = await request.container!.timesheetService.getTimesheetReport({
                userId,
                month: month ? parseInt(month) : undefined,
                year: year ? parseInt(year) : undefined,
                startDate,
                endDate,
            });
            return reply.send({
                success: true,
                data: report,
            } as IApiResponse<any>);
        } catch (error) {
            return reply.status(400).send({
                success: false,
                error: { message: (error as Error).message },
            } as IApiResponse<never>);
        }
    });

    fastify.get("/all", async (request, reply) => {
        try {
            const timesheets = await request.container!.timesheetService.getAllTimesheets();
            return reply.send({
                success: true,
                data: timesheets,
            } as IApiResponse<ITimesheet[]>);
        } catch (error) {
            return reply.status(400).send({
                success: false,
                error: { message: (error as Error).message },
            } as IApiResponse<never>);
        }
    });

    //generate timesheet
    fastify.post("/generate", async (request, reply) => {
        try {
            const { userId, month, year } = request.body as ITimesheetGenerate;
            const timesheet = await request.container!.timesheetService.generateTimesheet(userId, month, year, request);
            console.log(timesheet, "timesheetRoutes timesheet");
            return reply.send({
                success: true,
                data: timesheet,
            } as any);
        } catch (error) {
            return reply.status(400).send({
                success: false,
                error: { message: (error as Error).message },
            } as IApiResponse<never>);
        }
    })



};

// Register the routes in your main app
// import { timesheetRoutes } from './routes/timesheetRoutes';
// fastify.register(timesheetRoutes, { prefix: '/timesheet' });