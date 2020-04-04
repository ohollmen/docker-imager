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
var Mustache = require("mustache");
var fs    = require("fs");
var cproc = require("child_process");
var path  = require("path");
//////////////////////////////////////

// extpkg temp dir inside the image.
var pkgtemp = "/tmp";

// var op = process.argv

var ops = {"gen": generate};
var op = process.argv.splice(2,1).toString();
if (!op) { usage("No op. passed\n"); }
// console.log("OP:" + op);
if (!ops[op]) { usage("'"+op+"' - No such op.\n"); }

var cfgname = process.argv[2];

if (!cfgname) { usage("Need config file as first param !"); }
var p = require_json(cfgname);
if (!p) { usage("JSON Config loading failed !"); }
var dft = p.tmplfname;
if (!dft) { usage("No template file given in config"); }
var tcont = fs.readFileSync(dft, 'utf8');
if (!tcont) { usage("No template content loaded from: '"+dft+"'"); }
init(p);
// Dispatch
ops[op](p);
process.exit(0);

function generate(p) {
  pkg_listgen(p);
  pkg_mkdirs(p); // Early, before extpkg and links
  extpkg_inst(p);
  pkg_makelinks(p);
  if (p.env) {
    p.envcont = "ENV "; // TODO: "ENV " ... k1=v1 k2=v2
    earr = [];
    Object.keys(p.env).forEach(function (k) { earr.push(k + "="+p.env[k]); }); //  p.envcont += "ENV "+ k + "="+p.env[k] + "\n";
    p.envcont += earr.join(' ')+"\n";
  }
  // DEBUG
  // console.error(p);
  // Create DockerFile (stdout)
  var cont = Mustache.render(tcont, p);
  console.log(cont);
}


function usage(msg) {
  if (msg) { console.error(msg); }
  var cmd = path.basename(process.argv[1]);
  console.error("Usage: "+cmd + " op my_image_001.conf.json\nAvailable ops:");
  Object.keys(ops).forEach(function (k) { console.error(" - "+ k); });
  process.exit(1);
}
/** Initialize a few good default setting (to params in p) */
function init(p) {
  var pkgtypes = ["rpm","deb","zyp"];
  // helpers to use in template as mustache is lacking comparision (equality) operator.
  pkgtypes.forEach(function (pt) {
    if (p.pkgtype == pt) { p["_uses_"+pt] = true; }
  });
  p.dockerfname = p.dockerfname || 'Dockerfile';
}

/** Process "extpkgs" section of config.
* Add generated Dockerfile content to extpkgs node parameters (member "cont").
* @param p {object} - Image parameters
* @todo Document details of various accepted extpkg types: .tgz
* Note:
*/
function extpkg_inst(p) {
  var pkgs = p.extpkgs;
  if (!pkgs) { console.error("No packages to install\n"); return; }
  pkgs.forEach(function (p) { // TODO: rename p => ep
    if (!p.url) { console.error("No URL in extpkg node!");return; }
    if (p.disa) { console.error("Skipping disabled extpkg node!");return; }
    p.cont = "";
    var bn = path.basename(p.url);
    var dest = pkgtemp + "/" + bn; // Default ...
    // Base command for wget download
    var cmd = "wget " + p.url + " -O " + dest;
    // console.log("# " + cmd);
    //OLD:p.cont += "COPY " + dest + " /tmp/" + bn + "\n";
    //  Copy by ADD or
    // Note: Image MUST have a wget for FTP URL:s to work.
    // FTP item - convert to wget download (ADD ftp://... NOT supported)
    if (p.url.match(/^ftp/)) {
      // Would need to exist in docker context for ADD
      //var haveit = fs.existsSync(dest);
      //if ( ! haveit) { console.log("First run:'" + cmd + "' Then re-run this."); process.exit(1); }
      //p.cont += "ADD "+ dest + " "+ dest+ "\n";
      p.cont += "RUN wget "+ p.url + " -O "+ dest + "\n";
    }
    // ADD ( ~ COPY) also Handles any http:// or https:// (NOT ftp://, see above)
    else { p.cont += "ADD " + p.url + " /tmp/" + bn + "\n"; } // TODO: Use dest ?
    // By now the package should be in /tmp by ADD or wget
    /////////////////// Unpackaging ///////////////////////////
    // .tgz or .gz with "run" (run an *additional* command)
    // --force after pkg ?
    if (bn.match(/\.t?gz$/) && p.run) {
      p.cont += "RUN tar -zxf /tmp/" + bn + "\n";
      p.cont += "RUN " + p.run  + "\n";
    }
    //
    else if (bn.match(/\.rpm$/)) { p.cont += "RUN rpm -ivh --force /tmp/" + bn + "\n"; }
    else if (bn.match(/\.tar$/)) { p.cont += "RUN tar -xf /tmp/" +bn + " -C "+p.path+"\n"; }
    else if (bn.match(/\.t?gz$/)) { p.cont += "RUN tar -zxf /tmp/" +bn + " -C "+p.path+"\n"; }
    else if (bn.match(/\.so\b[\d\.]+$/)) {
      // console.error("GOT Shared object");
      if (!p.path) { console.error("*.so item does not have path !"); process.exit(1); }
      p.cont += "RUN cp /tmp/" +bn + " "+p.path+" && chmod 755 "+p.path + "/" + bn +"\n";
      if (p.link) { p.cont += "RUN cd "+p.path+" && ln -s "+bn+" "+p.link+"\n"; }
    }
    // TODO: Optimize this by not copying to /tmp, but using "path: ...
    // For now same as *.so
    else {
      p.cont += "RUN cp /tmp/" +bn + " "+p.path+" && chmod 755 "+p.path + "/" + bn +"\n";
    }
    // ONLY HERE (?): p.cont =
    //cproc.exec(cmd, function (err, stdout, stderr) {
    //  if (err) { console.error(err.toString()); return; }
    //  console.log("Downloaded " + p + " to " + dest);
    //});
  });
}

/** Load Package list gotten from JSON main config.
* Uses members from config (param p):
* - config.plfname to load package list (array of string form package names) embedded directly to config.
* - config.ppl - "packages per line" to neatly distribute the large
*   package lists onto multiple lines.
* Places content for templating to "pl" (for "package list").
* @param p {object} - Docker config data
* @return Nothing.
*/
function pkg_listgen(p) {
  var pkgs = [];
  if (!p.plfname) {
    // Embedded list of packages in Array
    if (p.plist && Array.isArray(p.plist)) { pkgs = p.plist; }
    else { onsole.error("Warning: Neither package list (JSON) file or config embedded pkg list were give (untypical) !"); return; }
  }
  // External (second level) JSON file
  else {
    pkgs = require_json(p.plfname);
  }
  // Package list
  var scnt = p.ppl || 10; // pkg items per line.
  var sa;
  var cont = "";
  for (var i = 0;(sa = pkgs.slice(i, i+scnt)) && sa.length; i+=scnt) {
    //console.log(sa);
    cont += sa.join(' ')+" \\\n";
  }
  p.pl = cont.replace(/\\\s+$/, '');
  // cont;
}

/** Make symlinks described in "links" section of config.
* Place generated RUN-commands into "linkcont" section of config object.
* @param p {object} - Docker config data
* @return Nothing.
*/
function pkg_makelinks(p) {
  p.linkcont = "";
  if (!p.links) {  console.error("No links to create"); return; }
  if (!Array.isArray(p.links)) { console.error("Links defs not in array"); return;  }
  p.links.forEach(function (it) {
    var lcmd = "ln -s "+ it[0] + " " + it[1]+ "\n";
    // console.error("DEBUG: "+lcmd);
    p.linkcont += "RUN " + lcmd;
  });
}
/** Create directories (fairly early) in the processing.
* Docker directives are generated to member "mkdircont"
* As this *only* generated commands for template, it's templates responsibility
* to expand the "mkdircont" early in the template.
* @param p {object} - Docker config data
* @return Nothing.
*/
function pkg_mkdirs(p) {
  p.mkdircont = "";
  if (!p.mkdir) {  console.error("No dirs to create"); return; }
  if (!p.mkdir.length) { return; }
  p.mkdircont += "RUN mkdir";
  p.mkdir.forEach(function (it) {
      p.mkdircont += " "+it;
  });
  p.mkdircont += "\n";
}

function run_container(p) {
  // Use templating ?
  var runcmd = "";
}
/** Wrapper for loading JSON w/o path resolution quirks.
* require() loads JSON, but with unintuitive twists regarding symlinks
* to executable or location of executable in general vs.
* current directory of process. Replace require() with require_json()
to get this behavior. Note: This is not a general purpose replacement
for require(), but only for loading *.json files.
@param fname - JSON filename
*/
function require_json(fname) {
  var cont = fs.readFileSync(fname, 'utf8');
  return JSON.parse(cont);
}
