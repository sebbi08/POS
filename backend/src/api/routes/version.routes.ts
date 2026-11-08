import { Request, Response, Router } from "express";
import { serverVersion } from "../../version.js";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  res.json({ version: serverVersion() });
});

export default router;
