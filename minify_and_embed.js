#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const terser = require("terser");

async function run() {
  const root = path.resolve(__dirname);
  const srcJs = path.join(root, "code.js");
  const srcHtml = path.join(root, "instagram_checkerv2.html");
  const outHtml = path.join(root, "instagram_checkerv2.embedded.html");
  const outMinJs = path.join(root, "code.min.js");

  if (!fs.existsSync(srcJs)) throw new Error("code.js not found");
  if (!fs.existsSync(srcHtml)) throw new Error("instagram_checkerv2.html not found");

  const code = fs.readFileSync(srcJs, "utf8");
  console.log("Minifying code.js...");

  const minified = await terser.minify(code, {
    ecma: 2018,
    module: false,
    toplevel: false,   // false evita que o Terser remova a IIFE
    compress: {
      passes: 2,
      drop_console: false,
    },
    mangle: true,
    output: {
      ascii_only: true,  // converte emojis para \uXXXX — resolve o SyntaxError
      semicolons: true,
    },
  });

  if (!minified.code) throw new Error("Terser failed to produce output");

  // Sem transformação de regex — preserva o formato que o Terser gerou
  const code_clean = minified.code;

  fs.writeFileSync(outMinJs, code_clean, "utf8");
  console.log("Wrote", outMinJs);

  // Escape para embed seguro em template literal
  const safeMinified = code_clean
    .replace(/\\/g, "\\\\")   // escapa backslashes primeiro
    .replace(/`/g, "\\`")     // depois backticks
    .replace(/\$\{/g, "\\${"); // depois interpolações

  const html = fs.readFileSync(srcHtml, "utf8");
  if (!html.includes("__INJECT_MINIFIED_SCRIPT_HERE__")) {
    console.warn("Marker not found in HTML; no replacement performed.");
    fs.writeFileSync(outHtml, html, "utf8");
    return;
  }

  const replaced = html.replace("__INJECT_MINIFIED_SCRIPT_HERE__", safeMinified);
  fs.writeFileSync(outHtml, replaced, "utf8");
  console.log("Wrote", outHtml);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});