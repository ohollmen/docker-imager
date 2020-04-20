#!/usr/bin/node
/** @file
* 
* # docker-imager
* 
* Generate Dockerfile based on Docker Compositions Config in a JSON file.
* Applicable for single-container setting. Consider using `docker-compose`
* for a multi-service setting.
* 
* Single dependency: `npm install mustache`
* 
* ## Templating - How it Internally Works
* 
* Templating will get the original config object as parameter.
* During processing additional members are added to config object
* (Usually with "...cont" name suffix for "Dockerfile content".
* In some cases like `extpkgs` (array) member, content is generated
* into each of its nodes and `extpkgs` member has to be looped / iterated
* on the (mustache) template: `{{#extpkgs}}\n{{{ cont }}}\n{{/extpkgs}}`.
*
* ## Higher Level Documentation
*
* Refer to README.md for higher level (command line) usage.
* 
* ## TODO
* 
* - Move to Handlebars for comparison in tmpl ? Does not help much.
* - Use sub commands (to trigger building, testing ...). Good move.
*/


"use strict;";
var path  = require("path"); // for basename()
var dockimg = require("./docker-imager");
//////////////////////////////////////
var ops = {"gen": function (p) { p.generate(); }, "help": usage };
var op = process.argv.splice(2,1).toString();
if (!op) { usage("No op. passed\n"); }
// console.log("OP:" + op);
if (!ops[op]) { usage("'"+op+"' - No such op.\n"); }

var cfgname = process.argv[2]; // Always Fixed arg after subcmd ?

if (!cfgname) { usage("Need config file as first param !"); }
var p = dockimg.require_json(cfgname);
if (!p) { usage("JSON Config loading failed !"); }
//console.log(p);
p2 = new dockimg.DockerImager(p);
if (!p2) { throw "No DockerImager instance"; }
// if (!p.tcont) { usage("No template content loaded from: '"+dft+"'"); }
p2.init();
// Dispatch
ops[op](p2);
process.exit(0);

/** Output usage instructions.
 * Allow printing a error context specific message to the beginning of usage info.
 * Everyting is output to stderr.
 */
function usage(msg) {
  if (msg) { console.error(msg); }
  // TODO: 
  var cmd = path.basename(process.argv[1]);
  console.error("Usage: "+cmd + " op my_image_001.conf.json\nAvailable ops:\n");
  Object.keys(ops).forEach(function (k) { console.error(" - "+ k); });
  process.exit(1);
}
