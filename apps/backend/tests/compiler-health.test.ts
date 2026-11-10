import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/db";
import { generateBook } from "../src/services/course-offerings";

test("generation checks /healthz before loading the book or contacting Canvas", async () => {
  const originalFetch = globalThis.fetch;
  const originalLookup = prisma.instBooks.findUnique;
  const requests: string[] = [];
  let healthy = true;
  let lookups = 0;
  const context = {
    userId: 1, canvasContentOnly: true, launchUrl: "", resourceSelectionUrl: "", extrtoolLaunchBaseUrl: "",
    bookPublicBaseUrl: "https://books.test.invalid/Books", openDsaSharedDir: "/tmp/unused",
    configApiLink: "http://compiler.test.invalid:8080/api/configure/",
  };
  try {
    globalThis.fetch = (async (url: any) => {
      const address = String(url);
      requests.push(address);
      assert.equal(address, "http://compiler.test.invalid:8080/healthz");
      return new Response("", { status: healthy ? 200 : 503 });
    }) as typeof fetch;
    prisma.instBooks.findUnique = (async () => { lookups++; return null; }) as any;
    // A healthy compiler allows orchestration to proceed to the book lookup.
    await assert.rejects(generateBook(1, context), /not found/);
    assert.equal(lookups, 1);
    healthy = false;
    for (let retry = 0; retry < 2; retry++) {
      await assert.rejects(generateBook(1, context), (error: any) =>
        error.status === 503 && /compiler is not available/.test(error.message));
    }
    assert.equal(lookups, 1, "Unhealthy compiler must stop generation before database/Canvas work");
    assert.equal(requests.length, 3, "Retries must release the generation lock");
  } finally {
    globalThis.fetch = originalFetch;
    prisma.instBooks.findUnique = originalLookup;
    await prisma.$disconnect();
  }
});
