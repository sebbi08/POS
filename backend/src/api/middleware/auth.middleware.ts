import { Request, Response, NextFunction } from "express";
import { getSessionUser } from "../../modules/auth/auth.projections";

declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
      userId?: string;
      userRole?: "admin" | "terminal";
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.headers["x-session-id"] as string;
  if (!sessionId) {
    res.status(401).json({ error: "No session ID provided" });
    return;
  }

  const user = getSessionUser(sessionId);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.sessionId = sessionId;
  req.userId = user.id;
  req.userRole = user.role;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
