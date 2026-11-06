import { Request, Response, Router } from "express";
import { BookCompileError } from "./compile_book";
import { getCompileConfig } from "./config";
import { generateCourse } from "./generate_course";
import type { GenerateCourseInput } from "./types";

export const generateCourseRouter = Router();

generateCourseRouter.post(
  "/inst_books/:id/generate_course",
  async (req: Request, res: Response) => {
    try {
      const instBookId = Number(req.params.id);
      const {
        launchUrl,
        resourceSelectionUrl,
        extrtoolLaunchBaseUrl,
        userId,
      } = req.body as Partial<GenerateCourseInput>;

      if (
        !Number.isFinite(instBookId) ||
        !launchUrl ||
        !resourceSelectionUrl ||
        !extrtoolLaunchBaseUrl ||
        typeof userId !== "number"
      ) {
        res.status(400).json({
          error:
            "Missing required parameters: instBookId, launchUrl, resourceSelectionUrl, extrtoolLaunchBaseUrl, userId",
        });
        return;
      }

      const config = getCompileConfig();
      const result = await generateCourse({
        instBookId,
        launchUrl,
        resourceSelectionUrl,
        extrtoolLaunchBaseUrl,
        userId,
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
