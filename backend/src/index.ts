import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { initTables } from "./db.js";
import { initAuthProjections } from "./modules/auth/auth.projections.js";
import { initOrderProjections } from "./modules/orders/orders.projections.js";
import { startProjections } from "./projections/runner.js";

import authRoutes from "./api/routes/auth.routes.js";
import catalogRoutes from "./api/routes/catalog.routes.js";
import companyRoutes from "./api/routes/company.routes.js";
import ordersRoutes from "./api/routes/orders.routes.js";
import reportingRoutes from "./api/routes/reporting.routes.js";
import syncRoutes from "./api/routes/sync.routes.js";
import terminalsRoutes from "./api/routes/terminals.routes.js";
import versionRoutes from "./api/routes/version.routes.js";

const startupLog = (msg: string) =>
  console.log(`[backend:startup] ${msg}  (${new Date().toISOString()})`);

startupLog(
  `Database URL: ${config.pg.connectionString.replace(/\/\/.*@/, "//***@")}`,
);

const app = express();
app.use(cors());
// Mounted before the global JSON parser: the sync router parses its own,
// larger bodies (a whole festival of bookings) after the terminal key check.
app.use("/api/sync", syncRoutes);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/version", versionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/terminals", terminalsRoutes);
app.use("/api/reporting", reportingRoutes);
app.use("/api/company", companyRoutes);

startupLog("Registering projections…");
const projStart = Date.now();
initAuthProjections();
initOrderProjections();
startupLog(`  Projections registered in ${Date.now() - projStart}ms`);

startupLog("Initializing database tables…");
const tableStart = Date.now();
initTables().then(() => {
  startupLog(`  Tables ready in ${Date.now() - tableStart}ms`);

  startupLog("Replaying events and starting projections…");
  const replayStart = Date.now();
  startProjections().then(() => {
    startupLog(`  Projections live in ${Date.now() - replayStart}ms`);

    app.listen(config.port, () => {
      const total = Date.now() - t0;
      startupLog(
        `Listening on http://localhost:${config.port}  (total startup ${total}ms)`,
      );
    });
  });
});

const t0 = Date.now();
