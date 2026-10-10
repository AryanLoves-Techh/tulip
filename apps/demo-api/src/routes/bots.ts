import { Router } from "express";
import { randomUUID } from "node:crypto";
import { dbCall } from "../fragile-db";

type Bot = { id: string; name: string };
const bots = new Map<string, Bot>();

export const botsRouter = Router();

// Express 5 forwards async errors to the error handler automatically.
// (On Express 4, wrap these in try/catch + next(err).)
botsRouter.get("/", async (_req, res) => {
  res.json(await dbCall(() => [...bots.values()]));
});

botsRouter.post("/", async (req, res) => {
  const bot = await dbCall(() => {
    const b = { id: randomUUID(), name: String(req.body?.name ?? "bot") };
    bots.set(b.id, b);
    return b;
  });
  res.status(201).json(bot);
});

botsRouter.get("/:id", async (req, res) => {
  const bot = await dbCall(() => bots.get(req.params.id));
  bot ? res.json(bot) : res.status(404).json({ error: "not found" });
});

botsRouter.delete("/:id", async (req, res) => {
  await dbCall(() => bots.delete(req.params.id));
  res.status(204).end();
});