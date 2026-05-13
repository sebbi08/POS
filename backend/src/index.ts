import express from "express";
import cors from "cors";
import { config } from "./config";
import { startProjections } from "./projections/runner";
import { initCatalogProjections } from "./modules/catalog/catalog.projections";
import { initAuthProjections } from "./modules/auth/auth.projections";
import { initOrderProjections } from "./modules/orders/orders.projections";
import { initTerminalProjections } from "./modules/terminals/terminals.projections";
import { initReportingProjections } from "./modules/reporting/reporting.projections";
import { initCompanyProjection } from "./modules/company/company.projections";

import authRoutes from "./api/routes/auth.routes";
import catalogRoutes from "./api/routes/catalog.routes";
import ordersRoutes from "./api/routes/orders.routes";
import terminalsRoutes from "./api/routes/terminals.routes";
import reportingRoutes from "./api/routes/reporting.routes";
import companyRoutes from "./api/routes/company.routes";

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

// Initialize projections
initCatalogProjections();
initAuthProjections();
initOrderProjections();
initTerminalProjections();
initReportingProjections();
initCompanyProjection();

startProjections().then(() => {
  app.listen(config.port, () => {
    console.log(`POS backend running on http://localhost:${config.port}`);
  });
});
