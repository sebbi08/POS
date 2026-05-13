import { Request, Response, NextFunction } from "express";
import { config } from "../../config";

export function checkAdmin(req: Request, res: Response, next: NextFunction): void {
  const pin = req.headers["x-admin-pin"] as string;
  if (!pin || pin !== config.adminPin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
