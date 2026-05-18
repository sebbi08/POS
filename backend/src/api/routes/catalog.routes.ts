import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import multer from "multer";
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
  getGroupByName,
  getItem,
  exportItems,
} from "../../modules/catalog/catalog.repository";
import { parseCsv, formatCsvRow } from "../../modules/catalog/catalog.csv";
import type { ImportPreview, ImportResult } from "../../modules/catalog/catalog.types";
import { getPool } from "../../db";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
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

router.post("/export", async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId } = req.body;
    const rows = await exportItems(groupId);
    const header = formatCsvRow(["id", "name", "group_name", "group_vat_rate", "price"]);
    const csv = header + "\n" + rows.map(r => formatCsvRow([r.id, r.name, r.group_name, r.group_vat_rate, r.price])).join("\n") + "\n";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=catalog-export.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/import", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const text = req.file.buffer.toString("utf-8");
    const parseResult = parseCsv(text);
    if (parseResult.error) {
        res.status(400).json({ groupsToCreate: [], itemsToCreate: [], itemsToUpdate: [], errors: [parseResult.error] });
        return;
    }

    const csvRows = parseResult.rows;
    const dryRun = req.body.dryRun === "true" || req.body.dryRun === true;

    const errors: string[] = [];
    const groupsToCreate: ImportPreview["groupsToCreate"] = [];
    const itemsToCreate: ImportPreview["itemsToCreate"] = [];
    const itemsToUpdate: ImportPreview["itemsToUpdate"] = [];

    // Validate numeric fields
    for (let i = 0; i < csvRows.length; i++) {
        const r = csvRows[i];
        const rowNum = i + 2;
        if (isNaN(parseFloat(r.groupVatRate))) {
            errors.push(`Row ${rowNum}: invalid group_vat_rate "${r.groupVatRate}"`);
        }
        if (isNaN(parseFloat(r.price))) {
            errors.push(`Row ${rowNum}: invalid price "${r.price}"`);
        }
    }

    if (errors.length > 0) {
        res.status(400).json({ groupsToCreate, itemsToCreate, itemsToUpdate, errors });
        return;
    }

    // Resolve groups (by name, case-sensitive)
    const groupMap = new Map<string, { name: string; vatRate: number; existingId?: string }>();
    for (const r of csvRows) {
        if (!groupMap.has(r.groupName)) {
            const existing = await getGroupByName(r.groupName);
            const vatRate = parseFloat(r.groupVatRate);
            if (existing) {
                if (existing.vatRate !== vatRate) {
                    errors.push(`Group "${r.groupName}" exists with VAT ${existing.vatRate}%, import has ${vatRate}%`);
                }
                groupMap.set(r.groupName, { name: r.groupName, vatRate, existingId: existing.id });
            } else {
                groupMap.set(r.groupName, { name: r.groupName, vatRate });
                groupsToCreate.push({ name: r.groupName, vatRate });
            }
        }
    }

    // Load all groups for old-group-name resolution in diffs
    const allGroups = await listGroups();
    const groupById = new Map(allGroups.map(g => [g.id, g]));

    // Diff items (by id)
    for (const r of csvRows) {
        const price = parseFloat(r.price);
        const existing = await getItem(r.id);

        if (existing) {
            const oldGroup = groupById.get(existing.groupId);
            const oldGroupName = oldGroup?.name || existing.groupId;

            if (existing.name !== r.name || existing.price !== price || existing.groupId !== groupMap.get(r.groupName)?.existingId) {
                itemsToUpdate.push({
                    id: r.id,
                    name: r.name,
                    groupName: r.groupName,
                    price,
                    oldName: existing.name,
                    oldPrice: existing.price,
                    oldGroupName,
                });
            }
        } else {
            itemsToCreate.push({
                id: r.id,
                name: r.name,
                groupName: r.groupName,
                price,
            });
        }
    }

    const preview: ImportPreview = { groupsToCreate, itemsToCreate, itemsToUpdate, errors };

    if (dryRun) {
        res.json(preview);
        return;
    }

    if (errors.length > 0) {
        res.status(400).json(preview);
        return;
    }

    // Execute in transaction
    const pool = await getPool();
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        let groupsCreated = 0;
        const finalGroupMap = new Map<string, string>();

        for (const g of groupsToCreate) {
            const id = uuid();
            await client.query(
                `INSERT INTO item_groups (id, name, vat_rate) VALUES ($1, $2, $3)`,
                [id, g.name, g.vatRate]
            );
            finalGroupMap.set(g.name, id);
            groupsCreated++;
        }

        for (const [name, info] of groupMap) {
            if (info.existingId) {
                finalGroupMap.set(name, info.existingId);
            }
        }

        let itemsCreated = 0;
        let itemsUpdated = 0;

        for (const item of itemsToCreate) {
            const groupId = finalGroupMap.get(item.groupName);
            if (!groupId) continue;
            await client.query(
                `INSERT INTO items (id, name, group_id, price) VALUES ($1, $2, $3, $4)`,
                [item.id, item.name, groupId, item.price]
            );
            itemsCreated++;
        }

        for (const item of itemsToUpdate) {
            const groupId = finalGroupMap.get(item.groupName);
            if (!groupId) continue;
            await client.query(
                `UPDATE items SET name = $2, group_id = $3, price = $4, updated_at = NOW() WHERE id = $1`,
                [item.id, item.name, groupId, item.price]
            );
            itemsUpdated++;
        }

        await client.query("COMMIT");

        const result: ImportResult = {
            groupsCreated,
            itemsCreated,
            itemsUpdated,
            groupsToCreate,
            itemsToCreate,
            itemsToUpdate,
            errors,
        };
        res.json(result);
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        res.status(500).json({ errors: [String(err)] });
        return;
    } finally {
        client.release();
    }
  } catch (err) {
    res.status(500).json({ errors: [String(err)] });
  }
});

export default router;
