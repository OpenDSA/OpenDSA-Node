import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import StandaloneCompilation from "../src/pages/StandaloneCompilation";

const offering = { label: "Standalone test", course: { number: "CS3114", name: "Data Structures" }, term: { slug: "fall-2026" }, inst_books: [{ id: 1, title: "Test book" }] };
function render(generating = false, bookUrl = "", error = "") {
  return renderToStaticMarkup(<MemoryRouter><StandaloneCompilation offering={offering} generating={generating} bookUrl={bookUrl} error={error} onCompile={() => {}} /></MemoryRouter>);
}
test("standalone compilation starts ready and explains the absence of LMS integration", () => {
  const html = render();
  assert.match(html, /Compile Textbook/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /When you click this button the OpenDSA book will be generated as an independent resource. This book will have no LMS ties such as Canvas integration./);
  assert.ok(!html.includes("Textbook URL</a>"));
});
test("compilation uses indeterminate progress and disables repeat submissions", () => {
  const html = render(true);
  assert.ok(!html.includes("aria-valuenow="));
  assert.match(html, /disabled=""[^>]*>Compiling…/);
  assert.ok(!html.includes(">100%</span>"));
});
test("success shows the hosted link, 100 percent, and recompile action; failures allow retry", () => {
  const html = render(false, "https://books.example/Books/test/html/index.html");
  assert.match(html, /Book generated successfully/);
  assert.match(html, /aria-valuenow="100"/);
  assert.match(html, /href="https:\/\/books.example\/Books\/test\/html\/index.html"/);
  assert.match(html, /Recompile Book/);
  const failure = render(false, "", "Compiler unavailable");
  assert.match(failure, /role="alert"/);
  assert.match(failure, /Compiler unavailable/);
  assert.match(failure, /Compile Textbook/);
  assert.ok(!failure.includes("disabled="));
});
