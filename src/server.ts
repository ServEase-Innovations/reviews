import "./config/env.js";
import app from "./app";
import { assertCorsOriginsProduction } from "./lib/corsOrigins";

if (process.env.NODE_ENV === "production") {
  assertCorsOriginsProduction();
}

/** Default 5005: matches root `npm run dev` and avoids clashing with CRA (3000). */
const PORT = parseInt(process.env.PORT || "5005", 10);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Reviews service running on port ${PORT}`);
});
