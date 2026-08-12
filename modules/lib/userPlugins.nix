{
  lib,
  fetchGit ? builtins.fetchGit,
}:
value:
let
  forgeUrls = {
    bitbucket = "https://bitbucket.org";
    codeberg = "https://codeberg.org";
    github = "https://github.com";
    gitlab = "https://gitlab.com";
    sourcehut = "https://git.sr.ht";
  };
  forgeRegex = "([[:alpha:]]+):([^/]+/.+)/([0-9a-f]{40})";
  genericGitRegex = "git[+]([^?]+)[?]rev=([0-9a-f]{40})";
  forgeMatches = builtins.match forgeRegex value;
  genericGitMatches = builtins.match genericGitRegex value;
  forge = if forgeMatches == null then null else builtins.elemAt forgeMatches 0;
in
if forge != null && builtins.hasAttr forge forgeUrls then
  fetchGit {
    url = "${builtins.getAttr forge forgeUrls}/${builtins.elemAt forgeMatches 1}";
    rev = builtins.elemAt forgeMatches 2;
  }
else if genericGitMatches != null then
  fetchGit {
    url = builtins.elemAt genericGitMatches 0;
    rev = builtins.elemAt genericGitMatches 1;
  }
else if lib.strings.hasPrefix "/" value then
  /. + value
else
  throw "programs.nixcord.userPlugins: '${value}' is not a pinned Git source ('git+<url>?rev=<40-character commit>'), supported forge shorthand (github, gitlab, codeberg, sourcehut, or bitbucket), or absolute local path (must start with /)"
