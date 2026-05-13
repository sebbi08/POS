import { Router, Request, Response } from "express";
import { validatePin } from "../../modules/auth/auth.projections";
import { startSession, endSession, createUser, archiveUser } from "../../modules/auth/auth.commands";
import { users } from "../../modules/auth/auth.projections";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware";

const router = Router();

router.post("/login", (req: Request, res: Response): void => {
  const { pin, terminalId } = req.body;
  if (!pin || pin.length < 4) {
    res.status(400).json({ error: "PIN required (4+ digits)" });
    return;
  }

  const user = validatePin(pin);
  if (!user) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  startSession(user.id, terminalId).then((sessionId) => {
    res.json({
      sessionId,
      user: { id: user.id, name: user.name, role: user.role },
    });
  });
});

router.post("/logout", authMiddleware, (req: Request, res: Response): void => {
  endSession(req.sessionId!).then(() => {
    res.json({ status: "logged out" });
  });
});

router.get("/me", authMiddleware, (req: Request, res: Response): void => {
  res.json({ userId: req.userId, role: req.userRole });
});

// User management (admin only)
router.get("/users", authMiddleware, requireAdmin, (_req: Request, res: Response): void => {
  res.json(Array.from(users.values()));
});

router.post("/users", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  const { name, pin, role } = req.body;
  createUser(name, pin, role).then((id) => res.json({ id }));
});

router.delete("/users/:id", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  archiveUser(req.params.id).then(() => res.json({ status: "archived" }));
});

export default router;
