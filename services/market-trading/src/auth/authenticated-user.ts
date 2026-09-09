export type UserRole = 'investor' | 'admin';

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
}
