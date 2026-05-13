import { Router, Request, Response } from "express";
import { config } from "../../config";

const router = Router();

router.post("/login", (req: Request, res: Response): void => {
  const { pin } = req.body;
  if (!pin || pin.length < 4) {
    res.status(400).json({ error: "PIN required (4+ digits)" });
    return;
  }
  if (pin !== config.adminPin) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }
  res.json({ role: "admin" as const, pin });
});

export default router;
