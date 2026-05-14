import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';
import { LeaveSummary } from '../src/models/leave-summary.model';

dotenv.config();

const createLeaveSummaries = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB.');

    // Year for which to create leave summaries (default to 2024 or take from command-line)
    const year = process.argv[2] ? parseInt(process.argv[2], 10) : 2024;

    // Fetch all active employees (assuming employees have a non-null managerId)
    const employees = await User.find({ managerId: { $ne: null }, active: true });
    console.log(`Fetched ${employees.length} employees.`);

    // Fetch existing leave summaries for the specified year
    const existingSummaries = await LeaveSummary.find({ year, userId: { $in: employees.map(emp => emp._id) } });
    const existingUserIds = existingSummaries.map(summary => summary.userId.toString());

    // Filter employees who do not have a leave summary for the specified year
    const newEmployees = employees.filter(emp => !existingUserIds.includes(emp._id.toString()));
    console.log(`Creating leave summaries for ${newEmployees.length} employees.`);

    if (newEmployees.length === 0) {
      console.log(`All employees already have leave summaries for the year ${year}.`);
      process.exit(0);
    }

    // Prepare LeaveSummary documents
    const leaveSummaries = newEmployees.map(employee => ({
      userId: employee._id,
      year,
      annual: {
        alloted: 20,
        availed: 0,
        remaining: 20,
        leaveRequests: []
      },
      sick: {
        alloted: 10,
        availed: 0,
        remaining: 10,
        leaveRequests: []
      },
      compOff: {
        alloted: 5,
        availed: 0,
        remaining: 5,
        leaveRequests: []
      },
      lossOfPay: {
        alloted: 0,
        availed: 0,
        remaining: 0,
        leaveRequests: []
      },
      otherPaid: {
        alloted: 5,
        availed: 0,
        remaining: 5,
        leaveRequests: []
      },
      otherUnpaid: {
        alloted: 0,
        availed: 0,
        remaining: 0,
        leaveRequests: []
      },
    }));

    // Insert LeaveSummary documents in bulk
    await LeaveSummary.insertMany(leaveSummaries);
    console.log(`Created leave summaries for ${leaveSummaries.length} employees for the year ${year}.`);

    process.exit(0);
  } catch (error: any) {
    console.error('Error creating leave summaries:', error);
    process.exit(1);
  }
};

createLeaveSummaries();