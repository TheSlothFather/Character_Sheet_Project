import { Router, Request, Response } from "express";

interface StubCampaign {
  id: string;
  name: string;
  joinCode: string;
}

const campaigns: StubCampaign[] = [];

export const campaignsRouter = Router();

campaignsRouter.get("/", (_req: Request, res: Response) => {
  res.json(campaigns);
});

campaignsRouter.post("/", (req: Request, res: Response) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  const c: StubCampaign = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: name.trim(),
    joinCode
  };
  campaigns.push(c);
  res.status(201).json(c);
});

