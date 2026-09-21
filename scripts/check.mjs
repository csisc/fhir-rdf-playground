#!/usr/bin/env node
/**
 * check.mjs — CI for the FHIR RDF Playground.
 *
 * The playground is one self-contained HTML file, so there is nothing to
 * build. This script pulls the script block out of index.html and exercises
 * the parts that are not UI:
 *
 *   1. the whole script block parses as JavaScript;
 *   2. every bundled sample converts to RDF;
 *   3. every sample round-trips back to the JSON it came from;
 *   4. every sample's preset SPARQL query returns at least one row;
 *   5. every sample conforms to the bundled ShEx schema;
 *   6. the page has no external script or stylesheet it should not have.
 *
 * Run it locally the same way CI does:  node scripts/check.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(root, ".ci");
const html = readFileSync(join(root, "index.html"), "utf8");

let failures = 0;
const ok = (msg) => console.log("  ok    " + msg);
const bad = (msg) => { failures++; console.log("  FAIL  " + msg); };

/* ---- 1. the script block parses ---- */
const scriptStart = html.indexOf('<script>\n"use strict";');
if (scriptStart < 0) { console.error("No <script> block found in index.html"); process.exit(1); }
const script = html.slice(scriptStart + '<script>\n"use strict";'.length).split("</script>")[0];

mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, "full.cjs"), script);
try {
  execFileSync(process.execPath, ["--check", join(tmp, "full.cjs")], { stdio: "pipe" });
  ok("index.html script block parses");
} catch (e) {
  bad("index.html script block does not parse:\n" + e.stderr.toString());
  process.exit(1);
}

/* ---- load the non-UI half as a module ---- */
const engineSrc = script.split("const $=(s)=>document.querySelector(s);")[0];
writeFileSync(
  join(tmp, "engine.cjs"),
  engineSrc +
    "\nmodule.exports={parseJSON,convert,serializeTurtle,serializeNTriples,rdfToJSON," +
    "deepDiff,runSparql,parseShEx,validateShEx,SAMPLES,FHIR_SHEX,NS};\n"
);
const require = createRequire(import.meta.url);
const E = require(join(tmp, "engine.cjs"));

const OPTS = { base: "http://example.org/fhir/", link: true, concept: true };

/* ---- 2-5. the samples ---- */
let schema;
try { schema = E.parseShEx(E.FHIR_SHEX); ok(`bundled ShEx schema parses (${schema.order.length} shapes)`); }
catch (e) { bad("bundled ShEx schema does not parse: " + e.message); }

for (const sample of E.SAMPLES) {
  const name = sample.name.split(" — ")[0];
  const json = JSON.stringify(sample.json, null, 2);
  let model;
  try {
    model = E.convert(E.parseJSON(json), OPTS);
    if (!model.triples.length) throw new Error("no triples produced");
    E.serializeTurtle(model.triples, { shorthand: false });
    E.serializeNTriples(model.triples);
    ok(`${name}: ${model.triples.length} triples`);
  } catch (e) { bad(`${name}: conversion failed — ${e.message}`); continue; }

  try {
    const diffs = E.deepDiff(JSON.parse(json), E.rdfToJSON(model.triples));
    if (diffs.length) bad(`${name}: round-trip lost ${diffs.length} value(s), first at ${diffs[0].path}`);
    else ok(`${name}: round-trip is lossless`);
  } catch (e) { bad(`${name}: round-trip failed — ${e.message}`); }

  try {
    const { rows } = E.runSparql(sample.query, model.triples);
    if (!rows.length) bad(`${name}: preset query returned no rows`);
    else ok(`${name}: preset query returned ${rows.length} row(s)`);
  } catch (e) { bad(`${name}: preset query failed — ${e.message}`); }

  if (schema) {
    try {
      const v = E.validateShEx(schema, model.triples, model.rootSubject, "start");
      if (v.ok) ok(`${name}: conforms to <${v.label}>`);
      else bad(`${name}: does not conform to <${v.label}> — ` +
        (v.rows || []).filter(r => !r.ok).map(r => r.pred + " (" + r.note + ")").join("; "));
    } catch (e) { bad(`${name}: ShEx validation failed — ${e.message}`); }
  }
}

/* ---- 6. the page stays self-contained ---- */
const externalScripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
if (externalScripts.length) bad("external <script src> found: " + externalScripts.join(", "));
else ok("no external scripts");

const sheets = [...html.matchAll(/<link[^>]+href=["'](https?:\/\/[^"']+)["']/g)].map(m => m[1]);
const allowedHosts = ["fonts.googleapis.com", "fonts.gstatic.com"];
const stray = sheets.filter(u => !allowedHosts.some(h => u.includes(h)));
if (stray.length) bad("unexpected external stylesheet: " + stray.join(", "));
else ok("stylesheets limited to Google Fonts");

rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
