#!/usr/bin/node
// Generate based on pkglist
// npm install mustache
// TODO: Move to Handlebars for comparison in tmpl ?
"use strict;";
var Mustache = require("mustache");
var fs = require("fs");
var cproc = require("child_process");
var path = require("path");
//////////////////////////////////////
    
// var dft = "./Dockerfile.mustache";
// extpkg temp dir inside the image.
var pkgtemp = "/tmp";
    
var cfgname = process.argv[2]; // "./centos7_fwb.conf.json";
if (!cfgname) { console.error("Need config file as first param !"); process.exit(1); }
var p = require(cfgname);
      
var dft = p.tmplfname;
if (!dft) { console.error("No template file given in config"); process.exit(1); }
var tcont = fs.readFileSync(dft, 'utf8');
init(p);
pkg_listgen(p);
extpkg_inst(p);
pkg_makelinks(p);
// DEBUG
// console.error(p);
// Create DockerFile (stdout)
var cont = Mustache.render(tcont, p);
console.log(cont);
process.exit(0);
    
function init(p) {
  var pkgtypes = ["rpm","deb","ddd"];
  pkgtypes.forEach(function (pt) {
    if (p.pkgtype == pt) { p["_uses_"+pt] = true; }
  });
  p.dockerfname = p.dockerfname || 'Dockerfile';
}

// process "extpkgs" section of config.
// Add generated dockerFile content to extpkgs node parameters.
// Note: We are excessivele cautious here and exit on problems. TODO: Strip this ...
// TODO: Document details of various accepted extpkg types: .tgz
// Note:
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
* - config.plfname to load package list (array of string form package names)
* - config.ppl - "packages per line" to neatly distribute the large
*   package lists onto multiple lines.
* Places contet for templating to "pl" (for "package list").
* @param p {object} - Docker config data
* @return Nothing.
*/
function pkg_listgen(p) {
  var pkgs = [];
  if (!p.plfname) {
    if (p.plist && Array.isArray(p.plist)) { pkgs = p.plist; }
    else { onsole.error("Warning: Neither package list (JSON) file or config embedded pkg list were give (untypical) !"); return; }
  }
  else {
    pkgs = require(p.plfname);
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

// Make symlinks
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
