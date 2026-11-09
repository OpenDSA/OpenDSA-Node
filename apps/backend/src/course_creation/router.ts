import { requireAuthentication, requireCsrf, canManageOffering } from "../auth";
import { prisma } from "../db";
import { Request, Response, Router } from "express";
import { BookCompileError } from "./compile_book";
import { getCompileConfig } from "./config";
import { generateCourse } from "./generate_course";
import type { GenerateCourseInput } from "./types";

export const generateCourseRouter = Router();

generateCourseRouter.post(
  "/inst_books/:id/generate_course", requireAuthentication, requireCsrf,
  async (req: Request, res: Response) => {
    try {
      const instBookId = Number(req.params.id);
      const {
        launchUrl,
        resourceSelectionUrl,
        extrtoolLaunchBaseUrl,
      } = req.body as Partial<GenerateCourseInput>;

      if (
        !Number.isFinite(instBookId) ||
        !launchUrl ||
        !resourceSelectionUrl ||
        !extrtoolLaunchBaseUrl ||
        !Number.isInteger(instBookId) || instBookId <= 0 || instBookId > 2147483647
      ) {
        res.status(400).json({
          error:
            "Missing required parameters: instBookId, launchUrl, resourceSelectionUrl, extrtoolLaunchBaseUrl",
        });
        return;
      }

      const config = getCompileConfig();
      if ("userId" in req.body) {
        res.status(400).json({ error: "User identity comes from your session." }); return;
      }
      const book = await prisma.instBooks.findUnique({ where: { id: instBookId }, select: { course_offering_id: true } });
      if (!book) { res.status(404).json({ error: "Book not found." }); return; }
      if (!book.course_offering_id || !await canManageOffering(req.user!, book.course_offering_id)) {
        res.status(403).json({ error: "You cannot generate this book." }); return;
      }
      const result = await generateCourse({
        instBookId,
        userId: req.user!.id,
        launchUrl,
        resourceSelectionUrl,
        extrtoolLaunchBaseUrl,
        openDsaSharedDir: config.openDsaSharedDir,
        configApiLink: config.configApiLink,
        timeoutMs: config.timeoutMs,
      });

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof BookCompileError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  }
);
