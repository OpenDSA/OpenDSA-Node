import { requireAuthentication, requireCsrf, requireInstructor } from "../auth";
import { Router, type Response } from "express";
import { prisma } from "../db";
import { getCompileConfig } from "../course_creation/config";
import { BookConfigError, importBookConfig } from "../services/import-book-config";
import { Simple2FullError } from "../services/simple2full";

export const instBooksRouter = Router();

function sendImportError(res: Response, error: unknown) {
  if (error instanceof BookConfigError || error instanceof Simple2FullError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error("[book import]", error);
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: message });
}

function readConfig(req: { body?: unknown }): unknown {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BookConfigError(400, "A JSON object with a config field is required.");
  }
  if (!("config" in body)) {
    throw new BookConfigError(400, "The request body must contain a config object.");
  }
  return (body as { config: unknown }).config;
}

instBooksRouter.post(
  "/inst_books/import",
  requireAuthentication,
  requireCsrf,
  requireInstructor,
  async (req, res) => {
    try {
      const config = readConfig(req);
      const settings = getCompileConfig();
      const result = await importBookConfig(config, {
        userId: req.user!.id,
        openDsaSharedDir: settings.openDsaSharedDir,
        simple2fullApiLink: settings.simple2fullApiLink,
        timeoutMs: settings.timeoutMs,
      });

      res.status(201).json({ data: result });
    } catch (error) {
      sendImportError(res, error);
    }
  }
);

instBooksRouter.post(
  "/inst_books/:id/import",
  requireAuthentication,
  requireCsrf,
  requireInstructor,
  async (req, res) => {
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
        select: { id: true, user_id: true },
      });
      if (!book) {
        res.status(404).json({ error: "Book not found." });
        return;
      }
      if (
        book.user_id !== req.user!.id &&
        !req.user!.global_role.can_manage_all_courses
      ) {
        res.status(403).json({ error: "You cannot update this book." });
        return;
      }

      const config = readConfig(req);
      const settings = getCompileConfig();
      const result = await importBookConfig(config, {
        userId: req.user!.id,
        instBookId,
        openDsaSharedDir: settings.openDsaSharedDir,
        simple2fullApiLink: settings.simple2fullApiLink,
        timeoutMs: settings.timeoutMs,
      });

      res.status(200).json({ data: result });
    } catch (error) {
      sendImportError(res, error);
    }
  }
);
