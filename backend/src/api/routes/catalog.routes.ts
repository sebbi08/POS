import { Router, Request, Response } from "express";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware";
import {
  createItemGroup,
  updateItemGroup,
  archiveItemGroup,
  createItem,
  updateItem,
  archiveItem,
} from "../../modules/catalog/catalog.commands";
import { groups, items } from "../../modules/catalog/catalog.projections";

const router = Router();

router.use(authMiddleware, requireAdmin);

// Item Groups
router.get("/groups", (_req: Request, res: Response): void => {
  const list = Array.from(groups.values());
  res.json(list);
});

router.post("/groups", (req: Request, res: Response): void => {
  const { name, vatRate } = req.body;
  createItemGroup(name, vatRate).then((id) => res.json({ id }));
});

router.put("/groups/:id", (req: Request, res: Response): void => {
  const { name, vatRate } = req.body;
  updateItemGroup(req.params.id, name, vatRate).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/groups/:id", (req: Request, res: Response): void => {
  archiveItemGroup(req.params.id).then(() =>
    res.json({ status: "archived" })
  );
});

// Items
router.get("/items", (_req: Request, res: Response): void => {
  const list = Array.from(items.values());
  res.json(list);
});

router.post("/items", (req: Request, res: Response): void => {
  const { name, groupId, price } = req.body;
  createItem(name, groupId, price).then((id) => res.json({ id }));
});

router.put("/items/:id", (req: Request, res: Response): void => {
  const { name, groupId, price } = req.body;
  updateItem(req.params.id, name, groupId, price).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/items/:id", (req: Request, res: Response): void => {
  archiveItem(req.params.id).then(() =>
    res.json({ status: "archived" })
  );
});

export default router;
