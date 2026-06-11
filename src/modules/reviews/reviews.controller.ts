import { Request, Response } from "express";
import prisma from "../../utils/prisma";

const MAX_REVIEW_LENGTH = 2000;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 200;

const REASON_MESSAGES: Record<string, string> = {
  MISSING_ENGAGEMENT_ID: "Booking information is missing.",
  ENGAGEMENT_NOT_FOUND: "This booking could not be found.",
  CUSTOMER_MISMATCH: "You can only review your own bookings.",
  PROVIDER_NOT_ASSIGNED: "No service provider is assigned yet.",
  ENGAGEMENT_NOT_COMPLETED: "You can review after the service is completed.",
  SERVICE_NOT_COMPLETED: "You can review after the visit is marked complete.",
  REVIEW_ALREADY_EXISTS: "A review already exists for this booking.",
  MISSING_REQUIRED_FIELDS: "Rating is required.",
  INVALID_RATING: "Rating must be between 1 and 5.",
  REVIEW_TOO_LONG: "Review text is too long.",
  INVALID_SERVICE_PROVIDER_ID: "Invalid service provider id.",
  SERVER_ERROR: "Something went wrong. Please try again.",
};

function reasonMessage(reason: string): string {
  return REASON_MESSAGES[reason] ?? reason;
}

async function findExistingReviewId(
  engagementId: number
): Promise<bigint | null> {
  const rows = await prisma.$queryRaw<{ review_id: bigint }[]>`
    SELECT review_id FROM provider_reviews WHERE engagement_id = ${engagementId} LIMIT 1
  `;
  return rows.length ? rows[0].review_id : null;
}

function getProviderGrade(avg: number, total: number, low: number) {
  if (total < 3) return "New";
  if (avg >= 4.5 && low === 0) return "Excellent";
  if (avg >= 4.0 && low <= 1) return "Very Good";
  if (avg >= 3.0) return "Average";
  return "Needs Improvement";
}

function normalizeServiceType(bookingType: string, serviceType?: string | null): string {
  const allowed = new Set(["ON_DEMAND", "SHORT_TERM", "MONTHLY"]);
  if (serviceType && allowed.has(serviceType)) return serviceType;
  if (allowed.has(bookingType)) return bookingType;
  return "ON_DEMAND";
}

function parsePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function parseMaybeInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

type EngagementCompletionRow = {
  booking_type: string;
  active: boolean | null;
  engagement_status: string | null;
  task_status: string | null;
};

function isLifecycleCompleted(
  engagementStatus: string | null | undefined,
  taskStatus: string | null | undefined
): boolean {
  const life = String(engagementStatus ?? "").toUpperCase();
  const task = String(taskStatus ?? "").toUpperCase();
  return life === "COMPLETED" || task === "COMPLETED";
}

async function hasCompletedServiceDay(engagementId: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ status: string }[]>`
    SELECT status
    FROM service_days
    WHERE engagement_id = ${engagementId}
      AND UPPER(COALESCE(status, '')) IN ('COMPLETED', 'DONE')
    LIMIT 1
  `;
  return rows.length > 0;
}

async function isEngagementCompletedForReview(
  row: EngagementCompletionRow,
  engagementId: number
): Promise<boolean> {
  if (isLifecycleCompleted(row.engagement_status, row.task_status)) {
    return true;
  }

  const bookingType = String(row.booking_type || "").toUpperCase();
  if (bookingType === "ON_DEMAND") {
    return hasCompletedServiceDay(engagementId);
  }

  return row.active !== true;
}

export const checkReviewEligibility = async (req: Request, res: Response) => {
  const engagementId = parsePositiveInt(
    req.query.engagementId ?? req.query.engagement_id
  );
  const customerId = parseMaybeInt(
    req.query.customerId ?? req.query.customer_id
  );

  if (engagementId == null) {
    return res.status(400).json({
      eligible: false,
      reason: "MISSING_ENGAGEMENT_ID",
      message: reasonMessage("MISSING_ENGAGEMENT_ID"),
    });
  }

  try {
    const engagement = await prisma.$queryRaw<
      {
        engagement_id: number;
        customerid: number;
        serviceproviderid: number | null;
        booking_type: string;
        active: boolean | null;
        assignment_status: string | null;
        engagement_status: string | null;
        task_status: string | null;
      }[]
    >`
      SELECT
        e.engagement_id,
        e.customerid,
        e.serviceproviderid,
        e.booking_type,
        e.active,
        e.assignment_status,
        e.engagement_status,
        e.task_status
      FROM engagements e
      WHERE e.engagement_id = ${engagementId}
      LIMIT 1
    `;

    if (!engagement.length) {
      return res.json({
        eligible: false,
        reason: "ENGAGEMENT_NOT_FOUND",
      });
    }

    const row = engagement[0];

    if (customerId != null && Number(row.customerid) !== customerId) {
      return res.json({
        eligible: false,
        reason: "CUSTOMER_MISMATCH",
      });
    }

    if (!row.serviceproviderid) {
      return res.json({
        eligible: false,
        reason: "PROVIDER_NOT_ASSIGNED",
      });
    }

    if (!(await isEngagementCompletedForReview(row, engagementId))) {
      return res.json({
        eligible: false,
        reason: "ENGAGEMENT_NOT_COMPLETED",
      });
    }

    if (await findExistingReviewId(engagementId)) {
      return res.json({
        eligible: false,
        reason: "REVIEW_ALREADY_EXISTS",
        message: reasonMessage("REVIEW_ALREADY_EXISTS"),
      });
    }

    return res.json({
      eligible: true,
      engagementId,
      serviceProviderId: Number(row.serviceproviderid),
      customerId: Number(row.customerid),
    });
  } catch (error) {
    console.error("Review eligibility error:", error);
    return res.status(500).json({
      eligible: false,
      reason: "SERVER_ERROR",
      message: reasonMessage("SERVER_ERROR"),
    });
  }
};

export const createReview = async (req: Request, res: Response) => {
  const engagementId = parsePositiveInt(
    req.body.engagementId ?? req.body.engagement_id
  );
  const customerId = parseMaybeInt(req.body.customerId ?? req.body.customer_id);
  const rating = Number(req.body.rating);
  const reviewText =
    typeof req.body.review === "string" ? req.body.review.trim() : null;

  if (engagementId == null || !Number.isFinite(rating)) {
    return res.status(400).json({
      success: false,
      reason: "MISSING_REQUIRED_FIELDS",
    });
  }

  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return res.status(400).json({
      success: false,
      reason: "INVALID_RATING",
    });
  }

  if (reviewText && reviewText.length > MAX_REVIEW_LENGTH) {
    return res.status(400).json({
      success: false,
      reason: "REVIEW_TOO_LONG",
      maxLength: MAX_REVIEW_LENGTH,
    });
  }

  try {
    const engagements = await prisma.$queryRaw<
      {
        engagement_id: number;
        customerid: number;
        serviceproviderid: number | null;
        booking_type: string;
        service_type: string | null;
        active: boolean | null;
        engagement_status: string | null;
        task_status: string | null;
      }[]
    >`
      SELECT
        engagement_id,
        customerid,
        serviceproviderid,
        booking_type,
        service_type,
        active,
        engagement_status,
        task_status
      FROM engagements
      WHERE engagement_id = ${engagementId}
    `;

    if (!engagements.length) {
      return res.status(404).json({
        success: false,
        reason: "ENGAGEMENT_NOT_FOUND",
      });
    }

    const engagement = engagements[0];

    if (customerId != null && Number(engagement.customerid) !== customerId) {
      return res.status(403).json({
        success: false,
        reason: "CUSTOMER_MISMATCH",
      });
    }

    if (!engagement.serviceproviderid) {
      return res.status(400).json({
        success: false,
        reason: "PROVIDER_NOT_ASSIGNED",
      });
    }

    if (!(await isEngagementCompletedForReview(engagement, engagementId))) {
      return res.status(400).json({
        success: false,
        reason:
          String(engagement.booking_type || "").toUpperCase() === "ON_DEMAND"
            ? "SERVICE_NOT_COMPLETED"
            : "ENGAGEMENT_NOT_COMPLETED",
      });
    }

    if (await findExistingReviewId(engagementId)) {
      return res.status(409).json({
        success: false,
        reason: "REVIEW_ALREADY_EXISTS",
        message: reasonMessage("REVIEW_ALREADY_EXISTS"),
      });
    }

    const serviceType = normalizeServiceType(
      engagement.booking_type,
      engagement.service_type
    );

    const inserted = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ review_id: bigint }[]>`
        INSERT INTO provider_reviews (
          customerid,
          serviceproviderid,
          engagement_id,
          service_type,
          rating,
          review,
          created_at
        )
        VALUES (
          ${engagement.customerid},
          ${engagement.serviceproviderid},
          ${engagementId},
          ${serviceType},
          ${rating},
          ${reviewText},
          NOW()
        )
        RETURNING review_id
      `;

      await tx.$queryRaw`
        UPDATE serviceprovider
        SET rating = (
          SELECT COALESCE(AVG(rating)::double precision, 0)
          FROM provider_reviews
          WHERE serviceproviderid = ${engagement.serviceproviderid}
        )
        WHERE serviceproviderid = ${engagement.serviceproviderid}
      `;

      return rows[0];
    });

    const summaryRows = await prisma.$queryRaw<
      { avg_rating: number | null; total: number }[]
    >`
      SELECT
        ROUND(AVG(rating)::numeric, 1)::float AS avg_rating,
        COUNT(*)::int AS total
      FROM provider_reviews
      WHERE serviceproviderid = ${engagement.serviceproviderid}
    `;

    const summary = summaryRows[0];

    return res.status(201).json({
      success: true,
      message: "REVIEW_CREATED_SUCCESSFULLY",
      review: {
        review_id: Number(inserted.review_id),
        engagement_id: engagementId,
        serviceproviderid: Number(engagement.serviceproviderid),
        customerid: Number(engagement.customerid),
        service_type: serviceType,
        rating,
        review: reviewText,
      },
      provider: {
        id: Number(engagement.serviceproviderid),
        rating: Number(summary?.avg_rating ?? rating),
        review_count: summary?.total ?? 1,
      },
    });
  } catch (err) {
    console.error("Create review error:", err);
    return res.status(500).json({
      success: false,
      reason: "SERVER_ERROR",
      message: reasonMessage("SERVER_ERROR"),
    });
  }
};

export const getProviderReviews = async (req: Request, res: Response) => {
  const serviceProviderId = Number(req.params.serviceProviderId);
  const limit = Math.min(
    Math.max(Number(req.query.limit) || DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT
  );
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const minRating = req.query.minRating ? Number(req.query.minRating) : null;
  const serviceType = req.query.serviceType as string | undefined;

  if (!Number.isFinite(serviceProviderId) || serviceProviderId < 1) {
    return res.status(400).json({
      success: false,
      reason: "INVALID_SERVICE_PROVIDER_ID",
    });
  }

  try {
    const where: string[] = [`pr.serviceproviderid = $1`];
    const params: (string | number)[] = [serviceProviderId];
    let paramIndex = 2;

    if (minRating && minRating >= 1 && minRating <= 5) {
      where.push(`pr.rating >= $${paramIndex++}`);
      params.push(minRating);
    }

    if (serviceType) {
      where.push(`pr.service_type = $${paramIndex++}`);
      params.push(serviceType);
    }

    const whereClause = `WHERE ${where.join(" AND ")}`;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM provider_reviews pr
      ${whereClause}
    `;

    const listSql = `
      SELECT
        pr.review_id::int AS review_id,
        pr.rating,
        pr.review,
        pr.service_type,
        pr.engagement_id::int AS engagement_id,
        pr.customerid::int AS customerid,
        FLOOR(EXTRACT(EPOCH FROM pr.created_at))::int AS created_at,
        NULLIF(TRIM(CONCAT(c.firstname, ' ', c.lastname)), '') AS customer_name
      FROM provider_reviews pr
      LEFT JOIN customer c ON c.customerid = pr.customerid
      ${whereClause}
      ORDER BY pr.created_at DESC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}
    `;

    const countRows = await prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      ...params
    );
    const totalMatching = countRows[0]?.total ?? 0;

    const reviews = await prisma.$queryRawUnsafe<
      {
        review_id: number;
        rating: number;
        review: string | null;
        service_type: string;
        engagement_id: number | null;
        customerid: number;
        created_at: number;
        customer_name: string | null;
      }[]
    >(listSql, ...params, limit, offset);

    const summaryRows = await prisma.$queryRawUnsafe<
      {
        total: number;
        avg_rating: number | null;
        r5: number;
        r4: number;
        r3: number;
        r2: number;
        r1: number;
        low_ratings: number;
      }[]
    >(
      `
      SELECT
        COUNT(*)::int                              AS total,
        ROUND(AVG(rating)::numeric, 1)::float      AS avg_rating,
        COUNT(*) FILTER (WHERE rating = 5)::int    AS r5,
        COUNT(*) FILTER (WHERE rating = 4)::int    AS r4,
        COUNT(*) FILTER (WHERE rating = 3)::int    AS r3,
        COUNT(*) FILTER (WHERE rating = 2)::int    AS r2,
        COUNT(*) FILTER (WHERE rating = 1)::int    AS r1,
        COUNT(*) FILTER (WHERE rating <= 2)::int   AS low_ratings
      FROM provider_reviews pr
      WHERE pr.serviceproviderid = $1
      `,
      serviceProviderId
    );

    const summary = summaryRows[0] ?? {
      total: 0,
      avg_rating: 0,
      r5: 0,
      r4: 0,
      r3: 0,
      r2: 0,
      r1: 0,
      low_ratings: 0,
    };

    const total = summary.total ?? 0;
    const avg = Number(summary.avg_rating ?? 0);
    const low = summary.low_ratings ?? 0;
    const grade = getProviderGrade(avg, total, low);

    return res.json({
      success: true,
      provider: {
        id: serviceProviderId,
        rating: avg,
        review_count: total,
        grade,
        distribution: {
          "5": summary.r5 ?? 0,
          "4": summary.r4 ?? 0,
          "3": summary.r3 ?? 0,
          "2": summary.r2 ?? 0,
          "1": summary.r1 ?? 0,
        },
      },
      pagination: {
        limit,
        offset,
        total: totalMatching,
        hasMore: offset + reviews.length < totalMatching,
      },
      count: reviews.length,
      reviews: reviews.map((r) => ({
        review_id: r.review_id,
        rating: r.rating,
        review: r.review,
        service_type: r.service_type,
        engagement_id: r.engagement_id,
        customerid: r.customerid,
        customer_name: r.customer_name,
        created_at: r.created_at,
        created_at_epoch: r.created_at,
      })),
    });
  } catch (err) {
    console.error("Get provider reviews error:", err);
    return res.status(500).json({
      success: false,
      reason: "SERVER_ERROR",
      message: reasonMessage("SERVER_ERROR"),
    });
  }
};
