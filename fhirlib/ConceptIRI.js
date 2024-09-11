/*
 * Concept IRI handling code.
 */

const fs = require('fs');
const path = require('path');

/**
 * A class for converting FHIR Codings into RDF.
 */
class ConceptIRI {
  /**
   * Encode a code such that it can be concatenated into an IRI.
   */
  static codeToIRI(code) {
    let invalid_characters = [];

    // This definition of iunreserved is from RFC 3987, section 2.2
    // https://datatracker.ietf.org/doc/html/rfc3987#section-2.2
    const escaped_code = code.replace(/[^A-Za-z0-9\-\._~]/gu, function(ch) {
      const cp = ch.codePointAt(0);

      if (cp < 0x00A0) {
        // Characters below U+00A0 that are not one of the allowed
        // characters (ALPHA/DIGIT/"-"/"."/"_"/"~") should be escaped.
        //
        // In practice, this applies to characters in the Basic Latin
        // block (U+0000 to U+007F), since characters between U+0080
        // and U+00A0 are various special characters, such as padding
        // characters, no break here, reverse index, cancel character
        // and so on. But for completeness, we'll escape them anyway.
        const buff = Buffer.from(ch, 'utf-8');
        const list = [...buff].map(utf8ch => {
          // console.log(`UTF8 character found in code '${code}': U+${cp} contains UTF-8 character ${utf8ch} (${utf8ch.toString(16)})`);
          if (utf8ch <= 0x0F) return `%0${utf8ch.toString(16).toUpperCase()}`;
          else if (utf8ch <= 0xFF) return `%${utf8ch.toString(16).toUpperCase()}`;
          else throw new Error(
                `Unexpected UTF8 character found in code '${code}': U+${cp} contains UTF-8 character ${utf8ch} (${utf8ch.toString(16)})`
            );
        });
        const ch0 = ch.codePointAt(0) || Number(0)
        const ch1 = ch.codePointAt(1) || Number(0)
        // console.log(`Converted ${ch} (U+${ch0.toString(16)} U+${ch1.toString(16)}) to ${list} (${buff.length} -> ${list.length})`);

        // console.log(`ch = ${ch} (${cp.toString(16)}): Buffer(${buff}) [${buff.lengnth}] => ${list} [${list.length}] => ${list.join("")}`);

        return list.join("");
      } else if (
        (cp >= 0x00A0 && cp <= 0xD7FF) ||
        (cp >= 0xF900 && cp <= 0xFDCF) ||
        (cp >= 0xFDF0 && cp <= 0xFFEF) ||
        (cp >= 0x10000 && cp <= 0x1FFFD) ||
        (cp >= 0x20000 && cp <= 0x2FFFD) ||
        (cp >= 0x30000 && cp <= 0x3FFFD) ||
        (cp >= 0x40000 && cp <= 0x4FFFD) ||
        (cp >= 0x50000 && cp <= 0x5FFFD) ||
        (cp >= 0x60000 && cp <= 0x6FFFD) ||
        (cp >= 0x70000 && cp <= 0x7FFFD) ||
        (cp >= 0x80000 && cp <= 0x8FFFD) ||
        (cp >= 0x90000 && cp <= 0x9FFFD) ||
        (cp >= 0xA0000 && cp <= 0xAFFFD) ||
        (cp >= 0xB0000 && cp <= 0xBFFFD) ||
        (cp >= 0xC0000 && cp <= 0xCFFFD) ||
        (cp >= 0xD0000 && cp <= 0xDFFFD) ||
        (cp >= 0xE1000 && cp <= 0xEFFFD)
      ) {
        // Unicode characters above U+00A0 that are included in the ucschar range
        // (as defined in https://datatracker.ietf.org/doc/html/rfc3987#section-2.2)
        // can be passed through unescaped.
        return ch;
      } else {
        // Unicode characters above U+00A0 that are NOT included in the ucschar range
        // (as defined in https://datatracker.ietf.org/doc/html/rfc3987#section-2.2)
        // are forbidden. We throw an exception.
        invalid_characters.push(cp);
      }
    });

    if (invalid_characters.length > 0) {
      throw new Error(`Invalid characters found in code "${code}": ` +
        invalid_characters.map(cp => "U+" + cp.toString(16).toUpperCase().padStart(4, '0')).join(", ")
      );
    }

    return escaped_code;
  }

  /**
   * Ideally, we'll eventually have some kind of prefix index within hl7.terminology.
   * Until we have that, we have to index that package ourselves. We do that when this
   * class is constructed so that further calls to this method should be fast.
   */
  constructor() {
    let package_json_path = require.resolve('hl7.terminology/package.json');
    if (!package_json_path) {
      throw new Error("ConceptIRI requires 'hl7.terminology' to be installed.");
    }
    let hl7terminology_path = path.dirname(package_json_path);

    // Initialize prefix indexes.

    // The prefixIndex will be in the form this.prefixIndex[prefix][uri] = 1
    this.prefixIndex = {};

    // The uriIndex will be in the form this.uriIndex[uri][prefix] = 1
    this.uriIndex = {};

    // Load all CodeSystem and Naming files from the hl7terminology path and look for prefix information.
    let files = fs.readdirSync(hl7terminology_path);
    files
      .filter(filename => filename.endsWith('.json') && (
          filename.startsWith('CodeSystem-') ||
          filename.startsWith('NamingSystem-')
      ))
      .forEach(filename => {
        let raw = fs.readFileSync(path.join(hl7terminology_path, filename), "utf-8");
        let content = JSON.parse(raw);

        if (filename.startsWith('CodeSystem-')) {
          let url = content.url;

          (content.identifier || []).forEach(id => {
            if (id.system === 'https://terminology.hl7.org/temporary/CodeSystem/IRIstem') {
              // console.log(`CodeSystem ${url} has prefix ${id.value})`);
              if (!this.prefixIndex.hasOwnProperty(id.value)) this.prefixIndex[id.value] = {};
              this.prefixIndex[id.value][url] = 1;

              if (!this.uriIndex.hasOwnProperty(url)) this.uriIndex[url] = {};
              this.uriIndex[url][id.value] = 1;
            }
          });
        } else if(filename.startsWith('NamingSystem-')) {
          // Find uri.
          let uris = (content.uniqueId || [])
              .filter(id => id.type === 'uri')        // Only URIs
              .filter(id => id.preferred)             // Only preferred entries
              .map(id => id.value);

          // Find uniqueId.
          (content.uniqueId || []).forEach(id => {
            uris.forEach(uri => {
              if (id.comment === 'IRIstem') {
                if (!this.prefixIndex.hasOwnProperty(id.value)) this.prefixIndex[id.value] = {};
                this.prefixIndex[id.value][uri] = 1;

                if (!this.uriIndex.hasOwnProperty(uri)) this.uriIndex[uri] = {};
                this.uriIndex[uri][id.value] = 1;

                // console.log(`NamingSystem ${uri} has prefix ${id.value}`);
              }
            });
          });
        }
      });

      // console.log(`Prefix Index: ${JSON.stringify(this.prefixIndex)}`);
      // console.log(`URI Index: ${JSON.stringify(this.uriIndex)}`);
  }

  /**
   * A static method for converting a FHIR Coding to a Concept IRI.
   *
   * @param coding A FHIR Coding as an object.
   * @return A list of Concept IRIs as strings; empty list if not present.
   */
  fromCoding(coding) {
    let system = coding.system || '';

    // A Coding.system of 'urn:ietf:rfc:3986' denotes that the code is already
    // a URI.
    if (system === 'urn:ietf:rfc:3986') return [coding.code];

    if (system in this.uriIndex) return Object.keys(this.uriIndex[system]).map(key => key + ConceptIRI.codeToIRI(coding.code));
    return [];
  }

  /**
   * A static method for converting a Concept IRI to a FHIR Coding.
   *
   * @param iri A concept IRI.
   * @return A list of FHIR Codings as objects.
   */
  toCoding(iri) {
    // We assume that the code is either after the last '/' or the last '#'
    let prefix = undefined;
    let code = undefined;
    if (iri.lastIndexOf('#') !== -1) {
      prefix = iri.substr(0, iri.lastIndexOf('#') + 1);
      code = iri.substr(iri.lastIndexOf('#') + 1);
    } else if(iri.lastIndexOf('/') !== -1) {
      prefix = iri.substr(0, iri.lastIndexOf('/') + 1);
      code = iri.substr(iri.lastIndexOf('/') + 1);
    } else {
      console.log(`Could not determine coding for IRI '${iri}': could not separate code and baseURI.`);
      // Since we know it's a IRI, we can set that as the system.
      return [{
	system: 'urn:ietf:rfc:3986',
	code: iri,
      }];
    }

    // console.log(`Split IRI into prefix=${prefix} and code=${code}`)

    if (prefix in this.prefixIndex) {
      // console.log(`Prefix information: ${JSON.stringify(this.prefixIndex[prefix])}`)
      return Object.keys(this.prefixIndex[prefix]).map(uri => {
        return {
          system: uri,
          code: decodeURIComponent(code),
        };
      });
    }

    // It's still an IRI! Return it as such.
    return [{
      system: 'urn:ietf:rfc:3986',
      code: iri,
    }];
  }
}

if (typeof module !== 'undefined')
  module.exports = {ConceptIRI};
