import { Router } from "express";
import { createCourseOffering, parseCourseOffering, courseOfferingError } from "../services/course-offerings";

export const courseOfferingsRouter = Router();

courseOfferingsRouter.post("/course-offerings", async (req, res) => {
  try {
    const input = parseCourseOffering(req.body);
    const offering = await createCourseOffering(input);
    res.status(201).json({ data: offering });
  } catch (error) {
    const result = courseOfferingError(error);
    res.status(result.status).json({ error: result.error });
  }
});
