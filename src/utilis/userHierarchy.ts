import { Types } from 'mongoose';
import { User } from '../models/user.model';

/**
 * Get all subordinate user IDs (recursive) under a given user
 * This includes both direct subordinates and subordinates of subordinates
 * 
 * @param userId - The user ID to get subordinates for
 * @returns Array of subordinate user IDs (including nested ones)
 */
export async function getSubordinateUserIds(userId: string | Types.ObjectId): Promise<Types.ObjectId[]> {
  const userIdObj = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  const subordinateIds: Types.ObjectId[] = [];
  
  // Use a queue for breadth-first search to avoid deep recursion
  const queue: Types.ObjectId[] = [userIdObj];
  const visited = new Set<string>();
  
  while (queue.length > 0) {
    const currentUserId = queue.shift()!;
    const currentUserIdStr = currentUserId.toString();
    
    // Skip if already visited to avoid cycles
    if (visited.has(currentUserIdStr)) {
      continue;
    }
    visited.add(currentUserIdStr);
    
    // Collect the full hierarchy first; callers apply active/inactive filters later.
    const subordinates = await User.find({
      managerId: currentUserId
    }).select('_id role').lean();
    
    for (const subordinate of subordinates) {
      const subordinateId = subordinate._id;
      subordinateIds.push(subordinateId);
      
      // Add to queue for further exploration (recursive)
      queue.push(subordinateId);
    }
  }
  
  return subordinateIds;
}

/**
 * Get external users that a given user can manage based on their role and hierarchy
 * 
 * @param userId - The user ID requesting access
 * @param userRole - The role of the requesting user
 * @returns Array of external user IDs that can be managed
 */
export async function getManageableExternalUsers(
  userId: string | Types.ObjectId, 
  userRole: string
): Promise<Types.ObjectId[]> {
  
  // Admins can see all external users
  if (userRole === 'admin') {
    const allExternalUsers = await User.find({
      role: 'external',
      active: true
    }).select('_id').lean();
    
    return allExternalUsers.map(user => user._id);
  }
  
  // For managers and staff, get their subordinates and filter for external users
  const subordinateIds = await getSubordinateUserIds(userId);
  
  if (subordinateIds.length === 0) {
    return [];
  }
  
  // Get external users from the subordinate list
  const externalUsers = await User.find({
    _id: { $in: subordinateIds },
    role: 'external',
    active: true
  }).select('_id').lean();
  
  return externalUsers.map(user => user._id);
}

/**
 * Get all users (including external) that a given user can manage
 * 
 * @param userId - The user ID requesting access
 * @param userRole - The role of the requesting user
 * @returns Array of user IDs that can be managed
 */
export async function getManageableUsers(
  userId: string | Types.ObjectId, 
  userRole: string
): Promise<Types.ObjectId[]> {
  
  // Admins can see all users
  if (userRole === 'admin') {
    const allUsers = await User.find({
      active: true
    }).select('_id').lean();
    
    return allUsers.map(user => user._id);
  }
  
  // For managers and staff, get their subordinates
  return await getSubordinateUserIds(userId);
}

/**
 * Check if a user can manage another user based on hierarchy
 * 
 * @param managerId - The ID of the potential manager
 * @param subordinateId - The ID of the potential subordinate
 * @returns Boolean indicating if the user can manage the subordinate
 */
export async function canManageUser(
  managerId: string | Types.ObjectId, 
  subordinateId: string | Types.ObjectId
): Promise<boolean> {
  const managerIdObj = typeof managerId === 'string' ? new Types.ObjectId(managerId) : managerId;
  const subordinateIdObj = typeof subordinateId === 'string' ? new Types.ObjectId(subordinateId) : subordinateId;
  
  // Get all manageable users for the manager
  const manageableUsers = await getManageableUsers(managerIdObj, 'manager'); // We'll get the role from context
  
  return manageableUsers.some(id => id.equals(subordinateIdObj));
} 
