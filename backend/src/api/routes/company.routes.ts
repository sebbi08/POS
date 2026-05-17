import { Router, Request, Response } from "express";
import { checkAdmin } from "../middleware/auth.middleware";
import { getCompanySettings, updateCompanySettings } from "../../modules/company/company.repository";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  getCompanySettings().then((settings) => res.json(settings));
});

router.put("/", checkAdmin, (req: Request, res: Response): void => {
  const { name, address, city, vatId } = req.body;
  updateCompanySettings(name, address, city, vatId).then(() =>
    res.json({ status: "updated" })
  );
});

export default router;
