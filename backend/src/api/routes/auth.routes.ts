import { Request, Response, Router } from "express";
import {
  ADMIN_LOCKED_ERROR,
  isAdminLocked,
  verifyAdminPin,
} from "../middleware/auth.middleware.js";

const router = Router();

router.post("/login", (req: Request, res: Response): void => {
  if (isAdminLocked(req)) {
    res.status(429).json({ error: ADMIN_LOCKED_ERROR });
    return;
  }
  const pin: unknown = req.body?.pin;
  if (typeof pin !== "string" || pin.length < 4) {
    res.status(400).json({ error: "PIN erforderlich (mindestens 4 Ziffern)" });
    return;
  }
  if (!verifyAdminPin(req, pin)) {
    res.status(401).json({ error: "Ungültige PIN" });
    return;
  }
  res.json({ role: "admin" as const, pin });
});

export default router;
