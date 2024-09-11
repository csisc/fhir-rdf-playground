/*
 * Concept IRI tests.
 *
 * This includes:
 * - Unit tests that are run every time. These convert a handful of
 *   FHIR system/code pairs back and forth from concept IRIs, including
 *   an example with surrogate pairs.
 * - Slower tests that are only run if RUN_SLOW_TESTS is set
 *   to true (or 1). These use the FHIR examples in `test/fhir/examples`
 *   (downloaded by `test/Makefile` by running `make` in that directory)
 *   to test the ConceptIRI code by attempting to convert every system/code
 *   pair from the FHIR examples into concept IRIs and attempts to resolve
 *   them.
 */

const { ConceptIRI } = require('../ConceptIRI.js');
const { has, groupBy, uniq } = require('lodash');
const retus = require('retus');
const path = require("path");
const fs = require("fs");

const examples = {
  'http://snomed.info/id/87512008': [{
    system: "http://snomed.info/sct",
    code: "87512008",
    // "display": "Mild major depression"
  }],
  'https://www.omg.org/spec/LCC/Countries/ISO3166-1-CountryCodes/CA': [{
    system: "urn:iso:std:iso:3166:-2", // This looks weird, but it is real: https://terminology.hl7.org/CodeSystem-v3-iso3166-2.html
    code: "CA",
  }, {
    system: "http://terminology.hl7.org/CodeSystem/iso3166-2",
    code: "CA",
  }],
  'http://dicom.nema.org/resources/ontology/DCM/110127': [{
    system: 'http://dicom.nema.org/resources/ontology/DCM',
    code: '110127',
  }],
  'http://purl.bioontology.org/ontology/RXNORM/1160593': [{
    system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
    code: '1160593',
  }],
  'https://id.nlm.nih.gov/mesh/D000305': [{
    system: 'https://www.nlm.nih.gov/mesh',
    code: 'D000305',
  }],
  // Test support for IRI-encoding complex codes.
  'http://snomed.info/id/128045006%3A%7B363698007%3D56459004%7D': [{
    system: 'http://snomed.info/sct',
    code: '128045006:{363698007=56459004}',
  }],
  // If Coding.system == 'urn:ietf:rfc:3986', then the Coding.code
  // should be considered a concept URI.
  'urn:oid:1.2.840.10008.5.1.4.1.1.2': [{
    system: 'urn:ietf:rfc:3986',
    code: 'urn:oid:1.2.840.10008.5.1.4.1.1.2',
  }],
  // Testing Unicode codes using SNOMED CT and the Unicode smiling
  // face (U+263A, ☺). Note that this is not actually a valid SNOMED CT code.
  'http://snomed.info/id/☺': [{
    system: 'http://snomed.info/sct',
    code: '☺',
  }],
  // Test Unicode codes with surrogate characters and combinations,
  // in this case the combination of a waving hand (U+1F44B) and
  // medium-dark skin tone (U+1F3FE). Note that this is not an actual
  // SNOMED CT code.
  'http://snomed.info/id/👋🏾': [{
    system: 'http://snomed.info/sct',
    code: '👋🏾',
  }],
};

test('Test whether codeToIRI() works correctly', () => {
  // Characters within 0-9A-Za-z should definitely not be escaped.
  expect(ConceptIRI.codeToIRI('0123456789ADTGZadtgz-.~_')).toEqual('0123456789ADTGZadtgz-.~_');
  // Unicode characters within the allowed ranges should not be escaped.
  expect(ConceptIRI.codeToIRI('ȅ')).toEqual('ȅ');
  expect(ConceptIRI.codeToIRI('ȅ')).toEqual(String.fromCodePoint(0x0205));
  expect(ConceptIRI.codeToIRI(String.fromCodePoint(0x1FB69))).toEqual(String.fromCodePoint(0x1FB69));
  // Unicode characters outside our allowed ranges should throw an exception.
  expect(() => {
    ConceptIRI.codeToIRI("hello" + String.fromCodePoint(0x1FFFE));
  }).toThrowError(/Invalid characters.*U\+1FFFE/); // Expect an error message that includes the invalid character.

  // FHIR codes are defined a bit oddly: "Technically, a code is restricted to a string which has at least one character and no leading or trailing whitespace, and where there is no whitespace other than single spaces in the contents".
  // So let's make sure those work in a sensible manner.
  expect(ConceptIRI.codeToIRI('valid FHIR code')).toEqual('valid%20FHIR%20code');
  expect(ConceptIRI.codeToIRI('  invalid FHIR code ')).toEqual('%20%20invalid%20FHIR%20code%20');
});

const conceptIRI = new ConceptIRI();

test('Convert some FHIR Codings to IRIs', () => {
    for (const iri in examples) {
        const codings = examples[iri];

        codings.forEach(coding => {
            expect(conceptIRI.fromCoding(coding)).toEqual([iri]);
        });
    }
});

test('Convert some Concept IRIs to FHIR Codings', () => {
    for (const iri in examples) {
        const coding = examples[iri];

        expect(conceptIRI.toCoding(iri).sort()).toEqual(coding.sort());
    }
});

// Return all JSON files recursively in a directory.
function get_files_in_dir(dirname, filter=(filename) => true, recursive=true) {
    const files = fs.readdirSync(dirname);
    let output_files = [];
    files.forEach(file => {
       const filename = path.resolve(dirname, file);
       const ls = fs.lstatSync(filename);
       if(ls.isDirectory()) {
           if (recursive)
               output_files = output_files.concat(get_files_in_dir(filename, filter, recursive));
           else
               if (filter(filename)) output_files.push(filename);
       } else if(ls.isFile()) {
            if (filter(filename)) output_files.push(filename);
       } else {
           throw new Error(`File ${file} in directory ${dirname} is neither a file nor a directory.`);
       }
    });
    return output_files;
}

function get_system_code_pairs_from_file(filename, inner_object = undefined, obj_path='') {
    // The conventional thing to do would be to find all the Codings; however, to
    // ensure that we don't miss anything, I'm just going to search recursively for
    // every system/code pair anywhere in any of these files.

    // console.log(`get_system_code_pairs_from_file(${filename}, ${inner_object}, ${obj_path})`);

    let obj = inner_object;
    if (!obj) {
        obj = JSON.parse(fs.readFileSync(filename, "utf-8"));
    }

    let results = [];

    // Does obj have a system/code pair?
    if (has(obj, 'system') && has(obj, 'code')) {
        const result = /(\w+\.\w+)(?:\.\d+)$/.exec(obj_path);
        const path_end = (result ? result[1] : '');

        results.push({
            filename,
            object: obj,
            path: obj_path,
            path_end,
            display: obj['display'] || '',
            system: obj['system'],
            code: obj['code'],
        });
    }

    // Recurse into any properties of obj that are themselves objects.
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value != null) {
            results = results.concat(get_system_code_pairs_from_file(filename, value, `${obj_path}.${key}`))
        }
    }

    return results;
}

/*
 * Test for all the files in a FHIR JSON examples directory.
 * The path should either point to the v4 or v5 directory.
 */
function test_fhir_json(version, fhir_json_path) {
    // Step 1.  Find every system/code pair in the FHIR JSON examples.
    // The conventional thing to do would be to find all the Codings; however, to
    // ensure that we don't miss anything, I'm just going to search recursively for
    // every system/code pair anywhere in any of these files.
    const fhir_jsons = get_files_in_dir(fhir_json_path, (filename) => filename.toLowerCase().endsWith('.json'), true);
    expect(fhir_jsons.length).toBeGreaterThan(0);

    // Step 2. Open each file and recurse through every object.
    const system_code_pairs = fhir_jsons.flatMap(filename => {
        // console.log(`Searching for code pairs for {filename}.`);
        return get_system_code_pairs_from_file(filename);
    });

    // Step 3. Write out a tab-delimited file containing all the system codes.
    const f_system_codes = fs.createWriteStream(path.resolve(__dirname, `fhir/examples/system-codes-${version}.tsv`), 'utf-8');
    f_system_codes.write('filename\tpath\tpath_end\tsystem\tcode\tdisplay\n');
    system_code_pairs.forEach(result => {
        f_system_codes.write([
            result.filename,
            result.path,
            result.path_end,
            result.system,
            result.code,
            result.display
        ].join('\t') + '\n')
    })
    f_system_codes.close();

    // Step 4. For downstream analyses, we're just interested in unique system/code pairs.
    const codes_by_system = groupBy(system_code_pairs, r => r.system);
    const f_unique = fs.createWriteStream(path.resolve(__dirname, `fhir/examples/unique-codes-${version}.tsv`), 'utf-8');
    f_unique.write('system\tcode\tdisplay\tpath_ends\tfilenames\n');
    Object.keys(codes_by_system).forEach(system => {
        const codes_by_code = groupBy(codes_by_system[system], r => r.code);
        Object.keys(codes_by_code).forEach(code => {
            // Summarize values
            const results = codes_by_code[code];
            const unique_displays = uniq(results.map(r => r.display));
            const unique_path_ends = uniq(results.map(r => r.path_end));
            const unique_filenames = uniq(results.map(r => r.filename));

            f_unique.write([
                system,
                code,
                unique_displays.join('|'),
                unique_path_ends.join('|'),
                unique_filenames.join('|')
            ].join('\t') + '\n')
        });
    });
    f_unique.close();

    // Step 5. The most important thing we're interested in is whether all concept IRIs are "correct". For now,
    // we can determine this by trying to resolve them, although in the future we should probably query OLS or something.
    const f_resolved = fs.createWriteStream(path.resolve(__dirname, `fhir/examples/resolved-${version}.tsv`), 'utf-8');
    f_resolved.write('system\tcode\tiri\tresolvable\tdisplay\tpath_ends\tfilenames\n');
    Object.keys(codes_by_system).forEach(system => {
        const codes_by_code = groupBy(codes_by_system[system], r => r.code);
        Object.keys(codes_by_code).forEach(code => {
            const results = codes_by_code[code];
            const unique_displays = uniq(results.map(r => r.display));
            const unique_path_ends = uniq(results.map(r => r.path_end));
            const unique_filenames = uniq(results.map(r => r.filename));

            const iris = conceptIRI.fromCoding({
                system,
                code,
            });
            const iri = iris[0] || '';
            let resolvable = '';
            if(iri && (iri.startsWith('http:') || iri.startsWith('https:'))) {
                try {
                    const response = retus.get(iri, {
                        throwHttpErrors: false
                    });
                    resolvable = response['statusCode'] || 'error';
                } catch(e) {
                    resolvable = `error:${e}`
                }
            }

            f_resolved.write([
                system,
                code,
                iri,
                resolvable,
                unique_displays.join('|'),
                unique_path_ends.join('|'),
                unique_filenames.join('|')
            ].join('\t') + '\n')
        });
    });
    f_resolved.close();
}

if(process.env['RUN_SLOW_TESTS'] && process.env.RUN_SLOW_TESTS) {
  // Let's test every system/value pair in the FHIR JSON R4 files.
  test('Test every system/value pair in the FHIR JSON R4 examples', () => {
    test_fhir_json('r4', path.resolve(__dirname, 'fhir/examples/fhir-r4'));
  });

  // Let's test every system/value pair in the FHIR JSON R5 files.
  test('Test every system/value pair in the FHIR JSON R5 examples', () => {
    test_fhir_json('r5', path.resolve(__dirname, 'fhir/examples/fhir-r5'));
  });
} else {
  test.todo('Test every system/value pair in the FHIR JSON R4 examples (set RUN_SLOW_TESTS=1 to run, then check outputs manually)')
  test.todo('Test every system/value pair in the FHIR JSON R5 examples (set RUN_SLOW_TESTS=1 to run, then check outputs manually)')
}
