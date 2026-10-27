import { Router } from "express";
import { prisma } from "../db";
import { generateCourseRouter } from "../course_creation";

import { courseOfferingsRouter } from "./course-offerings";
import { courseOptionsRouter } from "./course-options";

export const apiRouter = Router();


apiRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "backend" });
});

apiRouter.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "database" });
  } catch (err) {
    res.status(500).json({ status: "error", service: "database" });
  }
});


// Add router files for each endpoint group here.
apiRouter.use(courseOptionsRouter);
apiRouter.use(courseOfferingsRouter);
apiRouter.use(generateCourseRouter);
