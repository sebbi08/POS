import { Router, Request, Response } from "express";
import { checkAdmin } from "../middleware/auth.middleware";
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  listItems,
  createItem,
  updateItem,
  deleteItem,
} from "../../modules/catalog/catalog.repository";

const router = Router();

router.use(checkAdmin);

router.get("/groups", (_req: Request, res: Response): void => {
  listGroups().then((groups) => res.json(groups));
});

router.post("/groups", (req: Request, res: Response): void => {
  const { name, vatRate } = req.body;
  createGroup(name, vatRate).then((id) => res.json({ id }));
});

router.put("/groups/:id", (req: Request, res: Response): void => {
  const { name, vatRate } = req.body;
  updateGroup(req.params.id, name, vatRate).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/groups/:id", (req: Request, res: Response): void => {
  deleteGroup(req.params.id).then(() =>
    res.json({ status: "deleted" })
  );
});

router.get("/items", (_req: Request, res: Response): void => {
  listItems().then((items) => res.json(items));
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
  deleteItem(req.params.id).then(() =>
    res.json({ status: "deleted" })
  );
});

export default router;
