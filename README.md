# Reviews Service

Lightweight API for review eligibility checks, creating provider reviews, and listing provider reviews.

## Render (dev)

**GitHub → Render:** Pushes to this repo (`main`) should trigger a deploy. Add workflow `.github/workflows/trigger-render-deploy.yml` and secret `RENDER_DEPLOY_HOOK` in **this** repo (see monorepo `docs/DEPLOYMENT.md`). Manual Deploy in Render works the same way.

| Setting | Value |
|---------|--------|
| **Root Directory** | `.` (repo root — where `package.json` is). **Not** `src`. |
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm start` (runs `node dist/server.js`) |
| **Node version** | 20 (see `.node-version`) |

Set `DATABASE_URL` (or `POSTGRES_*`) in your Render env group. The service is TypeScript: **`npm run build` must succeed** or `dist/server.js` will not exist.

If deploy logs show `Cannot find module .../dist/server.js`, the build did not run or `tsc` failed — check the **build** log tab, not only the runtime log.

## Epoch-first contract

This service now supports compatibility aliases for request IDs and explicit epoch mirrors in review list responses.

- `GET /.../eligibility`:
  - accepts `engagementId` or `engagement_id`
  - accepts `customerId` or `customer_id`
- `POST /.../reviews`:
  - accepts `engagementId` or `engagement_id`
  - accepts `customerId` or `customer_id`
- `GET /.../providers/:serviceProviderId/reviews`:
  - returns `created_at` (epoch seconds)
  - also returns `created_at_epoch` (same value, explicit epoch mirror)

Legacy fields remain accepted for compatibility during migration.
