import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { RecordContextProvider } from "react-admin";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { UpdateBookConfigButton } from "../src/pages/AdminBookUpload";

test("Update Configuration renders an actual navigation link to the selected book's upload page", () => {
  const html = renderToStaticMarkup(<MemoryRouter><ThemeProvider theme={createTheme()}>
    <RecordContextProvider value={{ id: 18, title: "Test book" }}><UpdateBookConfigButton /></RecordContextProvider>
  </ThemeProvider></MemoryRouter>);
  assert.match(html, /<a[^>]+href="\/admin\/books\/18\/update-configuration"/);
  assert.match(html, /Update Configuration/);
});
