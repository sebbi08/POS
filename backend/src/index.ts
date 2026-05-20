import express from "express";
import cors from "cors";
import { config } from "./config";
import { initTables } from "./db";
import { startProjections } from "./projections/runner";
import { initAuthProjections } from "./modules/auth/auth.projections";
import { initOrderProjections } from "./modules/orders/orders.projections";
import { initReportingProjections } from "./modules/reporting/reporting.projections";

import authRoutes from "./api/routes/auth.routes";
import catalogRoutes from "./api/routes/catalog.routes";
import ordersRoutes from "./api/routes/orders.routes";
import terminalsRoutes from "./api/routes/terminals.routes";
import reportingRoutes from "./api/routes/reporting.routes";
import companyRoutes from "./api/routes/company.routes";

const startupLog = (msg: string) => console.log(`[backend:startup] ${msg}  (${new Date().toISOString()})`);

startupLog(`Database URL: ${config.pg.connectionString.replace(/\/\/.*@/, "//***@")}`);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

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
initReportingProjections();
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
      startupLog(`Listening on http://localhost:${config.port}  (total startup ${total}ms)`);
    });
  });
});

const t0 = Date.now();
