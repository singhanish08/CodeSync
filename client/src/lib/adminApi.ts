import { api } from './api';
import type { EditType, UserRole } from '../types';

export interface AdminStats {
  users: number;
  rooms: number;
  activeRooms: number;
  editsToday: number;
}

export interface AdminRoom {
  _id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  isPublic: boolean;
  memberCount: number;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  _id: string;
  email: string;
  displayName: string;
  role: UserRole;
  ownedRooms: number;
  createdAt: string;
}

export interface AdminActivityEntry {
  _id: string;
  roomId: string;
  userId: string | null;
  userName: string;
  type: EditType;
  summary: string;
  createdAt: string;
}

export interface LiveRoom {
  roomId: string;
  name: string;
  occupants: string[];
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface AdminListParams {
  search?: string;
  filter?: string;
  page?: number;
  limit?: number;
}

const toListParams = ({ search, filter, page = 0, limit = 25 }: AdminListParams) => {
  const params: Record<string, string | number> = { page, limit };
  if (search?.trim()) params.search = search.trim();
  if (filter && filter !== 'all') params.visibility = filter;
  return params;
};

export const fetchAdminStats = (): Promise<AdminStats> =>
  api.get('/admin/stats').then((res) => res.data as AdminStats);

export const fetchLiveRooms = (): Promise<LiveRoom[]> =>
  api.get('/admin/live-rooms').then((res) => (res.data as { rooms: LiveRoom[] }).rooms);

export const fetchAdminRooms = (params: AdminListParams = {}): Promise<ListResult<AdminRoom>> =>
  api.get('/admin/rooms', { params: toListParams(params) }).then((res) => {
    const data = res.data as { rooms: AdminRoom[]; total: number };
    return { items: data.rooms, total: data.total };
  });

export const fetchAdminUsers = (params: AdminListParams = {}): Promise<ListResult<AdminUser>> =>
  api.get('/admin/users', { params: toListParams(params) }).then((res) => {
    const data = res.data as { users: AdminUser[]; total: number };
    return { items: data.users, total: data.total };
  });

export const fetchAdminActivity = (limit = 40): Promise<AdminActivityEntry[]> =>
  api.get('/admin/activity', { params: { limit } }).then((res) => (res.data as { entries: AdminActivityEntry[] }).entries);

export const patchAdminRoom = (id: string, body: { name?: string; isPublic?: boolean }): Promise<AdminRoom> =>
  api.patch(`/admin/rooms/${id}`, body).then((res) => res.data.room as AdminRoom);

export const closeAdminRoom = (id: string, reason: string): Promise<{ kicked: number }> =>
  api.post(`/admin/rooms/${id}/close`, { reason }).then((res) => res.data as { kicked: number });

export const deleteAdminRoom = (id: string): Promise<void> =>
  api.delete(`/admin/rooms/${id}`).then(() => undefined);

export const patchAdminUser = (id: string, role: UserRole): Promise<AdminUser> =>
  api.patch(`/admin/users/${id}`, { role }).then((res) => res.data.user as AdminUser);

export const deleteAdminUser = (id: string): Promise<void> =>
  api.delete(`/admin/users/${id}`).then(() => undefined);
