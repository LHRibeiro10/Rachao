import json, os

base = os.path.dirname(os.path.abspath(__file__)) + "/"

css_text = open(base + "style.css", encoding="utf-8").read()
body_shell = open(base + "body_shell.html", encoding="utf-8").read()
app_js = open(base + "app.js", encoding="utf-8").read()
seed_state = json.load(open(base + "live_state.json", encoding="utf-8"))


def js_str(s):
    return json.dumps(s, ensure_ascii=False).replace("<", "\\u003c")


header_consts = (
    "const CSS_TEXT = " + js_str(css_text) + ";\n"
    "const BODY_SHELL = " + js_str(body_shell) + ";\n"
    "const LOGIC_SRC = " + js_str(app_js) + ";\n"
)

script = header_consts + app_js + "\nboot(JSON.parse(" + js_str(json.dumps(seed_state, ensure_ascii=False)) + "));"

GOOGLE_FONTS_LINK = (
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
    "family=Oswald:wght@500;600;700&family=Public+Sans:wght@400;500;600;700"
    '&family=JetBrains+Mono:wght@500;600;700&display=swap">\n'
)

# 1) fragment for the Claude Artifact tool: NO doctype/html/head/body of
#    its own (the Artifact tool wraps it). Only needed if you re-publish
#    this app as a Claude artifact again in the future.
artifact_fragment = (
    "<title>Racha 2026</title>\n"
    + GOOGLE_FONTS_LINK
    + "<style>\n" + css_text + "\n</style>\n"
    + body_shell + "\n"
    + "<script>\n" + script + "\n</script>\n"
)
open(base + "artifact_source.html", "w", encoding="utf-8").write(artifact_fragment)

# 2) full standalone document for static hosting (Vercel, or any static
#    host / opening the file directly). No window.claude runtime there,
#    so the page boots read-only automatically (see boot() in app.js).
static_file = (
    "<!doctype html>\n<html lang=\"pt-BR\">\n<head>\n"
    '<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    '<meta name="description" content="Classificação da pelada — mescla toda semana.">\n'
    "<title>Racha 2026</title>\n"
    + GOOGLE_FONTS_LINK
    + "<style>\n" + css_text + "\n</style>\n"
    + "</head>\n<body>\n"
    + body_shell + "\n"
    + "<script>\n" + script + "\n</script>\n"
    + "</body>\n</html>\n"
)
os.makedirs(base + "public", exist_ok=True)
open(base + "public/index.html", "w", encoding="utf-8").write(static_file)

print("wrote artifact_source.html:", len(artifact_fragment), "bytes")
print("wrote public/index.html:", len(static_file), "bytes")
