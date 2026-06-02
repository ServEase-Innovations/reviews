# Reviews Service

Lightweight API for review eligibility checks, creating provider reviews, and listing provider reviews.

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
