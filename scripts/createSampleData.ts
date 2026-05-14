import mongoose from 'mongoose';
import argon2 from 'argon2';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';

dotenv.config();

const createSampleData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB.');

    // Define managers
    const managers = [
      {
        name: 'Alice Manager',
        email: 'alice.manager@example.com',
        password: 'ManagerPass1',
        role: 'Manager',
        department: 'Sales',
        biometricId: 'BIOMGR001',
      },
      {
        name: 'Bob Manager',
        email: 'bob.manager@example.com',
        password: 'ManagerPass2',
        role: 'Manager',
        department: 'Engineering',
        biometricId: 'BIOMGR002',
      },
    ];

    // Create and save managers
    const managerIds: mongoose.Types.ObjectId[] = [];
    for (const mgr of managers) {
      const hashedPassword = await argon2.hash(mgr.password, { raw: true });
      const manager = new User({
        name: mgr.name,
        email: mgr.email,
        password: hashedPassword,
        role: 'manager',
        departmentId: new mongoose.Types.ObjectId(),
        biometricId: mgr.biometricId,
        active: true,
      });
      await manager.save();
      managerIds.push(manager._id);
      console.log(`Created manager: ${mgr.name}`);
    }

    // Define employees
    const employees = [
      // Employees under Alice Manager
      {
        name: 'Charlie Employee1',
        email: 'charlie.employee1@example.com',
        password: 'EmployeePass1',
        role: 'Employee',
        department: 'Sales',
        biometricId: 'BIOEMP001',
        managerId: managerIds[0],
      },
      {
        name: 'Diana Employee2',
        email: 'diana.employee2@example.com',
        password: 'EmployeePass2',
        role: 'Employee',
        department: 'Sales',
        biometricId: 'BIOEMP002',
        managerId: managerIds[0],
      },
      {
        name: 'Ethan Employee3',
        email: 'ethan.employee3@example.com',
        password: 'EmployeePass3',
        role: 'Employee',
        department: 'Sales',
        biometricId: 'BIOEMP003',
        managerId: managerIds[0],
      },
      {
        name: 'Fiona Employee4',
        email: 'fiona.employee4@example.com',
        password: 'EmployeePass4',
        role: 'Employee',
        department: 'Sales',
        biometricId: 'BIOEMP004',
        managerId: managerIds[0],
      },
      // Employees under Bob Manager
      {
        name: 'George Employee5',
        email: 'george.employee5@example.com',
        password: 'EmployeePass5',
        role: 'Employee',
        department: 'Engineering',
        biometricId: 'BIOEMP005',
        managerId: managerIds[1],
      },
      {
        name: 'Hannah Employee6',
        email: 'hannah.employee6@example.com',
        password: 'EmployeePass6',
        role: 'Employee',
        department: 'Engineering',
        biometricId: 'BIOEMP006',
        managerId: managerIds[1],
      },
      {
        name: 'Ian Employee7',
        email: 'ian.employee7@example.com',
        password: 'EmployeePass7',
        role: 'Employee',
        department: 'Engineering',
        biometricId: 'BIOEMP007',
        managerId: managerIds[1],
      },
      {
        name: 'Julia Employee8',
        email: 'julia.employee8@example.com',
        password: 'EmployeePass8',
        role: 'Employee',
        department: 'Engineering',
        biometricId: 'BIOEMP008',
        managerId: managerIds[1],
      },
    ];

    // Create and save employees
    for (const emp of employees) {
      const employee = new User({
        name: emp.name,
        email: emp.email,
        password: emp.password,
        role: new mongoose.Types.ObjectId(), // Replace with actual Role ID for Employee
        departmentId: new mongoose.Types.ObjectId(), // Replace with actual Department ID
        biometricId: emp.biometricId,
        managerId: emp.managerId,
        active: true,
      });
      await employee.save();
      console.log(`Created employee: ${emp.name}`);
    }

    console.log('Sample data created successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error creating sample data:', error);
    process.exit(1);
  }
};

createSampleData();