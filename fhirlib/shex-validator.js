const EvalSimple1err = require('@shexjs/eval-simple-1err');
const ShExUtil = require('@shexjs/util');
const ShExValidator = require('@shexjs/validator');
const N3Store = require('n3').Store;
const N3DataFactory = require('n3').DataFactory;

class Serializer {
  constructor(schema) {
    this.schema = schema;
  }

  validateResource(resource) {
    // Extract triples
    const rootTriple = this.expectOne(resource.store.getQuads(null, 'http://hl7.org/fhir/nodeRole', 'http://hl7.org/fhir/treeRoot'), 'nodeRole treeRoot');
    const node = rootTriple.subject;
    const typeTriple = this.expectOne(resource.store.getQuads(node, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', null), 'fhir type');
    const type = this.expectFhirResource(typeTriple.object);

    // Define the shape URL
    const shape = 'http://hl7.org/fhir/shex/' + type;

    // Initialize RDF database and ShEx validator
    const db = ShExUtil.rdfjsDB(resource.store, null);  // RDF.js database
    const validator = ShExValidator.construct(this.schema, db, {
      regexModule: EvalSimple1err
    });

    // Validate the resource using the ShEx schema
    const res = validator.validate([{ node, shape }]);

    // Check if validation passed
    if (!('solution' in res)) {
      throw res;
    }

    const matched = [];
    const seen = new N3Store();  // For de-duplicating triples
    const matchedDb = {
      addQuad: function (q) {
        if (!seen.countQuads(q.subject, q.predicate, q.object, q.graph)) {
          seen.addQuad(q);
          matched.push(q);
        }
      }
    };

    // Generate proof graph from validation result
    ShExUtil.getProofGraph(res, matchedDb, N3DataFactory);

    // Remove matched quads from the store
    matched.forEach(q => resource.store.removeQuad(q));

    return matched;
  }

  expectOne(quads, description) {
    if (quads.length !== 1) {
      throw new Error(`Expected 1, got ${quads.length} matches for ${description}`);
    }
    return quads[0];
  }

  expectFhirResource(node) {
    return node.value.substr('http://hl7.org/fhir/'.length);
  }
}

// Example function to retrieve ShEx schema and RDF/N3 output
function retrieveShExAndRDF() {
  const nt = playground.outputs['nquads'].getValue();
  const shex_url = "https://build.fhir.org/" + document.querySelector(".active").querySelector("span").innerText.slice(0, document.querySelector(".active").querySelector("span").innerText.indexOf(" (")).toLowerCase() + ".shex";

  return { nt, shex_url };
}

module.exports = { Serializer, retrieveShExAndRDF };
