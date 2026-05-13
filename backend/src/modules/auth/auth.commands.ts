import { v4 as uuid } from "uuid";
import { appendEvent } from "../../eventstore/client";
import {
  UserCreatedEvent,
  UserArchivedEvent,
  SessionStartedEvent,
  SessionEndedEvent,
  UserRole,
} from "./auth.types";

const USER_STREAM = (id: string) => `auth-${id}`;
const SESSION_STREAM = "auth-sessions";

export async function createUser(
  name: string,
  pin: string,
  role: UserRole
): Promise<string> {
  const id = uuid();
  const data: UserCreatedEvent = { id, name, pin, role };
  await appendEvent(USER_STREAM(id), "UserCreated", data as unknown as Record<string, unknown>);
  return id;
}

export async function archiveUser(id: string): Promise<void> {
  const data: UserArchivedEvent = { id };
  await appendEvent(USER_STREAM(id), "UserArchived", data as unknown as Record<string, unknown>);
}

export async function startSession(
  userId: string,
  terminalId?: string
): Promise<string> {
  const id = uuid();
  const data: SessionStartedEvent = { id, userId, terminalId };
  await appendEvent(SESSION_STREAM, "SessionStarted", data as unknown as Record<string, unknown>);
  return id;
}

export async function endSession(sessionId: string): Promise<void> {
  const data: SessionEndedEvent = { id: sessionId };
  await appendEvent(SESSION_STREAM, "SessionEnded", data as unknown as Record<string, unknown>);
}
