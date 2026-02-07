import { Router } from "express";
import { checkReviewEligibility, createReview , getProviderReviews} from "./reviews.controller";

const router = Router();

router.get("/eligibility", checkReviewEligibility);

router.post("/", createReview);

// reviews.routes.ts
router.get("/providers/:serviceProviderId/reviews", getProviderReviews);


export default router;


/**
 * @swagger
 * /reviews/eligibility:
 *   get:
 *     summary: Check if a customer can submit a review
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: query
 *         name: serviceType
 *         schema:
 *           type: string
 *           enum: [ON_DEMAND, SHORT_TERM, MONTHLY]
 *         required: true
 *       - in: query
 *         name: engagementId
 *         schema:
 *           type: integer
 *         required: false
 *     responses:
 *       200:
 *         description: Eligibility result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eligible:
 *                   type: boolean
 *                 reason:
 *                   type: string
 * 
 */

/**
 * @swagger
 * /reviews:
 *   post:
 *     summary: Create a review for a completed service
 *     tags:
 *       - Reviews
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - engagementId
 *               - rating
 *             properties:
 *               engagementId:
 *                 type: integer
 *                 example: 133
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               review:
 *                 type: string
 *                 example: "Great service, very professional"
 *     responses:
 *       201:
 *         description: Review created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: REVIEW_CREATED
 *       400:
 *         description: Validation error
 *       404:
 *         description: Engagement not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /reviews/providers/{serviceProviderId}/reviews:
 *   get:
 *     summary: Get reviews for a service provider
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: path
 *         name: serviceProviderId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *       - in: query
 *         name: serviceType
 *         schema:
 *           type: string
 *           enum: [ON_DEMAND, SHORT_TERM, MONTHLY]
 *     responses:
 *       200:
 *         description: Provider reviews
 */
