import { Request, Response, Router } from "express";
import {
  getCompanySettings,
  updateCompanySettings,
} from "../../modules/company/company.repository.js";
import { checkAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  getCompanySettings().then((settings) => res.json(settings));
});

router.put("/", checkAdmin, (req: Request, res: Response): void => {
  const { name, address, city, vatId } = req.body;
  updateCompanySettings(name, address, city, vatId).then(() =>
    res.json({ status: "updated" }),
  );
});

export default router;
