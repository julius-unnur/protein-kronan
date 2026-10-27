"""Býr til docs/data.json úr gögnunum sem Codex sótti úr Krónu MCP 26.10.2026."""
import json, re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src = json.loads((root / "scripts/source-data.json").read_text())

FLAGS = {
    "Nóa opal hlauphringir": "Næringargildi í MCP segja 38 g prótein á 100 g, sem getur ekki staðist fyrir hlaup.",
    "Saf instant þurrger": "Þurrger er bökunarefni, ekki próteingjafi sem er borðaður í þessu magni.",
}

TYPES = [
    ("Próteinduft", r"mysupr|myspr|whey|próteinduft|protein water|tropic prótein|bloom|vegan prótein|iso clear|casein|kasein"),
    ("Próteindrykkir", r"hleðsla|próteindrykk|\bupp\b|protein drink|próteinkaffi|prótein\+|arna\+|kefír prótein"),
    ("Baunir og plöntuprótein", r"tofu|baun|linsu|soja|edamame|oumph|vegan|tempeh|seitan|hummus|kjúklingabaun"),
    ("Fiskur og sjávarfang", r"rækj|lax|þorsk|ýs[ua]|steinbít|krækl|túnfisk|harðfisk|bitafisk|fisk|síld|bleikj|skelfisk|humar|hörpu|makríl|sardín|lúð"),
    ("Kjúklingur og kalkúnn", r"kjúkl|kalkún|chicken|turkey|chick"),
    ("Kjöt og innmatur", r"lifur|nýru|hjört|hakk|grís(?!k)|lamb|naut|hross|folald|svín|kjöt|skinka|beikon|pyls|ham\b|salami|bjúg|kótilett|lund|gúllas|steik|uxahal|bógur|ribs|krakowska|pepperoni|spægip"),
    ("Egg", r"\begg"),
    ("Skyr og mjólkurvörur", r"skyr|jógúrt|kefír|ost|kotasæl|mjólk|undanrenn|búðing|propud|ab-|abmjólk|súrmjólk|rjóm"),
    ("Korn, pasta og brauð", r"hveiti|hafra|pasta|spaghetti|fusilli|penne|brauð|korn|núðl|hrísgrj|bygg|spelt|lágkolvetna"),
]

def classify(name):
    n = name.lower()
    for t, pat in TYPES:
        if re.search(pat, n):
            return t
    return "Annað"

def slim(x):
    out = {k: x.get(k) for k in ("sku", "name", "price", "amount", "unit", "protein", "kcal", "portion",
                                  "cost", "cal", "score", "status", "notes", "url", "group", "nutrition",
                                  "packLabel", "preparation", "preparationNote", "rank")}
    for k in ("portion", "cost", "cal", "score"):
        if isinstance(out[k], float):
            out[k] = round(out[k], 2)
    out["type"] = classify(x["name"])
    if x["name"] in FLAGS:
        out["flag"] = FLAGS[x["name"]]
    return {k: v for k, v in out.items() if v not in (None, [], {})}

items = [slim(x) for x in src["ranked"]] + [slim(x) for x in src["excluded"]]
data = {"date": src["date"], "meta": src["meta"], "items": items}
(root / "docs/data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))

from collections import Counter
print(len(items), "vörur;", Counter(i["type"] for i in items if "score" in i))
