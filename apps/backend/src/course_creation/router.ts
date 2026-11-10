import { requireAuthentication, requireCsrf, requireInstructor, canManageOffering } from "../auth";
import { prisma } from "../db";
import { Request, Response, Router } from "express";
import { BookCompileError, compileBook } from "./compile_book";
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

/**
 * Compile-only path, mirroring Rails' InstBooksController#compile →
 * CompileBookJob: no Canvas calls, just serialize/write/configure.
 *
 * Works for LMS offerings and for standalone/textbook offerings; the latter
 * sets standaloneModules (the compiler's --standalone-modules flag), matching
 * Rails' is_textbook check.
 */
generateCourseRouter.post(
  "/inst_books/:id/compile",
  requireAuthentication,
  requireCsrf,
  requireInstructor,
  async (req: Request, res: Response) => {
    try {
      const instBookId = Number(req.params.id);
      if (
        !Number.isInteger(instBookId) ||
        instBookId <= 0 ||
        instBookId > 2147483647
      ) {
        res.status(400).json({ error: "Invalid book ID." });
        return;
      }

      const book = await prisma.instBooks.findUnique({
        where: { id: instBookId },
        select: {
          id: true,
          user_id: true,
          course_offering_id: true,
          course_offering: {
            select: { id: true, lms_instance: { select: { url: true } } },
          },
        },
      });
      if (!book) {
        res.status(404).json({ error: "Book not found." });
        return;
      }

      if (book.course_offering_id) {
        if (!(await canManageOffering(req.user!, book.course_offering_id))) {
          res.status(403).json({ error: "You cannot compile this book." });
          return;
        }
      } else if (
        book.user_id !== req.user!.id &&
        !req.user!.global_role.can_manage_all_courses
      ) {
        res.status(403).json({ error: "You cannot compile this book." });
        return;
      }

      const requestedBaseUrl = (req.body ?? {}) as {
        extrtoolLaunchBaseUrl?: unknown;
      };
      if (
        requestedBaseUrl.extrtoolLaunchBaseUrl !== undefined &&
        typeof requestedBaseUrl.extrtoolLaunchBaseUrl !== "string"
      ) {
        res.status(400).json({ error: "extrtoolLaunchBaseUrl must be a string." });
        return;
      }
      // Rails derives this from request.protocol + host_with_port. Keep the
      // legacy path so learning-tool sections compile the same way.
      const extrtoolLaunchBaseUrl =
        typeof requestedBaseUrl.extrtoolLaunchBaseUrl === "string" &&
        requestedBaseUrl.extrtoolLaunchBaseUrl.trim()
          ? requestedBaseUrl.extrtoolLaunchBaseUrl.trim()
          : `${req.protocol}://${req.get("host") ?? "localhost"}/lti/launch_extrtool`;

      const lmsUrl = book.course_offering?.lms_instance.url;
      const standaloneModules =
        lmsUrl === "TEXTBOOK" || lmsUrl === "seed-TEXTBOOK";

      const config = getCompileConfig();
      const result = await compileBook(instBookId, {
        userId: req.user!.id,
        extrtoolLaunchBaseUrl,
        openDsaSharedDir: config.openDsaSharedDir,
        configApiLink: config.configApiLink,
        timeoutMs: config.timeoutMs,
        standaloneModules,
      });

      const bookUrl = `${config.booksPublicBaseUrl.replace(/\/+$/, "")}/${result.buildPath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}/html/index.html`;

      res.status(200).json({
        data: {
          instBookId: result.instBookId,
          buildPath: result.buildPath,
          bookUrl,
          configPath: result.configPath,
          compileResponse: result.compileResponse,
        },
      });
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
