import type { Request, Response, NextFunction } from "express";
import { observeHttpRequest } from "../monitoring/prometheus";

export default function requestMetrics(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    observeHttpRequest({
      method: req.method,
      route: req.route?.path || req.path || req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}
