import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { prisma } from "../src/db";
import { sendModuleScore } from "../src/lti/grade-passback";

test("LTI 1.1 passback reads then replaces the outcome score", async () => {
  const suffix = randomUUID();
  let replaceBody = "";
  let readText = "0.3";
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const isRead = body.includes("readResult");
      if (!isRead) replaceBody = body;
      const operation = isRead ? "readResult" : "replaceResult";
      const result = isRead
        ? `<readResultResponse><result><resultScore><language>en</language><textString>${readText}</textString></resultScore></result></readResultResponse>`
        : "<replaceResultResponse/>";
      res.setHeader("Content-Type", "application/xml");
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<imsx_POXEnvelopeResponse xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">` +
        `<imsx_POXHeader><imsx_POXResponseHeaderInfo><imsx_version>V1.0</imsx_version>` +
        `<imsx_messageIdentifier>1</imsx_messageIdentifier><imsx_statusInfo>` +
        `<imsx_codeMajor>success</imsx_codeMajor><imsx_severity>status</imsx_severity>` +
        `<imsx_description>ok</imsx_description><imsx_messageRefIdentifier>1</imsx_messageRefIdentifier>` +
        `<imsx_operationRefIdentifier>${operation}</imsx_operationRefIdentifier>` +
        `</imsx_statusInfo></imsx_POXResponseHeaderInfo></imsx_POXHeader>` +
        `<imsx_POXBody>${result}</imsx_POXBody></imsx_POXEnvelopeResponse>`
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;

  const now = new Date();
  const role = await prisma.globalRoles.findFirstOrThrow({ orderBy: { id: "asc" } });
  const user = await prisma.users.create({
    data: {
      email: `lti11-passback-${suffix}@example.com`,
      slug: `lti11-passback-${suffix}`,
      first_name: "LTI",
      last_name: "OneOne",
      global_role_id: role.id,
    },
  });
  const lms = await prisma.lmsInstances.create({
    data: {
      url: `https://lti11-${suffix}.example`,
      consumer_key: "consumer-key",
      consumer_secret: "consumer-secret",
      created_at: now,
      updated_at: now,
    },
  });
  const progress = await prisma.odsaModuleProgresses.create({
    data: {
      user_id: user.id,
      inst_book_id: 1,
      inst_chapter_module_id: null,
      lis_outcome_service_url: `http://127.0.0.1:${port}/outcomes`,
      lis_result_sourcedid: "sourcedid-123",
      first_done: now,
      last_done: now,
      proficient_date: new Date(0),
      current_score: 0.75,
      highest_score: 0.75,
      last_passback: new Date(0),
      created_at: now,
      updated_at: now,
    },
  });

  try {
    const result = await sendModuleScore({
      ltik: null,
      lmsInstanceId: lms.id,
      moduleProgress: progress,
      scoreMaximum: 4,
      scoreIncreased: true,
      isComplete: false,
    });
    assert.equal(result.sent, true);
    assert.equal(result.protocol, "1.1");
    assert.match(replaceBody, /replaceResult/);
    assert.match(replaceBody, /0.75/);

    const saved = await prisma.odsaModuleProgresses.findUniqueOrThrow({
      where: { id: progress.id },
    });
    assert(saved.last_passback.getTime() > 0);

    // Canvas can return a successful readResult envelope with an empty score
    // for an ungraded assignment. The replaceResult must still be attempted.
    readText = "";
    await prisma.odsaModuleProgresses.update({
      where: { id: progress.id },
      data: { current_score: 0.9, highest_score: 0.9, last_passback: new Date(0) },
    });
    const second = await sendModuleScore({
      ltik: null,
      lmsInstanceId: lms.id,
      moduleProgress: await prisma.odsaModuleProgresses.findUniqueOrThrow({
        where: { id: progress.id },
      }),
      scoreMaximum: 4,
      scoreIncreased: true,
      isComplete: false,
    });
    assert.equal(second.sent, true);
    assert.match(replaceBody, /0.9/);
  } finally {
    server.close();
    await prisma.odsaModuleProgresses.deleteMany({ where: { user_id: user.id } });
    await prisma.lmsInstances.delete({ where: { id: lms.id } });
    await prisma.users.delete({ where: { id: user.id } });
  }
});
