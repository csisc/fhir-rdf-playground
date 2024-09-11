# A Makefile for downloading FHIR fhir/examples from the FHIR website
# and (eventually) converting them to Turtle to look for differences
# between different FHIR-RDF generators.
# 
# Inspired from https://github.com/FHIRCat/FHIRJsonLDAmiaPaper/
# but (as of today) not using much copied over code.

.PHONY: all clean fhir/examples

all: fhir/examples

clean:
	rm -rf fhir/examples

fhir/examples/fhir-r4:
	mkdir -p fhir/examples/fhir-r4

fhir/examples/fhir-r5:
	mkdir -p fhir/examples/fhir-r5

fhir/examples: fhir/examples/downloaded fhir/examples/unzipped

fhir/examples/downloaded: fhir/examples/fhir-r4 fhir/examples/fhir-r5
	curl http://www.hl7.org/fhir/examples-json.zip -o fhir/examples/fhir-r4/examples-json.zip
	curl http://www.hl7.org/fhir/examples-ttl.zip -o fhir/examples/fhir-r4/examples-ttl.zip
	curl http://build.fhir.org/examples-json.zip -o fhir/examples/fhir-r5/examples-json.zip
	curl http://build.fhir.org/examples-ttl.zip -o fhir/examples/fhir-r5/examples-ttl.zip

fhir/examples/unzipped: fhir/examples/downloaded
	rm -rf fhir/examples/fhir-r4/examples-json
	unzip fhir/examples/fhir-r4/examples-json.zip -d fhir/examples/fhir-r4/examples-json
	rm -rf fhir/examples/fhir-r4/examples-ttl
	unzip fhir/examples/fhir-r4/examples-ttl.zip -d fhir/examples/fhir-r4/examples-ttl
	rm -rf fhir/examples/fhir-r5/examples-json
	unzip fhir/examples/fhir-r5/examples-json.zip -d fhir/examples/fhir-r5/examples-json
	rm -rf fhir/examples/fhir-r5/examples-ttl
	unzip fhir/examples/fhir-r5/examples-ttl.zip -d fhir/examples/fhir-r5/examples-ttl
	touch fhir/examples/unzipped
