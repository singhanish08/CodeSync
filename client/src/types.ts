/* Shared types mirrored from the backend contract. */

export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
}

export interface RoomDTO {
  _id: string;
  name: string;
  ownerId: string;
  isPublic: boolean;
  members: string[];
  language: string;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight visibility probe used by the "Join room" dialog. */
export interface RoomVisibilityDTO {
  isPublic: boolean;
}

export type EditType = 'human_edit' | 'ai_suggestion' | 'ai_accepted' | 'ai_rejected';

export interface EditHistoryDTO {
  _id: string;
  roomId: string;
  userId: string | null;
  type: EditType;
  summary: string;
  // Mongoose `timestamps: true` exposes createdAt, not `timestamp`.
  createdAt: string;
}

export type AiMode = 'explain' | 'review' | 'refactor';

export interface PresenceUser {
  userId: string;
  displayName: string;
  color: string;
}

export interface AiChange {
  startLine: number;
  endLine: number;
  replacement: string;
}

export interface AiSuggestion {
  suggestionId: string;
  explanation: string;
  changes: AiChange[] | null;
}

export type AppTheme = 'light' | 'dark' | 'eyeshield';
