import 'dotenv/config';
import dns from 'dns';
import mongoose, { Types } from 'mongoose';
import * as argon2 from 'argon2';

import { connectDB } from '../src/config/database';
import { LOV } from '../src/models/lov.model';
import { User } from '../src/models/user.model';

dns.setServers(['8.8.8.8', '1.1.1.1']);

type SeedEmployee = {
  name: string;
  email: string;
  employeeCode: string;
  specificRole: string;
  joiningDate: string;
  probationStartDate: string;
  probationEndDate: string;
  employmentStatus: string;
  isIntern?: boolean;
};

type DepartmentOption = {
  label?: string;
  value?: string;
  isActive?: boolean;
};

const EMPLOYEES_PER_DEPARTMENT = 10;

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(value: string, months: number): string {
  const date = toDate(value);
  date.setUTCMonth(date.getUTCMonth() + months);
  return dateString(date);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'department';
}

async function getActiveDepartments(): Promise<Required<Pick<DepartmentOption, 'label' | 'value'>>[]> {
  const departments = await LOV.findOne({ type: 'department' }).lean();
  const activeDepartments = ((departments as any)?.values || []).filter(
    (value: any) => value?.isActive !== false && value?.value,
  );

  if (activeDepartments.length === 0) {
    throw new Error('No active department LOV value found. Create one before seeding employees.');
  }

  return activeDepartments.map((department: DepartmentOption) => ({
    label: String(department.label || department.value),
    value: String(department.value),
  }));
}

async function getDepartmentManager(departmentId: string) {
  const manager =
    (await User.findOne({
      active: true,
      role: { $regex: /^manager$/i },
      departmentId,
    }).select('_id name employeeCode departmentId').lean()) ||
    (await User.findOne({
      active: true,
      role: { $regex: /^admin$/i },
    }).select('_id name employeeCode departmentId').lean()) ||
    (await User.findOne({ active: true }).select('_id name employeeCode departmentId').lean());

  if (!manager?._id) {
    throw new Error('No active manager/admin user found. Create one before seeding probation employees.');
  }

  return manager;
}

function buildSeedEmployees(departments: Required<Pick<DepartmentOption, 'label' | 'value'>>[]): SeedEmployee[] {
  const roles = ['Trainee', 'Graduate Trainee', 'Probation Staff', 'Intern'];
  const startDate = toDate('2026-07-01');

  return departments.flatMap((department, departmentIndex) => {
    const departmentSlug = slug(department.value);
    const departmentLabelSlug = slug(department.label);
    const departmentCode = String(departmentIndex + 1).padStart(2, '0');

    return Array.from({ length: EMPLOYEES_PER_DEPARTMENT }, (_, index) => {
      const sequence = String(index + 1).padStart(2, '0');
      const joiningDate = new Date(startDate);
      joiningDate.setUTCDate(joiningDate.getUTCDate() + departmentIndex * 3 + index);
      const joiningDateValue = dateString(joiningDate);
      const isIntern = index === EMPLOYEES_PER_DEPARTMENT - 1;

      return {
        name: `Probation ${department.label} ${sequence}`,
        email: `probation.${departmentLabelSlug}.${sequence}@test.rtepms.local`,
        employeeCode: `PBT-${departmentCode}-${sequence}`,
        specificRole: isIntern ? 'Intern' : roles[index % (roles.length - 1)],
        joiningDate: joiningDateValue,
        probationStartDate: joiningDateValue,
        probationEndDate: addMonths(joiningDateValue, 6),
        employmentStatus: isIntern ? 'Intern' : 'Probation',
        isIntern,
        departmentId: department.value,
        departmentSlug,
      } as SeedEmployee & { departmentId: string; departmentSlug: string };
    });
  });
}

async function seed() {
  await connectDB();

  const departments = await getActiveDepartments();
  const seedEmployees = buildSeedEmployees(departments);
  const passwordHash = await argon2.hash('Password@123');
  const results: Array<Record<string, string>> = [];
  const managerByDepartment = new Map<string, any>();

  for (const employee of seedEmployees) {
    const departmentId = (employee as SeedEmployee & { departmentId: string }).departmentId;
    let manager = managerByDepartment.get(departmentId);
    if (!manager) {
      manager = await getDepartmentManager(departmentId);
      managerByDepartment.set(departmentId, manager);
    }

    const existing = await User.findOne({ employeeCode: employee.employeeCode }).select('_id').lean();
    const now = new Date();
    const payload = {
      name: employee.name,
      email: employee.email,
      password: passwordHash,
      role: 'staff',
      specificRole: employee.specificRole,
      departmentId,
      managerId: new Types.ObjectId(String(manager._id)),
      managerName: (manager as any).name,
      employeeCode: employee.employeeCode,
      active: true,
      joiningDate: toDate(employee.joiningDate),
      confirmationDate: undefined,
      probationStartDate: toDate(employee.probationStartDate),
      probationEndDate: toDate(employee.probationEndDate),
      probationDate: employee.probationEndDate,
      location: 'Test Location',
      noticePeriod: 0,
      costCenter: departmentId,
      employmentStatus: employee.employmentStatus,
      country: 'IN',
      currency: 'INR',
      licenseType: 'employee',
      portalAccess: true,
      isIntern: Boolean(employee.isIntern),
      bankDetails: [],
      upcomingShiftAssignmentData: null,
      currentShiftAssignmentData: null,
      updatedAt: now,
      ...(existing ? {} : { createdAt: now }),
    };

    await User.collection.updateOne(
      { employeeCode: employee.employeeCode },
      { $set: payload },
      { upsert: true },
    );

    results.push({
      action: existing ? 'updated' : 'created',
      name: employee.name,
      employeeCode: employee.employeeCode,
      department: departmentId,
      status: employee.employmentStatus,
      role: employee.specificRole,
      manager: `${(manager as any).name} - ${(manager as any).employeeCode || String(manager._id)}`,
      probationEndDate: employee.probationEndDate,
    });
  }

  console.table(results);
  console.log(
    `Seeded ${results.length} probation test employees across ${departments.length} department(s) in database "${mongoose.connection.name}".`,
  );
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
