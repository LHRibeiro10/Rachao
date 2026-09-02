const fs = require("fs");
const path = require("path");

const base = __dirname;

const cssText = fs.readFileSync(path.join(base, "style.css"), "utf-8");
const bodyShell = fs.readFileSync(path.join(base, "body_shell.html"), "utf-8");
const appJs = fs.readFileSync(path.join(base, "app.js"), "utf-8");
const seedState = JSON.parse(fs.readFileSync(path.join(base, "live_state.json"), "utf-8"));

function jsStr(s) {
  return JSON.stringify(s).replace(/</g, "\\u003c");
}

const headerConsts =
  "const CSS_TEXT = " + jsStr(cssText) + ";\n" +
  "const BODY_SHELL = " + jsStr(bodyShell) + ";\n" +
  "const LOGIC_SRC = " + jsStr(appJs) + ";\n";

const script = headerConsts + appJs + "\nboot(JSON.parse(" + jsStr(JSON.stringify(seedState)) + "));";

const googleFontsLink =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  "family=Oswald:wght@500;600;700&family=Public+Sans:wght@400;500;600;700" +
  '&family=JetBrains+Mono:wght@500;600;700&display=swap">\n';

const staticFile =
  '<!doctype html>\n<html lang="pt-BR">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<meta name="description" content="Classificação da pelada — mescla toda semana.">\n' +
  "<title>Racha 2026</title>\n" +
  googleFontsLink +
  "<style>\n" + cssText + "\n</style>\n" +
  "</head>\n<body>\n" +
  bodyShell + "\n" +
  "<script>\n" + script + "\n</script>\n" +
  "</body>\n</html>\n";

fs.mkdirSync(path.join(base, "public"), { recursive: true });
fs.writeFileSync(path.join(base, "public", "index.html"), staticFile);

console.log("wrote public/index.html", staticFile.length, "bytes");
