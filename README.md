# docker-imager - Create Dockerfile in a structured way.

docker-imager uses a JSON config file and template to generate Dockerfile contents.
it is used to keep docker recipe in organized data format to (e.g.) keep recipes in document
oriented no-sql database, where recipes could be queried, compared, extracted statistics on.

Extracting this info from Dockerfile (by parsing it) would be tedious.

Also the OS packagelist gets often so long that it would be hard screening list for duplicates, etc.
Having everything in JSON would allow you programmatically detecting packagelist duplicate items, transfer info from JSON to no-sql database, etc.

Dockerfile generator also optimizes the Dockerfile output to produce minimum amount of layers and
example template file gives a good hint on the suggested order of operations to again optimize
docker layer reuse.

Example JSON Config for generating a Dockerfile with docker-imager:

    {
      "author":"Olli Hollmen",
      "desc":  "Ubuntu 18 Slim Image relying on smart host volume mounts (e.g. /usr on host)",
      "plist": ["wget"],
      "baseimage": "ubuntu:18.04",
      "image": "ubu18_slim",
      "dockerfname": "Dockerfile.ubu",
      "remote": "images.artifactory.mycorp.com/web-team/",
      "uidgid": [1021, 1021],
      "vertag": "0.0.1",
      "pkgtype":"deb",
      "extpkgs": [],
      "mkdir": [],
      "links": [],
      "tmplfname": "./Dockerfile.mustache"
    }

# Features

`docker-imager` Enables:

- Maintaining build params like baseimage, target image name, version tag
- Maintaing a list of external add-on packages (or particular file types) from
  ftp or http(s) sites in *.rpm, *.tgz, *.so ... formats
- Creating directories and symlinks inside image during build
- Maintaining superficial image meta info (author, description)
- Maintaining list of OS packages (apt, yum, ...) to add to image in config embedded array (for short package lists) or external (second level config) JSON file (for *long* package lists)
- Creating docker build process and image testing flow related commands (in documenting section)
  in Dockerfile (docker build ..., docker run ..., docker tag ..., docker push ...)
- Maintaining hints on the user/group the image is intended to run as
- Configuring the Dockerfile template to base Dockerfile generation on
- Registering the package management style (e.g. 'rpm' or 'deb') the OS distro uses to allow Dockerfile template be highly parametrized, yet uniform (allows working with smaller amount of templates)

`docker-imager` Does not:

- Run the Build, but solely focuses on generating a Dockerfile
- Support multi-stage builds
- Does not support multi-image or service clustering features (use docker-compose for that)
- Configure build context directory ('.' assumed for simplicity in generated commands)

# Installing and Running CLI Utility

Install docker-imager utility:

    # Install docker-imager by npm or yarn (yarn add ...)
    npm install docker-imager
    # For ease of use, create a symlink to dfgen.js
    ln -s docker-imager/dfgen.js dfgen.js
    
At this point (of the tool evolution) the config file is the only CL parameter. The whole Dockerfile generation process is driven by it.

    # Add current dir in path (to resolve .json file loading correctly)
    export NODE_PATH=.
    # Pass JSON config file
    ./dfgen.js myimage.conf.json

# Config members in JSON

- Various names, versions
  - **baseimage** - baseimage name (as listed on on [dockerhub](https://hub.docker.com/) )
  - **image** - image name to use for docker `-t` parameter as build command is documented
    in Dockerfile
  - **vertag** - Version tag for image being created (e.g. `"1.0.1"`)
  - **dockerfname** - Dockerfile custom naming (e.g. `"Dockerfile.ubu18"`. defaults plainly to Dockerfile) in case Dockerfiles for multiple images are created in same directory.
  - **remote** - Remote repository server URL (with optional sub-path components, but *no* image name components) for image push (e.g. "dockerimages.mycom.com/webservimg/")
- Hints for docker runtime context
  - **uidgid** - Array of (2 items) uidnumber and gidnumber to run the image as
- Meta information (options)
  - **author** - Author info (name / email)
  - **desc** - Description of image usage / purpose (... image for ...)
- OS software (and other) packages
  - **plist** - Packagelist as Array of OS package names for the OS docker image is
    being built for
  - **plfname** - Package list filename for long package lists where maiintaining plist in JSON is no more practicat. This is (meant to be) mutually exclusive with plist. plfname is however overriden by (preferred ove) plist if both exist in config.
  - **pkgtype** - Package *and* Package manager type (this affects commands used, do not use rpm for SUSE)
    - "deb" for Debian/Ubuntu
    - "rpm" for RHEL/Centos
    - "zyp" for SLES/OpenSuse
- Extra / Add-on packages from "wild" sources
  - **extpkgs** - allows describing http(s) or ftp URL:s to load extra / add-on packages from (outside OS package repos) in various formats. See separate section on this.
  - Note: Formats supported: *.rpm, *tgz. These packages must "align" and be fit for installation on particular OS base image
- Symlinks and Directories
  - **mkdir** - List of directory names to be created inside docker image
  - **links** - an Array of 2-path-string arrays where 2-path-string arrays contain the source and destination of symlink in same order as `ln -s ..` shell command 
or symlink() system command

Additional info:
- The package list originated from plist or plfname is formatted into reasonable size lines with
  line continuum charaters at line ends so that Dockerfile remains in human readable form.
- extpkgs, mkdir, symlink related custom ops are fully optional (as seen from simple example config)
- OpenSUSE and `pkgtype=zyp` allow embedding full URL:s as package name item

# `extpkgs` - Section

# TODO

- Explain in which order the operations described in config are performed and how template has a crucial role on this

# Special Notes

## Symlinks to main executable and NODE_PATH

It seems that Node.js resolves the path of executable on very low (non-abstract) level, for example symlink is resolved to "concrete file" executable and
that is considered to be the base path relative to which all library and JSON loadings by Node.js require("...") function is done relative to.
To overcome this nastily unintuitive quirk, set `export NODE_PATH=.` to (also) load libs relative to current libs (e.g. docker-imager config files).

# References
- https://software.opensuse.org/package/
- https://unix.stackexchange.com/questions/82016/how-to-use-zypper-in-bash-scripts-for-someone-coming-from-apt-get
- https://serverfault.com/questions/949991/how-to-install-tzdata-on-a-ubuntu-docker-image Preventing interactivity and hang on docker build apt install
- https://daten-und-bass.io/blog/fixing-missing-locale-setting-in-ubuntu-docker-image/ Installing and setting locales for Ununtu 18

