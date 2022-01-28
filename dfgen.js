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
* - DONE: Use sub commands (to trigger building, testing ...).
*/


"use strict;";
var path  = require("path"); // for basename()
var fs    = require("fs"); // for readFileSync(0)
var dockimg = require("./docker-imager");
//////////////////////////////////////
var ops = {
  "gen": generate,
  "help": usage,
  "genconf": genconf,
  "list": list,
  // New *instance* op: dump with package lists
  "dump": jdump
};
var op = process.argv.splice(2,1).toString();
if (!op) { usage("No op. passed\n"); }
// console.log("OP:" + op);
if (!ops[op]) { usage("'"+op+"' - No such op.\n"); }

var cfgname = process.argv[2]; // Always Fixed arg after subcmd (?)
var cfgpaths = ["./conf", "."];

var p = {};
// Ops with early dispatch, w/o instance
if (op == 'genconf') { ops[op](p); process.exit(0); }
if (op == 'list')    { ops[op](p); process.exit(0); }

if (!cfgname) { usage("Need config file as first param !"); }
if (cfgname.indexOf("/") == -1) { cfgname = dockimg.confresolve(cfgpaths, cfgname); }
p = dockimg.require_json(cfgname);
if (!p) { usage("JSON Config loading failed !"); }
//console.log(p);
var p2 = new dockimg.DockerImager(p);
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

function generate (p) {
  var cont = p.generate(); // {dump: 1}
  if (!p.dockerfname) { console.error("Error: No dockerfname present !"); process.exit(1); }
  // Save by contained name
  if (process.argv.includes("--save")) {
    var is = fs.existsSync( p.dockerfname );
    if (is) {console.error("Warning: Overwriting "+p.dockerfname+" !"); }
    fs.writeFileSync(p.dockerfname, cont, "utf8");
    return;
  }
  console.log(cont);
  console.error("# To save append: ... > "+p.dockerfname+ "\n# ... or use --save");
}
function list() {
  var arr = [];
  var cpath = process.env["DOCKER_IMAGER_PATH"];
  var cpaths = cpath ? cpath.split(':') : [];
  cpaths = cpaths.filter(function (p) { return fs.existsSync(p); });
  if (cpaths.length) { cfgpaths.unshift(...cpaths); }
  cfgpaths.forEach(function (p) {
    var l;
    
    try { l = fs.readdirSync(p, {encoding: 'utf8'}); } // withFileTypes
    catch (ex) {
      console.error("Warning: Path "+p+" does not exist.");
      return;
    }
    var l2 = l.map(function (f) {return p+"/"+f;});
    l2 = l2.filter(function (p) {  return p.match(/\.conf.json$/); });
    arr.push(...l2); // concat
  });
  var cont = "Available config files (by suffix .conf.js):\n";
  arr.forEach(function (it) { cont += "- "+it+"\n";});
  cont += "\nPass one of these to: dfgen.js gen ...\n";
  console.log(cont);
}
/** Dump instance with package lists embedded
* - Delete plfname to reduce ambiguity ?
*/
function jdump() {
  delete(p.plfname); // Delete filename ?
  var cont = JSON.stringify(p, null, 2);
  console.log(cont);
}
/** Generate config.
 * Rely on slim meta info on JSON conf file members.
 * https://stackoverflow.com/questions/20086849/how-to-read-from-stdin-line-by-line-in-node
 */
function genconf() {
  console.log("TODO: Write to " + cfgname);
  var arr = [
    {"name": "Author Name", type: "s", val: ""},
    {"name": "Author Name", type: "s", val: ""}
  ];
  var conf = {};
  arr.forEach(function (it) {
    process.stdout.write(it.name + ": ");
    var stdinbuf = fs.readFileSync(0);
    console.log("'"+stdinbuf+"'");
  });
}
