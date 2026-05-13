export type UserRole = "admin" | "terminal";

export interface User {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
  archived: boolean;
}

export interface Session {
  id: string;
  userId: string;
  terminalId?: string;
  startedAt: Date;
  endedAt?: Date;
}

export interface UserCreatedEvent {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
}

export interface UserArchivedEvent {
  id: string;
}

export interface SessionStartedEvent {
  id: string;
  userId: string;
  terminalId?: string;
}

export interface SessionEndedEvent {
  id: string;
}
