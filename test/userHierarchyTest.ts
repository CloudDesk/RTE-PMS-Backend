import { getSubordinateUserIds, getManageableExternalUsers } from '../src/utilis/userHierarchy';
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

// Smart mock filter function
const mockFilterUsers = (query: any) => {
  if (!query) return mockUsers;
  return mockUsers.filter(user => {
    if (query.active !== undefined && user.active !== query.active) {
      return false;
    }
    if (query.managerId !== undefined) {
      const qMgr = query.managerId;
      const uMgr = user.managerId;
      if (!uMgr || uMgr.toString() !== qMgr.toString()) {
        return false;
      }
    }
    if (query.role !== undefined && user.role !== query.role) {
      return false;
    }
    if (query._id !== undefined) {
      if (query._id.$in && Array.isArray(query._id.$in)) {
        const idsList = query._id.$in.map((id: any) => id.toString());
        if (!idsList.includes(user._id.toString())) {
          return false;
        }
      } else {
        if (user._id.toString() !== query._id.toString()) {
          return false;
        }
      }
    }
    return true;
  });
};

let lastQuery: any = null;

const mockLean = jest.fn(() => {
  return mockFilterUsers(lastQuery);
});

const mockSelect = jest.fn(() => {
  return {
    lean: mockLean
  };
});

// Mock User.find to return our test data
jest.mock('../src/models/user.model', () => ({
  User: {
    find: jest.fn((query) => {
      lastQuery = query;
      return {
        select: mockSelect
      };
    })
  }
}));

describe('User Hierarchy Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSubordinateUserIds', () => {
    it('should return all subordinates for Jey (Admin)', async () => {
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
      const result = await getSubordinateUserIds('507f1f77bcf86cd799439012');
      
      expect(result).toHaveLength(5);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439013'); // Pravin
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439014'); // Hari
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439017'); // Ex3
    });

    it('should return subordinates for Pravin (Staff)', async () => {
      const result = await getSubordinateUserIds('507f1f77bcf86cd799439013');
      
      expect(result).toHaveLength(2);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
    });
  });

  describe('getManageableExternalUsers', () => {
    it('should return all external users for admin', async () => {
      const result = await getManageableExternalUsers('507f1f77bcf86cd799439011', 'admin');
      
      expect(result).toHaveLength(3);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439017'); // Ex3
    });

    it('should return external users under Wajith (Manager)', async () => {
      const result = await getManageableExternalUsers('507f1f77bcf86cd799439012', 'manager');
      
      expect(result).toHaveLength(3);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439017'); // Ex3
    });

    it('should return external users under Pravin (Staff)', async () => {
      const result = await getManageableExternalUsers('507f1f77bcf86cd799439013', 'staff');
      
      expect(result).toHaveLength(2);
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439015'); // Ex1
      expect(result.map(id => id.toString())).toContain('507f1f77bcf86cd799439016'); // Ex2
    });
  });
});