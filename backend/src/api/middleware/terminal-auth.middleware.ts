import { NextFunction, Request, Response } from "express";
import { findTerminalByKey } from "../../modules/terminals/terminals.repository.js";

export function checkTerminalKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = req.headers["x-terminal-id"];
  const key = req.headers["x-terminal-key"];
  if (typeof id !== "string" || typeof key !== "string" || !id || !key) {
    res.status(401).json({ error: "Terminal-Schlüssel ungültig" });
    return;
  }
  findTerminalByKey(id, key)
    .then((terminal) => {
      if (!terminal) {
        res.status(401).json({ error: "Terminal-Schlüssel ungültig" });
        return;
      }
      res.locals.terminal = terminal;
      next();
    })
    .catch(next);
}
