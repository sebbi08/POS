import express from "express";
import cors from "cors";
import { config } from "./config";
import authRoutes from "./api/routes/auth.routes";
import catalogRoutes from "./api/routes/catalog.routes";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`POS backend running on http://localhost:${config.port}`);
});
