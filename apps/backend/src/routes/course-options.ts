import { Request, Response, Router } from "express";
import { courseOptions } from "../services/course-options";

export const courseOptionsRouter = Router();

// Only expose explicit dropdown fields; database errors must not leak credentials.
function readOptions(load: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      res.json({ data: await load(req) });
    } catch {
      res.status(500).json({ error: "Unable to load course offering options." });
    }
  };
}

courseOptionsRouter.get("/organizations", readOptions(() => courseOptions.organizations()));
courseOptionsRouter.get("/terms", readOptions(() => courseOptions.terms()));
courseOptionsRouter.get("/book-instances", readOptions(() => courseOptions.bookInstances()));
courseOptionsRouter.get("/lms-instances", readOptions(() => courseOptions.lmsInstances()));
courseOptionsRouter.get("/courses", (req, res, next) => {
  if (Object.keys(req.query).some(key => key !== "organization_id")) {
    res.status(400).json({ error: "Only the organization_id query parameter is supported." });
    return;
  }
  const value = req.query.organization_id;
  if (value !== undefined && (
    typeof value !== "string" || !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647
  )) {
    res.status(400).json({ error: "organization_id must be a positive 32-bit integer." });
    return;
  }
  next();
}, readOptions(req => courseOptions.courses(
  req.query.organization_id === undefined ? undefined : Number(req.query.organization_id),
)));
