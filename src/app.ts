import express from "express";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger";
import { corsMiddleware } from "./middleware/corsMiddleware";
import prisma from "./utils/prisma";

import reviewsRoutes from "./modules/reviews/reviews.routes";

const app = express();

app.use(corsMiddleware);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "reviews",
    uptime: process.uptime(),
  });
});

app.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready", service: "reviews" });
  } catch (err) {
    res.status(503).json({
      status: "not_ready",
      service: "reviews",
      error: err instanceof Error ? err.message : "database unreachable",
    });
  }
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));



app.use("/reviews", reviewsRoutes);


export default app;
