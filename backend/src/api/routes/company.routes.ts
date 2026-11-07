import { Request, Response, Router } from "express";
import {
  getCompanySettings,
  updateCompanySettings,
} from "../../modules/company/company.repository.js";
import { checkAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  res.json(await getCompanySettings());
});

router.put("/", checkAdmin, async (req: Request, res: Response): Promise<void> => {
  const { name, address, city, vatId } = req.body;
  await updateCompanySettings(name, address, city, vatId);
  res.json({ status: "updated" });
});

export default router;
