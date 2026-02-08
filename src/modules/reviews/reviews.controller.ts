import { Request, Response } from "express";
import prisma from "../../utils/prisma";

export const checkReviewEligibility = async (req: Request, res: Response) => {
  const { engagementId } = req.query;

  if (!engagementId) {
    return res.status(400).json({
      eligible: false,
      reason: "MISSING_ENGAGEMENT_ID",
    });
  }

  try {
    // 1️⃣ Fetch engagement + today_service + booking_type
    const engagement = await prisma.$queryRaw<
      {
        engagement_id: number;
        booking_type: string;
        active: boolean;
        assignment_status: string;
        today_status: string | null;
      }[]
    >`
      SELECT 
        e.engagement_id,
        e.booking_type,
        e.active,
        e.assignment_status,
        ts.status AS today_status
      FROM engagements e
      LEFT JOIN service_day ts 
        ON ts.engagement_id = e.engagement_id
       AND ts.service_date = CURRENT_DATE
      WHERE e.engagement_id = ${Number(engagementId)}
      LIMIT 1
    `;

    if (!engagement.length) {
      return res.json({
        eligible: false,
        reason: "ENGAGEMENT_NOT_FOUND",
      });
    }

    const row = engagement[0];

    // 2️⃣ ON_DEMAND logic
    if (row.booking_type === "ON_DEMAND") {
      if (row.assignment_status !== "ASSIGNED") {
        return res.json({
          eligible: false,
          reason: "PROVIDER_NOT_ASSIGNED",
        });
      }

      if (row.today_status !== "COMPLETED") {
        return res.json({
          eligible: false,
          reason: "ENGAGEMENT_NOT_COMPLETED",
        });
      }
    }

    // 3️⃣ SHORT_TERM / MONTHLY logic
    if (row.booking_type !== "ON_DEMAND") {
      if (row.active === true) {
        return res.json({
          eligible: false,
          reason: "ENGAGEMENT_NOT_COMPLETED",
        });
      }
    }

    // 4️⃣ Check if review already exists
    const existingReview = await prisma.$queryRaw<
      { id: string }[]
    >`
      SELECT id
      FROM provider_reviews
      WHERE engagement_id = ${Number(engagementId)}
      LIMIT 1
    `;

    if (existingReview.length) {
      return res.json({
        eligible: false,
        reason: "REVIEW_ALREADY_EXISTS",
      });
    }

    // ✅ Eligible
    return res.json({
      eligible: true,
    });
  } catch (error) {
    console.error("Review eligibility error:", error);
    return res.status(500).json({
      eligible: false,
      reason: "SERVER_ERROR",
    });
  }
};


export const createReview = async (req: Request, res: Response) => {
  const { engagementId, rating, review } = req.body;

  if (!engagementId || rating === undefined) {
    return res.status(400).json({
      success: false,
      reason: "MISSING_REQUIRED_FIELDS",
    });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      reason: "INVALID_RATING",
    });
  }

  try {
    /* 1️⃣ Fetch engagement (single source of truth) */
    const engagements = await prisma.$queryRaw<
      {
        engagement_id: number;
        customerid: number;
        serviceproviderid: number | null;
        booking_type: string;
        service_type: string;
        active: boolean;
      }[]
    >`
      SELECT
        engagement_id,
        customerid,
        serviceproviderid,
        booking_type,
        service_type,
        active
      FROM engagements
      WHERE engagement_id = ${Number(engagementId)}
    `;

    if (!engagements.length) {
      return res.status(404).json({
        success: false,
        reason: "ENGAGEMENT_NOT_FOUND",
      });
    }

    const engagement = engagements[0];

    if (!engagement.serviceproviderid) {
      return res.status(400).json({
        success: false,
        reason: "PROVIDER_NOT_ASSIGNED",
      });
    }

    /* 2️⃣ Completion check */
    if (engagement.booking_type === "ON_DEMAND") {
      const completedDay = await prisma.$queryRaw<
        { status: string }[]
      >`
        SELECT status
        FROM service_days
        WHERE engagement_id = ${Number(engagementId)}
          AND status = 'COMPLETED'
        LIMIT 1
      `;

      if (!completedDay.length) {
        return res.status(400).json({
          success: false,
          reason: "SERVICE_NOT_COMPLETED",
        });
      }
    } else {
      // MONTHLY / SHORT_TERM
      if (engagement.active === true) {
        return res.status(400).json({
          success: false,
          reason: "ENGAGEMENT_NOT_COMPLETED",
        });
      }
    }

    /* 3️⃣ Prevent duplicate review */
    const duplicate = await prisma.$queryRaw<{ exists: number }[]>`
      SELECT 1 AS exists
      FROM provider_reviews
      WHERE engagement_id = ${Number(engagementId)}
      LIMIT 1
    `;

    if (duplicate.length) {
      return res.status(409).json({
        success: false,
        reason: "REVIEW_ALREADY_EXISTS",
      });
    }

    /* 4️⃣ Atomic transaction */
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
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
    ${Number(engagementId)},
    ${engagement.booking_type}, -- ✅ FIX
    ${rating},
    ${review ?? null},
    NOW()
  )
`;


      /* 5️⃣ Recalculate provider rating safely */
      await tx.$queryRaw`
        UPDATE serviceprovider
        SET rating = (
          SELECT COALESCE(AVG(rating)::double precision, 0)
          FROM provider_reviews
          WHERE serviceproviderid = ${engagement.serviceproviderid}
        )
        WHERE serviceproviderid = ${engagement.serviceproviderid}
      `;
    });

    return res.status(201).json({
      success: true,
      message: "REVIEW_CREATED_SUCCESSFULLY",
    });

  } catch (err) {
    console.error("Create review error:", err);
    return res.status(500).json({
      success: false,
      reason: "SERVER_ERROR",
    });
  }
};

function getProviderGrade(avg: number, total: number, low: number) {
  if (total < 3) return "New";
  if (avg >= 4.5 && low === 0) return "Excellent";
  if (avg >= 4.0 && low <= 1) return "Very Good";
  if (avg >= 3.0) return "Average";
  return "Needs Improvement";
}

export const getProviderReviews = async (req: Request, res: Response) => {
  const serviceProviderId = Number(req.params.serviceProviderId);
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const offset = Number(req.query.offset) || 0;
  const minRating = req.query.minRating ? Number(req.query.minRating) : null;
  const serviceType = req.query.serviceType as string | undefined;

  if (!serviceProviderId) {
    return res.status(400).json({
      success: false,
      reason: "INVALID_SERVICE_PROVIDER_ID",
    });
  }

  try {
    /* ---------- dynamic filters ---------- */
    const where: string[] = [];
const params: any[] = [];

// required
where.push(`pr.serviceproviderid = $${params.length + 1}`);
params.push(serviceProviderId);

// optional filters
if (minRating) {
  where.push(`pr.rating >= $${params.length + 1}`);
  params.push(minRating);
}

if (serviceType) {
  where.push(`pr.service_type = $${params.length + 1}`);
  params.push(serviceType);
}

const whereClause =
  where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";


    /* ---------- reviews ---------- */
    const reviews = await prisma.$queryRawUnsafe<
  {
    review_id: number;
    rating: number;
    review: string | null;
    service_type: string;
    created_at: number;
  }[]
>(`
  SELECT
    pr.review_id::int,
    pr.rating,
    pr.review,
    pr.service_type,
    FLOOR(EXTRACT(EPOCH FROM pr.created_at))::int AS created_at
  FROM provider_reviews pr
  ${whereClause}
  ORDER BY pr.created_at DESC
  LIMIT ${limit}
  OFFSET ${offset}
`, ...params);


    /* ---------- provider summary (NOT paginated) ---------- */
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
    ROUND(AVG(rating)::numeric, 1)             AS avg_rating,
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
  avg_rating: null,
  r5: 0,
  r4: 0,
  r3: 0,
  r2: 0,
  r1: 0,
  low_ratings: 0,
};


    const total = summary?.total ?? 0;
    const avg = summary?.avg_rating ?? 0;
    const low = summary?.low_ratings ?? 0;

    const grade = getProviderGrade(avg, total, low);

    return res.json({
      success: true,
      provider: {
        id: serviceProviderId,
        rating: avg,
        review_count: total,
        grade,
        distribution: {
          "5": summary?.r5 ?? 0,
          "4": summary?.r4 ?? 0,
          "3": summary?.r3 ?? 0,
          "2": summary?.r2 ?? 0,
          "1": summary?.r1 ?? 0,
        },
      },
      count: reviews.length,
      reviews,
    });

  } catch (err) {
    console.error("Get provider reviews error:", err);
    return res.status(500).json({
      success: false,
      reason: "SERVER_ERROR",
    });
  }
};

