import { Request, Response, Router } from "express";
import { generateCourse } from "./generate_course";
import { GenerateCourseInput } from "./types";

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

      const result = await generateCourse({
        instBookId,
        launchUrl,
        resourceSelectionUrl,
        extrtoolLaunchBaseUrl,
        userId,
        openDsaSharedDir: process.env.OPENDSA_SHARED_DIR || "public/OpenDSA", // TODO: decouple env var handling
        configApiLink: process.env.CONFIG_API_LINK || "http://opendsa:8080/api/configure/",
      });

      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  }
);
