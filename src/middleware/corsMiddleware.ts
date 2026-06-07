import cors from "cors";
import { corsOriginCallback, parseCorsOrigins } from "../lib/corsOrigins";

const allowedOrigins = parseCorsOrigins();

export const corsMiddleware = cors({
  origin: corsOriginCallback(allowedOrigins),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],
  credentials: true,
  optionsSuccessStatus: 204,
});
