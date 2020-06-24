/**
* @file
* # Docker Imager
* 
* JS Class for creating Docker files (or running docker).
* Class can be easily embed into applications (e.g.):
* 
*    var dockimg = require("docker-imager");
*    var fs      = require("fs");
*    var cfg = dockimg.require_json("ubu18.imgconf.json");
*    // Instantiate, initialize, generate, write results to Dockerfile.
*    var di = new dockimg.DockerImager(cfg);
*    di.init();
*    var cont = di.generate();
*    fs.writeFileSync("Dockerfile", cont, 'utf8');
*/

/* Low level notes on JS OO/prototype refactor and refactoring procedural code
 * (with central first-arg object) to OO/prototype code with an editor PCRE compatible RegExp.
 * Notes:
 * - \w+ as function name is slightly optimistic, but 99.999% applicable (does not require
 * symbol to start with number)
 * 
 * Search: function\s+(\w+)\s*\((.+?)\)
 * Replace: DockerImager.prototype.\1 = function(\2)
 */
var Mustache = require("mustache");
var fs    = require("fs");
var cproc = require("child_process");
var path  = require("path");


/** Instantiate a docker imager by the config passed.
 * Later called methods will operate on this data.
 * This merely copies the config to be instance data.
 * @constructor
 */
function DockerImager(p, opts) {
  //console.log("Const-TOP-this: ",this);
  // For now copy props
  //console.log(this);
  for (var k in p) {
    //console.log("Key:"+k);
    this[k] = p[k];
  }
}
/** Generate Dockerfile based on it's configuration.
 * Runs through all the generative steps using docker-image object internal config
 * and generates a complete dockerfile as result based on template given by config.
 * TODO: save: true
 * @return Dockerfile content
 */
DockerImager.prototype.generate = function (opts) {
  var p = this;
  opts = opts || {};
  this.pkg_listgen(p);
  this.pkg_mkdirs(p); // Early, before extpkg and links
  this.extpkg_inst(p);
  this.pkg_makelinks(p);
  if (this.env) {
    p.envcont = "ENV "; // NEW "ENV " ... k1=v1 k2=v2
    earr = [];
    Object.keys(this.env).forEach(function (k) { earr.push(k + "="+p.env[k]); }); //  p.envcont += "ENV "+ k + "="+p.env[k] + "\n";
    p.envcont += earr.join(' ')+"\n";
  }
  // DEBUG
  // console.error(p);
  // Create DockerFile (stdout)
  if (!p.tcont) { throw "No Template available !"; }
  var cont = Mustache.render(p.tcont, p);
  //if (opts.dump) {
    console.log(cont);
  //}
  //else if (opts.save) { } // 
  return cont;
};

DockerImager.pkgtemp = "/tmp";

/** Initialize a few good default setting (to param properties in object).
 * Default property "dockerfname" to "Dockerfile" if not given in 
 * @return None
 */
DockerImager.prototype.init = function() {
  var p = this;
  var pkgtypes = ["rpm","deb","zyp"];
  // helpers to use in template as mustache is lacking comparision (equality) operator.
  pkgtypes.forEach(function (pt) {
    if (p.pkgtype == pt) { p["_uses_"+pt] = true; }
  });
  p.dockerfname = p.dockerfname || 'Dockerfile';
  // Load template
  var dft = p.tmplfname;
  if (!dft) { throw "No template file given in config 'tmplfname' !"; }
  // Check exists ?
  p.tcont = fs.readFileSync(dft, 'utf8');
};

/** Process "extpkgs" section of config.
 * Install a bunch of custom third party packages not available through distributions
 * normal repos (These you'd edxpress in ).
* Add generated Dockerfile content to extpkgs node parameters (member "cont").
* @todo Document details of various accepted extpkg types: .tgz
* Note:
*/
DockerImager.prototype.extpkg_inst = function() {
  var p = this;
  var pkgs = p.extpkgs;
  if (!pkgs) { console.error("No packages to install\n"); return; }
  pkgs.forEach(function (p) { // TODO: rename p => ep
    if (!p.url) { console.error("No URL in extpkg node!");return; }
    if (p.disa) { console.error("Skipping disabled extpkg node!");return; }
    p.cont = "";
    var bn = path.basename(p.url);
    var dest = DockerImager.pkgtemp + "/" + bn; // Default ...
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
};

/** Load Package list gotten from JSON main config.
* Uses members from config (param p):
* - config.plfname to load package list (array of string form package names) embedded directly to config.
* - config.ppl - "packages per line" to neatly distribute the large
*   package lists onto multiple lines.
* Places content for templating to "pl" (for "package list").
* 
* @return Nothing.
*/
DockerImager.prototype.pkg_listgen = function() {
  var p = this;
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
  // return p.pl;
};

/** Make symlinks described in "links" section of config.
* Place generated RUN-commands into "linkcont" section of config object.
* 
* @return Nothing.
*/
DockerImager.prototype.pkg_makelinks = function() {
  var p = this;
  p.linkcont = "";
  if (!p.links) {  console.error("No links to create"); return; }
  if (!Array.isArray(p.links)) { console.error("Links defs not in array"); return;  }
  // p.linkcont = "RUN ";
  var linkcmds = p.links.map(function (it) { // forEach
    var lcmd = "ln -s "+ it[0] + " " + it[1]; // + "\n"
    // console.error("DEBUG: "+lcmd);
    // p.linkcont += "RUN " + lcmd;
    return lcmd;
  });
  p.linkcont = linkcmds.length ? "RUN " + linkcmds.join(" && ") : "";
};
/** Create directories (fairly early) in the processing.
* Docker directives are generated to member "mkdircont"
* As this *only* generated commands for template, it's templates responsibility
* to expand the "mkdircont" early in the template.
* 
* @return Nothing.
*/
DockerImager.prototype.pkg_mkdirs = function() {
  var p = this;
  p.mkdircont = "";
  if (!p.mkdir) {  console.error("No dirs to create"); return; }
  if (!p.mkdir.length) { return; }
  p.mkdircont += "RUN mkdir";
  p.mkdir.forEach(function (it) {
    p.mkdircont += " "+it;
  });
  p.mkdircont += "\n";
};
/** Run container in simple way based on known config.
 * Note: config may not "know everything" about how container should be run,
 * e.g. it might depend on certain volume mounts that this "simple run" cannot
 * predict / know about.
 */
DockerImager.prototype.run_container = function() {
  // Use templating ?
  var runcmd = "docker run -i -t ";
};
/** Wrapper for loading JSON w/o path resolution quirks.
* require() loads JSON, but with unintuitive twists regarding symlinks
* to executable or location of executable in general vs.
* current directory of process. Replace require() with require_json()
to get this behavior. Note: This is not a general purpose replacement
for require(), but only for loading *.json files.
@param fname - JSON filename
 * @return "Handle" to JSON datastructure (similar to require("...") ).
*/
// DockerImager.require_json = function(fname) {
function require_json(fname) {
  var cont = fs.readFileSync(fname, 'utf8');
  return JSON.parse(cont);
}

module.exports = {
  "require_json": require_json,
  "DockerImager": DockerImager
};

