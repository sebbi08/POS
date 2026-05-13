import { registerProjection } from "../../projections/runner";
import { User } from "./auth.types";

export const users: Map<string, User> = new Map();
export const activeSessions: Map<
  string,
  { userId: string; terminalId?: string; startedAt: Date }
> = new Map();

export function initAuthProjections(): void {
  registerProjection("current-users", "auth", (event) => {
    switch (event.type) {
      case "UserCreated":
        users.set(event.data.id as string, {
          id: event.data.id as string,
          name: event.data.name as string,
          pin: event.data.pin as string,
          role: event.data.role as "admin" | "terminal",
          archived: false,
        });
        break;
      case "UserArchived": {
        const u = users.get(event.data.id as string);
        if (u) {
          u.archived = true;
        }
        break;
      }
      case "SessionStarted":
        activeSessions.set(event.data.id as string, {
          userId: event.data.userId as string,
          terminalId: event.data.terminalId as string | undefined,
          startedAt: new Date(),
        });
        break;
      case "SessionEnded":
        activeSessions.delete(event.data.id as string);
        break;
    }
  });
}

export function validatePin(pin: string): User | null {
  for (const user of users.values()) {
    if (user.pin === pin && !user.archived) {
      return user;
    }
  }
  return null;
}

export function getSessionUser(sessionId: string): User | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  return users.get(session.userId) ?? null;
}
