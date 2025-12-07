import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { definitionsRouter } from "./routes/definitions";
import { charactersRouter } from "./routes/characters";
import { campaignsRouter } from "./routes/campaigns";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/definitions", definitionsRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/campaigns", campaignsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Adurun server listening on port ${PORT}`);
});
