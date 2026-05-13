import { Router, Request, Response } from "express";
import { checkAdmin } from "../middleware/auth.middleware";
import { updateCompanySettings } from "../../modules/company/company.commands";
import { companySettings } from "../../modules/company/company.projections";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  res.json(companySettings);
});

router.put("/", checkAdmin, (req: Request, res: Response): void => {
  const { name, address, city, vatId } = req.body;
  updateCompanySettings(name, address, city, vatId).then(() =>
    res.json({ status: "updated" })
  );
});

export default router;
