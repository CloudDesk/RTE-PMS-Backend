import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { SocialEvent, ISocialEvent } from '../models/social-event.model';
import { User } from '../models/user.model';
import { emailService } from './email.service';
import { Types } from 'mongoose';
import { saveMultipartFile } from '../utilis/parseMultiPartForm';
import * as path from 'path';

export class CommunicationService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }

    /**
     * Send a personalized greeting and record it for the Social Wall
     */
    async sendPersonalizedGreeting(data: {
        employeeIds: string[];
        type: 'Event' | 'Policy' | 'Other' | 'Greeting';
        subject: string;
        message: string;
        eventDate: string | Date;
        adminId: string;
        files?: any[]; // Multipart parts
        socialEventId?: string; // Optional: for re-dispatching to existing event
    }): Promise<any> {
        const { employeeIds, type, subject, message, eventDate, adminId, files, socialEventId } = data;

        let socialEvent: any;
        let newEmployeeIds = [...employeeIds];

        if (socialEventId) {
            socialEvent = await SocialEvent.findById(socialEventId);
            if (!socialEvent) throw new Error('Existing event not found');
        }

        const employees = await User.find({ _id: { $in: newEmployeeIds.map(id => new Types.ObjectId(id)) } }).lean();

        const attachmentPaths: string[] = [];
        const emailAttachments: any[] = [];
        const results = [];

        // Save files (only if new files are provided)
        if (files && files.length > 0) {
            const uploadDir = path.join(process.cwd(), 'uploads', 'communications');
            for (const file of files) {
                const filename = `${Date.now()}-${file.filename}`;
                const targetPath = path.join(uploadDir, filename);
                await saveMultipartFile(file, targetPath);

                attachmentPaths.push(`uploads/communications/${filename}`);
                emailAttachments.push({
                    filename: file.filename,
                    path: targetPath,
                    mimetype: file.mimetype
                });
            }
        }

        let updateData: any = {};
        try {
            // 1. Record/Update the event for the Social Wall
            if (socialEventId && socialEvent) {
                // Update existing event using safer findByIdAndUpdate
                updateData = {
                    $set: {
                        subject,
                        message,
                        eventDate: new Date(eventDate)
                    },
                    $addToSet: {
                        "targets.employees": { $each: newEmployeeIds.map(id => new Types.ObjectId(id)) }
                    }
                };

                if (attachmentPaths.length > 0) {
                    (updateData as any).$push = { attachments: { $each: attachmentPaths } };
                }

                await SocialEvent.findByIdAndUpdate(socialEventId, updateData);
                // Refresh document for the response
                socialEvent = await SocialEvent.findById(socialEventId);
            } else {
                // Create new event
                socialEvent = await new SocialEvent({
                    type,
                    subject,
                    message,
                    eventDate: new Date(eventDate),
                    attachments: attachmentPaths,
                    postedBy: new Types.ObjectId(adminId),
                    targets: {
                        employees: newEmployeeIds.map(id => new Types.ObjectId(id))
                    }
                }).save();
            }

            // 2. Send Emails to all selected recipients (allows for re-dispatch/corrections)
            for (const employee of employees) {
                const firstName = employee.name.split(' ')[0];
                const text = `Hi ${firstName},\n\n${message}\n\nBest Regards,\nManagement Team - Cloud Desk Technology Pvt Ltd.`;

                try {
                    await emailService.sendEmail({
                        body: {
                            to: employee.email,
                            subject: subject || `${type} from Cloud Desk`,
                            text
                        },
                        files: emailAttachments // Note: only new attachments are sent in the new emails
                    });
                    results.push({ employeeId: employee._id, status: 'success' });
                } catch (err: any) {
                    results.push({ employeeId: employee._id, status: 'failed', error: err.message });
                }
            }

            return {
                success: true,
                socialEventId: socialEvent._id,
                total: employees.length,
                results
            };
        } catch (error: any) {
            console.error('Error in sendPersonalizedGreeting:', error);
            throw error;
        }
    }

    /**
     * Automated Milestone Engine: Daily job for Birthdays and Anniversaries
     */
    async processDailyMilestones(): Promise<any> {
        // Use India Standard Time (IST) for milestone detection as per company locale
        const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const currentMonth = istNow.getMonth() + 1;
        const currentDay = istNow.getDate();

        // Normalized date for filtering (matches dashboard UTC midnight boundary for the IST day)
        const normalizedEventDate = new Date(Date.UTC(istNow.getFullYear(), istNow.getMonth(), istNow.getDate()));

        // Fetch Birthdays
        const birthdayUsers = await User.aggregate([
            { $match: { active: true, dateOfBirth: { $exists: true } } },
            {
                $project: {
                    name: 1, email: 1,
                    month: { $month: "$dateOfBirth" },
                    day: { $dayOfMonth: "$dateOfBirth" }
                }
            },
            { $match: { month: currentMonth, day: currentDay } }
        ]);

        // Fetch Anniversaries
        const anniversaryUsers = await User.aggregate([
            { $match: { active: true, joiningDate: { $exists: true } } },
            {
                $project: {
                    name: 1, email: 1, joiningDate: 1,
                    month: { $month: "$joiningDate" },
                    day: { $dayOfMonth: "$joiningDate" },
                    years: { $subtract: [istNow.getFullYear(), { $year: "$joiningDate" }] }
                }
            },
            { $match: { month: currentMonth, day: currentDay, years: { $gt: 0 } } }
        ]);

        console.log(`[CommunicationEngine] Today: ${birthdayUsers.length} birthdays, ${anniversaryUsers.length} anniversaries.`);

        // Record Birthdays
        for (const user of birthdayUsers) {
            const subject = `Happy Birthday, ${user.name.split(' ')[0]}! 🎂`;
            const message = `Warmest wishes on your birthday! We value your contributions and presence in the team.`;

            // Create social wall post only if it doesn't already exist for today
            const existingPost = await SocialEvent.findOne({
                type: 'Birthday',
                employeeId: user._id,
                eventDate: normalizedEventDate
            });

            if (!existingPost) {
                await new SocialEvent({
                    type: 'Birthday',
                    employeeId: user._id,
                    subject,
                    message,
                    eventDate: normalizedEventDate,
                    postedBy: 'SYSTEM'
                }).save();

                // Send Email only for the first time
                await this.sendEmailSilently(user.email, subject, message, user.name);
            }
        }

        // Record Anniversaries
        for (const user of anniversaryUsers) {
            const years = user.years;
            const ordinal = (n: number) => {
                const s = ["th", "st", "nd", "rd"];
                const v = n % 100;
                return n + (s[(v - 20) % 10] || s[v] || s[0]);
            };

            const subject = `Happy ${ordinal(years)} Work Anniversary! 🎖️`;
            const message = `Congratulations on your ${years} year(s) journey with us! We appreciate your dedication and energy.`;

            const existingPost = await SocialEvent.findOne({
                type: 'Anniversary',
                employeeId: user._id,
                eventDate: normalizedEventDate
            });

            if (!existingPost) {
                await new SocialEvent({
                    type: 'Anniversary',
                    employeeId: user._id,
                    subject,
                    message,
                    eventDate: normalizedEventDate,
                    postedBy: 'SYSTEM',
                    metadata: { years }
                }).save();

                await this.sendEmailSilently(user.email, subject, message, user.name);
            }
        }

        return { birthdays: birthdayUsers.length, anniversaries: anniversaryUsers.length };
    }

    private async sendEmailSilently(to: string, subject: string, message: string, name: string) {
        try {
            const firstName = name.split(' ')[0];
            const text = `Hi ${firstName},\n\n${message}\n\nBest Regards,\nManagement Team - Cloud Desk Technology Pvt Ltd.`;

            await emailService.sendEmail({
                body: { to, subject, text }
            });
        } catch (e) {
            console.error(`Failed to send milestone email to ${to}:`, e);
        }
    }

    /**
     * Get events for the Social Wall
     */
    async getSocialWall(query: { limit?: number; offset?: number; viewerId?: string; viewerRole?: string; teamOnly?: boolean } = {}): Promise<ISocialEvent[]> {
        const { limit, viewerId, viewerRole, teamOnly } = query;
        // Calculate boundaries using project-standard IST to prevent UTC-offset hidden milestones
        const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        nowIST.setHours(0, 0, 0, 0);

        // This today starts at 00:00 IST of the current project day
        const todayAtStartOfIST = new Date(nowIST.getTime() - (nowIST.getTimezoneOffset() * 60000));
        const tomorrowAtStartOfIST = new Date(todayAtStartOfIST.getTime() + 86400000);

        let finalQuery: any = {
            $or: [
                // 1. All Milestones (Global - everyone sees birthdays/anniversaries)
                { type: { $in: ['Birthday', 'Anniversary'] }, eventDate: { $gte: todayAtStartOfIST, $lt: tomorrowAtStartOfIST } },

                // 2. Future Manual Events
                { type: { $nin: ['Birthday', 'Anniversary'] }, eventDate: { $gte: todayAtStartOfIST } }
            ]
        };

        // If not an admin/HR, add restrictive filters for manual events
        // OR if teamOnly flag is true (even for admins), enforce strict team filtering
        if (viewerId && (teamOnly || (viewerRole !== 'admin' && viewerRole !== 'humanResources'))) {
            // Find all employees managed by this user
            const managedEmployees = await User.find({ managerId: viewerId }, '_id').lean();
            const managedIds = managedEmployees.map(e => e._id);
            const viewerObjectId = new Types.ObjectId(viewerId);

            finalQuery = {
                $or: [
                    // Milestones stay global
                    { type: { $in: ['Birthday', 'Anniversary'] }, eventDate: { $gte: todayAtStartOfIST, $lt: tomorrowAtStartOfIST } },

                    // Manual events restricted to Target list or Team Context
                    {
                        type: { $nin: ['Birthday', 'Anniversary'] },
                        eventDate: { $gte: todayAtStartOfIST },
                        $or: [
                            { 'targets.employees': viewerObjectId }, // Directly targeted (Self)
                            { 'targets.employees': { $in: managedIds } }, // Targeted at team member (Only Team)
                            // Include Dept/Role only if NOT in strict 'teamOnly' mode
                            ...(!teamOnly ? [
                                { 'targets.departments': this.context.user?.departmentId },
                                { 'targets.roles': this.context.user?.role }
                            ] : []),
                            { 'targets.employees': { $exists: false } }, // Public Global fallback
                            { 'targets.employees': { $size: 0 } } // Public Global fallback
                        ]
                    }
                ]
            };
        } else if (!viewerId || (viewerRole !== 'admin' && viewerRole !== 'humanResources')) {
            // Security Fallback: If identity is missing or not authorized, 
            // strictly show ONLY Global Milestones and Public Global Manual Events.
            // This fixes the "Global Leak" where private events were visible to anonymous/unmapped users.
            finalQuery = {
                $or: [
                    { type: { $in: ['Birthday', 'Anniversary'] }, eventDate: { $gte: todayAtStartOfIST, $lt: tomorrowAtStartOfIST } },
                    { 
                        type: { $nin: ['Birthday', 'Anniversary'] }, 
                        eventDate: { $gte: todayAtStartOfIST },
                        $or: [
                            { 'targets.employees': { $exists: false } },
                            { 'targets.employees': { $size: 0 } }
                        ]
                    }
                ]
            };
        }

        return SocialEvent.find(finalQuery)
            .sort({ eventDate: 1, createdAt: -1 })
            .limit(limit || 10)
            .populate('employeeId', 'name profilePicture')
            .lean();
    }

    /**
     * Get communication logs (manual dispatches) including past events
     */
    async getCommunicationLogs(query: { page?: number; limit?: number; search?: string; month?: number; year?: number } = {}): Promise<any> {
        const { page = 1, limit = 10, search, month, year } = query;
        const skip = (Number(page) - 1) * Number(limit);

        const finalQuery: any = {
            type: { $nin: ['Birthday', 'Anniversary'] } // Only manual events
        };

        if (search) {
            finalQuery.$or = [
                { subject: new RegExp(search, 'i') },
                { message: new RegExp(search, 'i') },
                { type: new RegExp(search, 'i') }
            ];
        }

        if (month !== undefined || year !== undefined) {
            const start = new Date(year || new Date().getFullYear(), (month !== undefined ? month - 1 : 0), 1);
            const end = new Date(year || new Date().getFullYear(), (month !== undefined ? month : 12), 0, 23, 59, 59, 999);
            finalQuery.eventDate = { $gte: start, $lte: end };
        }

        const [total, results] = await Promise.all([
            SocialEvent.countDocuments(finalQuery),
            SocialEvent.find(finalQuery)
                .sort({ eventDate: -1, createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('employeeId', 'name profilePicture')
                .lean()
        ]);

        return {
            data: results,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit))
            }
        };
    }
}
