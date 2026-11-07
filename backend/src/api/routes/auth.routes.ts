import { Request, Response, Router } from "express";
import { config } from "../../config.js";

const router = Router();

router.post("/login", (req: Request, res: Response): void => {
  const { pin } = req.body;
  if (!pin || pin.length < 4) {
    res.status(400).json({ error: "PIN erforderlich (mindestens 4 Ziffern)" });
    return;
  }
  if (pin !== config.adminPin) {
    res.status(401).json({ error: "Ungültige PIN" });
    return;
  }
  res.json({ role: "admin" as const, pin });
});

export default router;
