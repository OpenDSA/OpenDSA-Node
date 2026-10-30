import { requireAuthentication, requireInstructor, requireCsrf, canManageOffering } from "../auth";
import { Router } from "express";
import { createCourseOffering, parseCourseOffering, courseOfferingError, getGenerationContext, generateBook } from "../services/course-offerings";
import { prisma } from "../db";

export const courseOfferingsRouter = Router();

courseOfferingsRouter.post("/course-offerings", requireAuthentication, requireInstructor, requireCsrf, async (req, res) => {
  try {
    const input = parseCourseOffering(req.body);
    // Saving/reusing an offering never calls Canvas or requires its credentials.
    const offering = await createCourseOffering(input, req.user!.id);
    if (offering.reused && !await canManageOffering(req.user!, offering.id)) {
      res.status(403).json({ error: "You cannot manage this offering." }); return;
    }
    res.status(offering.reused ? 200 : 201).json({ data: offering, url: `/course-offerings/${offering.id}` });
  } catch (error) {
    const result = courseOfferingError(error);
    res.status(result.status).json({ error: result.error });
  }
});

courseOfferingsRouter.get("/course-offerings/:id", async (req, res) => {
  if (!/^[1-9]\d*$/.test(String(req.params.id)) || Number(req.params.id) > 2147483647) {
    res.status(400).json({ error: "Invalid offering ID." }); return;
  }
  try {
    const offering = await prisma.courseOfferings.findUnique({ where: { id: Number(req.params.id) }, select: {
      id: true, label: true, lms_course_num: true,
      course: { select: { name: true, number: true } },
      term: { select: { slug: true } }, lms_instance: { select: { url: true } },
      inst_books: { select: { id: true, title: true }, orderBy: { id: "asc" } },
    } });
    if (!offering) { res.status(404).json({ error: "Offering not found." }); return; }
    res.json({ data: offering });
  } catch { res.status(500).json({ error: "Unable to load the offering." }); }
});

courseOfferingsRouter.post("/course-offerings/:id/generate", requireAuthentication, requireCsrf, async (req, res) => {
  try {
    if (!/^[1-9]\d*$/.test(String(req.params.id)) || Number(req.params.id) > 2147483647) {
      res.status(400).json({ error: "Invalid offering ID." }); return;
    }
    if (!await canManageOffering(req.user!, Number(req.params.id))) {
      res.status(403).json({ error: "You cannot manage this offering." }); return;
    }
    const offering = await prisma.courseOfferings.findUnique({ where: { id: Number(req.params.id) },
      include: { inst_books: { select: { id: true, user_id: true } } } });
    if (!offering) { res.status(404).json({ error: "Offering not found." }); return; }
    const context = await getGenerationContext(offering.lms_instance_id, req.user!.id);
    if (offering.inst_books.length !== 1) {
      res.status(403).json({ error: "Offering must have exactly one book." }); return;
    }
    try {
      const result = await generateBook(offering.inst_books[0].id, context);
      const bookUrl = `${context.bookPublicBaseUrl.replace(/\/+$/, "")}/${result.buildPath.split("/").map(encodeURIComponent).join("/")}/html/index.html`;
      res.json({ data: { id: offering.id, inst_book_id: offering.inst_books[0].id, book_url: bookUrl }, generation: { status: "succeeded" } });
    } catch (error) {
      const result = courseOfferingError(error);
      res.status(result.status === 409 ? 409 : 502).json({ error: result.status === 409 ? result.error : "Generation failed; the saved offering and book are retained." });
    }
  } catch (error) {
    const result = courseOfferingError(error);
    res.status(result.status).json({ error: result.error });
  }
});
