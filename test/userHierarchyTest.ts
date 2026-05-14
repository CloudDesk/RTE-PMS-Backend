import { getSubordinateUserIds, getManageableExternalUsers } from '../src/utilis/userHierarchy';
import { User } from '../src/models/user.model';
import { Types } from 'mongoose';

// Mock data for testing
const mockUsers = [
  {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    name: 'Jey (Admin)',
    role: 'admin',
    managerId: null,
    active: true
  },
  {
    _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
    name: 'Wajith (Manager)',
    role: 'manager',
    managerId: new Types.ObjectId('507f1f77bcf86cd799439011'),
    active: true
  },
  {
    _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
    name: 'Pravin (Staff)',
    role: 'staff',
    managerId: new Types.ObjectId('507f1f77bcf86cd799439012'),
    active: true
  },
  {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    name: 'Hari (Staff)',
    role: 'staff',
    managerId: new Types.ObjectId('507f1f77bcf86cd799439012'),
    active: true
  },
  {
    _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
    name: 'Ex1 (External)',
    role: 'external',
    managerId: new Types.ObjectId('507f1f77bcf86cd799439013'),
    active: true
  },
  {
    _id: new Types.ObjectId('507f1f77bcf86cd799439016'),
    name: 'Ex2 (External)',
    role: 'external',
    managerId: new Types.ObjectId('507f1f77bcf86cd799439013'),
    active: true
  },
  {
    _id: new Types.ObjectId('507f1f77bcf86cd799439017'),
    name: 'Ex3 (External)',
    role: 'external',
    managerId: new Types.ObjectId('507f1f77bcf86cd799439014'),
    active: true
  }
];

// Mock User.find to return our test data
jest.mock('../src/models/user.model', () => ({
  User: {
    find: jest.fn()
  }
}));

describe('User Hierarchy Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSubordinateUserIds', () => {
    it('should return all subordinates for Jey (Admin)', async () => {
      // Mock User.find to return subordinates
      (User.find as jest.Mock).mockResolvedValue([
        mockUsers[1], // Wajith
        mockUsers[2], // Pravin
        mockUsers[3], // Hari
        mockUsers[4], // Ex1
        mockUsers[5], // Ex2
        mockUsers[6]  // Ex3
      ]);

      const result = await getSubordinateUserIds('507f1f77bcf86cd799439011');
      
      expect(result).toHaveLength(6);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439012'); // Wajith
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439013'); // Pravin
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439014'); // Hari
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439017'); // Ex3
    });

    it('should return subordinates for Wajith (Manager)', async () => {
      // Mock User.find to return subordinates
      (User.find as jest.Mock).mockResolvedValue([
        mockUsers[2], // Pravin
        mockUsers[3], // Hari
        mockUsers[4], // Ex1
        mockUsers[5], // Ex2
        mockUsers[6]  // Ex3
      ]);

      const result = await getSubordinateUserIds('507f1f77bcf86cd799439012');
      
      expect(result).toHaveLength(5);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439013'); // Pravin
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439014'); // Hari
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439017'); // Ex3
    });

    it('should return subordinates for Pravin (Staff)', async () => {
      // Mock User.find to return subordinates
      (User.find as jest.Mock).mockResolvedValue([
        mockUsers[4], // Ex1
        mockUsers[5]  // Ex2
      ]);

      const result = await getSubordinateUserIds('507f1f77bcf86cd799439013');
      
      expect(result).toHaveLength(2);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
    });
  });

  describe('getManageableExternalUsers', () => {
    it('should return all external users for admin', async () => {
      // Mock User.find to return all external users
      (User.find as jest.Mock).mockResolvedValue([
        mockUsers[4], // Ex1
        mockUsers[5], // Ex2
        mockUsers[6]  // Ex3
      ]);

      const result = await getManageableExternalUsers('507f1f77bcf86cd799439011', 'admin');
      
      expect(result).toHaveLength(3);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439017'); // Ex3
    });

    it('should return external users under Wajith (Manager)', async () => {
      // Mock getSubordinateUserIds to return subordinates
      (User.find as jest.Mock)
        .mockResolvedValueOnce([ // First call for getSubordinateUserIds
          mockUsers[2], // Pravin
          mockUsers[3], // Hari
          mockUsers[4], // Ex1
          mockUsers[5], // Ex2
          mockUsers[6]  // Ex3
        ])
        .mockResolvedValueOnce([ // Second call for filtering external users
          mockUsers[4], // Ex1
          mockUsers[5], // Ex2
          mockUsers[6]  // Ex3
        ]);

      const result = await getManageableExternalUsers('507f1f77bcf86cd799439012', 'manager');
      
      expect(result).toHaveLength(3);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439017'); // Ex3
    });

    it('should return external users under Pravin (Staff)', async () => {
      // Mock getSubordinateUserIds to return subordinates
      (User.find as jest.Mock)
        .mockResolvedValueOnce([ // First call for getSubordinateUserIds
          mockUsers[4], // Ex1
          mockUsers[5]  // Ex2
        ])
        .mockResolvedValueOnce([ // Second call for filtering external users
          mockUsers[4], // Ex1
          mockUsers[5]  // Ex2
        ]);

      const result = await getManageableExternalUsers('507f1f77bcf86cd799439013', 'staff');
      
      expect(result).toHaveLength(2);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
    });
  });
}); 