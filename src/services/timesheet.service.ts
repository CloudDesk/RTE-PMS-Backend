import fs from 'fs/promises';
import path from 'path';
import { User } from '../models';
import { ITaskEntry, ITimesheet, Timesheet, } from '../models/timesheet.model';
import ExcelJS from 'exceljs';
import { TimesheetFile } from '../models/timesheet-file.model';
import { FastifyRequest } from 'fastify';
import mongoose from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';

interface ITimesheetUpsert {
    userId: string;
    dateUTC: string; // Date in UTC format
    entries: ITaskEntry[];
}

interface ITimesheetGet {
    userId: string;
    month?: number;
    year?: number;
    startDate?: string;
    endDate?: string;
}

interface ITimesheetByDate {
    userId: string;
    dateUTC: Date;
}

interface ITimesheetReportEntry {
    userId: string;
    project: string;
    totalHours: number;
}

const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export class TimesheetService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }
    async createOrUpdate(data: Pick<ITimesheetUpsert, 'userId' | 'dateUTC' | 'entries'>): Promise<ITimesheet> {
        const { userId, dateUTC, entries } = data;
        console.log(dateUTC, 'createOrUpdate data')

        let timesheet = await Timesheet.findOne({ userId: new mongoose.Types.ObjectId(userId), dateUTC: new Date(dateUTC) });
        console.log(timesheet, "timesheetService timesheet");
        if (timesheet) {
            // timesheet.entries = [...timesheet.entries, ...entries];
            timesheet.entries = [...entries];
            console.log(timesheet.entries, "timesheetService timesheet.entries");
        } else {
            timesheet = new Timesheet({ userId: new mongoose.Types.ObjectId(userId), dateUTC, entries });
        }
        return timesheet.save();
    }

    async getTimesheetsByRange(data: ITimesheetGet): Promise<ITimesheet[]> {
        console.log("getTimesheetsByRange", data)
        const { userId, month, year, startDate, endDate } = data;
        const query: any = { userId: new mongoose.Types.ObjectId(userId) };
        if (month && year) {
            const start = new Date(Date.UTC(year, month - 1, 1));
            const end = new Date(Date.UTC(year, month, 0)); // Last day of the month
            query.dateUTC = { $gte: start, $lte: end };
        } else if (startDate && endDate) {
            query.dateUTC = {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            };
        } else {
            throw new Error('Please provide month/year or date range');
        }

        return Timesheet.find(query).sort({ dateUTC: 1 });
    }

    async getTimesheetByDate(data: ITimesheetByDate): Promise<ITimesheet | null> {
        const { userId, dateUTC } = data;
        return Timesheet.findOne({ userId: new mongoose.Types.ObjectId(userId), dateUTC });
    }

    async deleteTimesheet(recordId: string): Promise<ITimesheet> {
        const timesheet = await Timesheet.findByIdAndDelete(recordId);
        if (!timesheet) {
            throw new Error('Timesheet not found');
        }
        return timesheet;
    }

    async getTimesheetReport(data: ITimesheetGet): Promise<ITimesheetReportEntry[]> {
        const { userId, month, year, startDate, endDate } = data;

        const matchQuery: any = {};
        if (userId) matchQuery.userId = new mongoose.Types.ObjectId(userId);;
        if (month && year) {
            const start = new Date(Date.UTC(year, month - 1, 1));
            const end = new Date(Date.UTC(year, month, 0));
            matchQuery.dateUTC = { $gte: start, $lte: end };
        } else if (startDate && endDate) {
            matchQuery.dateUTC = {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            };
        }

        const pipeline = [
            { $match: matchQuery },
            { $unwind: { path: '$entries', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { userId: '$userId', project: '$entries.project' },
                    totalHours: { $sum: '$entries.duration' },
                },
            },
            {
                $project: {
                    userId: '$_id.userId',
                    project: '$_id.project',
                    totalHours: 1,
                    _id: 0,
                },
            },
            { $sort: { userId: 1, project: 1 } },
        ];

        return Timesheet.aggregate(pipeline as any[]);
    }

    async getAllTimesheets(): Promise<ITimesheet[]> {

        return Timesheet.find({}).sort({ dateUTC: -1 });
    }

    async generateTimesheet(userId: string, Month: number, Year: number, request: FastifyRequest): Promise<any> {
        console.log(request, "request generateTimesheet");
        try {
            // Fetch user and timesheet data
            const user = await User.findById(new mongoose.Types.ObjectId(userId));
            if (!user) {
                throw new Error('User not found');
            }
            const startDate = new Date(Date.UTC(Year, Month - 1, 1));
            const endDate = new Date(Date.UTC(Year, Month, 0));

            const timesheets = await Timesheet.find({
                userId: new mongoose.Types.ObjectId(userId),
                dateUTC: { $gte: startDate, $lte: endDate }
            });
            console.log(startDate, endDate, "timesheetService generateTimesheet");
            console.log(timesheets, "timesheetService timesheets");

            // Generate Excel
            const workbook = new ExcelJS.Workbook();
            console.log(path.resolve(__dirname, '..', '..', 'templates', 'Timesheet_Template.xlsx'), "Template Path generateTimesheet");
            const templatePath = path.resolve(__dirname, '..', '..', 'templates', 'Timesheet_Template.xlsx');
            await workbook.xlsx.readFile(templatePath);
            const worksheet: any = workbook.getWorksheet(1);
            console.log(worksheet, "worksheet generateTimesheet");

            // Fill header section
            worksheet.getCell('D1').value = 'Employee Id'; // Label
            worksheet.getCell('E1').value = user._id;     // Value
            worksheet.getCell('D2').value = 'Employee Name';
            worksheet.getCell('E2').value = `${user.name} `;
            worksheet.getCell('F1').value = 'Contact Number';
            worksheet.getCell('G1').value = user.phone || ''; // Contact Number
            worksheet.getCell('G2').value = user.joiningDate.toLocaleDateString(); // Date of Joining
            worksheet.getCell('G3').value = user.role || ''; // Designation
            console.log(worksheet, "worksheet generateTimesheet");

            // Fill month name
            worksheet.getCell('C4').value = monthNames[Month - 1];

            // Fill timesheet data
            let rowNum = 7; // Starting row for timesheet entries
            timesheets.forEach((day: ITimesheet, index: number) => {
                day.entries.forEach((entry) => {
                    const row = worksheet.getRow(rowNum);
                    row.getCell(1).value = index + 1; // Sl. No.
                    row.getCell(2).value = entry.description || ''; // Task Description
                    row.getCell(3).value = entry.task; // Task Type
                    row.getCell(4).value = day.dateUTC.toLocaleDateString('en-GB'); // Date (dd/mm/yy)
                    row.getCell(5).value = day.dateUTC.toLocaleDateString('en-US', { weekday: 'long' }); // Day
                    row.getCell(6).value = entry.duration; // No. of Hours (using duration instead of totalDuration)
                    row.getCell(7).value = ''; // Comments (not mapped from data)
                    rowNum++;
                });
            });
            console.log(worksheet, "worksheet generateTimesheet");


            // Save file
            const filename = `Doc_Timesheet_${userId.toString().slice(-5)}_${user.name}_${Month}_${Year}.xlsx`;
            console.log(filename, "filename worksheet generateTimesheet");
            const filePath = path.resolve(__dirname, '..', '..', 'uploads', filename);

            console.log(filePath, "filePath worksheet generateTimesheet");
            // await workbook.xlsx.writeFile(filePath);

            // Construct URL using request info or fallback to env
            const baseUrl = process.env.API_URL;
            const fileUrl = `${baseUrl}/${filename}`;
            // const fileUrl = `${baseUrl}/uploads/${filename}`;
            console.log(fileUrl, "fileUrl worksheet generateTimesheet")

            // Check for existing TimesheetFile record
            const existingFile = await TimesheetFile.findOne({
                userId: new mongoose.Types.ObjectId(userId),
                month: Month,
                year: Year
            });
            if (existingFile) {
                // Delete the old file from the filesystem
                const oldFilePath = path.resolve(__dirname, '..', '..', 'Uploads', path.basename(existingFile.filePath));
                try {
                    await fs.unlink(oldFilePath);
                } catch (err) {
                    console.warn(`Failed to delete old file ${oldFilePath}:`, err);
                }

                // Update the existing record
                existingFile.filePath = fileUrl;
                await existingFile.save();
            } else {
                // Create a new record
                await TimesheetFile.create({
                    userId: new mongoose.Types.ObjectId(userId),
                    filePath: fileUrl,
                    month: Month,
                    year: Year
                });
            }

            // Save the new file
            await workbook.xlsx.writeFile(filePath);
            return fileUrl;
        } catch (error: any) {
            console.log(error, "error in generateTimesheet");
            throw new Error(error.message);
        }
    }

    async deleteAllTimesheets(): Promise<void> {
        try {
            await Timesheet.deleteMany({});
            // await TimesheetFile.deleteMany({});
            console.log("All timesheet data deleted.");
        } catch (error) {
            console.error("Error deleting timesheet data:", error);
            throw error;
        }
    }


}

