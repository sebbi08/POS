import { Request, Response, Router } from "express";
import {
  createTerminal,
  deleteTerminal,
  generateTerminalKey,
  getTerminal,
  getTerminalKey,
  listTerminals,
  updateTerminal,
} from "../../modules/terminals/terminals.repository.js";
import { checkAdmin } from "../middleware/auth.middleware.js";

// Handlers are async so Express 5 forwards a rejected database call as a 500.
const router = Router();

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const terminals = await listTerminals();
  res.json(
    terminals.map(({ id, name, groupIds, printPickupReceipts }) => ({
      id,
      name,
      groupIds,
      printPickupReceipts,
    })),
  );
});

router.post("/", checkAdmin, async (req: Request, res: Response): Promise<void> => {
  const { name, groupIds, printPickupReceipts } = req.body;
  const id = await createTerminal(name, groupIds, printPickupReceipts ?? true);
  res.json({ id });
});

router.put("/:id", checkAdmin, async (req: Request, res: Response): Promise<void> => {
  const { name, groupIds, printPickupReceipts } = req.body;
  await updateTerminal(req.params.id as string, name, groupIds, printPickupReceipts);
  res.json({ status: "updated" });
});

router.delete("/:id", checkAdmin, async (req: Request, res: Response): Promise<void> => {
  await deleteTerminal(req.params.id as string);
  res.json({ status: "deleted" });
});

router.get("/:id/key", checkAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  if (!(await getTerminal(id))) {
    res.status(404).json({ error: "Terminal nicht gefunden" });
    return;
  }
  res.json({ key: await getTerminalKey(id) });
});

router.post("/:id/key", checkAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  if (!(await getTerminal(id))) {
    res.status(404).json({ error: "Terminal nicht gefunden" });
    return;
  }
  res.json({ key: await generateTerminalKey(id) });
});

export default router;
