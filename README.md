# FHIR RDF Playground

A browser-based workbench for FHIR RDF. Paste a FHIR JSON resource and get the Turtle
serialization defined by the HL7 FHIR spec, then explore it: draw the graph, run SPARQL
against it, validate it with ShEx, and check that it converts back to the JSON it came from.

Everything runs client-side. There is no server, no build step, and nothing leaves the browser.
The whole app is `index.html`.

## Hosting it on GitHub Pages

1. Create a repository and drop these files in it:

   ```
   index.html                      the playground
   .nojekyll                       stops Jekyll touching the output
   README.md
   scripts/check.mjs               CI checks (no dependencies)
   .github/workflows/deploy.yml    build + deploy to Pages on push to main
   .github/workflows/ci.yml        the same checks on pull requests
   ```

2. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
   That is the only setting to change — do not pick "Deploy from a branch".

3. Push to `main`. The `Deploy to GitHub Pages` workflow runs the checks, copies `index.html`
   into `_site/`, and publishes. The URL appears on the workflow run and under Settings → Pages,
   normally `https://<user>.github.io/<repo>/`.

Deploying from a fork or an organisation repo works the same way. For a user or organisation
site (`<user>.github.io`), nothing changes either — the workflow publishes whatever is in
`_site/`.

### What the workflows do

| Workflow | Trigger | Job |
| --- | --- | --- |
| `deploy.yml` | push to `main`, or run by hand | `check` → `build` → `deploy`. Skips docs-only pushes via `paths-ignore`. |
| `ci.yml` | pull requests and pushes to other branches | the same checks, without deploying. |

`scripts/check.mjs` needs no npm install. It pulls the script block out of `index.html` and asserts
that it parses, that every bundled sample converts to RDF, round-trips back to identical JSON,
returns rows for its preset SPARQL query, and conforms to the bundled ShEx schema. It also fails
if anyone adds an external script or a stylesheet outside Google Fonts, which would break the
page's self-contained guarantee.

To run it locally:

```sh
node scripts/check.mjs
```

Node 18 or newer. No dependencies.

### Custom domain

Add a `CNAME` file containing your domain to the repository root and add this line to the
"Assemble _site" step in `deploy.yml`:

```yaml
cp CNAME _site/CNAME
```

## What it implements

The Turtle follows the rules on <https://build.fhir.org/rdf.html>:

- every element is a node, with primitives carrying their value on `fhir:v`;
- repeating elements are RDF collections, so order survives;
- the focal resource carries `fhir:nodeRole fhir:treeRoot`;
- `uri`-typed values and references get a sibling `fhir:l` link, with `|version` rewritten
  as `?version=`;
- polymorphic `value[x]` elements become `fhir:value` with the type asserted on the node;
- `contained` resources become separate subjects at `<parent#id>`, Bundle entries are keyed
  on `fullUrl`;
- a resource with a `modifierExtension` gets the underscore-prefixed class name;
- Codings from LOINC, SNOMED CT, RxNorm, ICD-10 and MeSH gain a concept IRI on their
  CodeableConcept, built from the IRI stem registered at terminology.hl7.org.

### Known limits

- Element types are inferred from names and JSON value shapes, not from the FHIR
  StructureDefinitions. The round-trip tab shows where that guess is wrong.
- The SPARQL engine covers SELECT with BGPs, `OPTIONAL`, `FILTER`, simple property paths,
  `DISTINCT`, `ORDER BY`, `LIMIT` and `OFFSET`. No UNION, CONSTRUCT, ASK, aggregates or subqueries.
- The ShEx engine covers a subset of ShExC — enough for the bundled schema and for
  hand-written schemas, not enough to run the full [fhir.shex](https://build.fhir.org/fhir.shex)
  faithfully. `OneOf` (`|`) is approximated, and inheritance, facets and semantic actions are
  not implemented.

## References

- [FHIR RDF specification](https://build.fhir.org/rdf.html) · [published version](https://fhir.hl7.org/fhir/rdf.html)
- [HL7 ITS RDF subgroup](https://confluence.hl7.org/spaces/ITS/pages/66922543/RDF+-+FHIR+RDF)
- [w3c-cg/hcls-fhir-rdf](https://github.com/w3c-cg/hcls-fhir-rdf/issues) — where the open questions live
- [FHIRCat playground](https://fhircat.github.io/fhir-rdf-playground/)
- [FHIR RDF as a Bridge to the Semantic Web](https://github.com/yosemiteproject/Tutorial-FHIR-RDF-as-a-Bridge)
- [RDF Playground](https://rdfplayground.dcc.uchile.cl/) · [Pablo Caeg's FHIR playground](https://pablocaeg.github.io/fhir-playground/)
