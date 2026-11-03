#!/usr/bin/env python3
"""Prépare la fabrication d'une appli pour build-app.yml.

Lit les réglages dans les variables d'environnement IN_* (entrées du workflow),
les vérifie, télécharge les fichiers (page HTML ou .zip, icône, bannière, config.js)
puis écrit le fichier d'options Morphe.

Sorties (dans GITHUB_OUTPUT si présent, sinon affichées) :
  base      apk-base.apk ou atv-base.apk
  options   chemin du fichier d'options Morphe
  apk_name  nom du fichier APK final
  package   nom de package
"""

import json
import keyword
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

MAX_DOWNLOAD = 50 * 1024 * 1024  # 50 Mo par fichier

# Mots réservés Java (un segment de package ne peut pas en être un).
JAVA_RESERVED = {
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class",
    "const", "continue", "default", "do", "double", "else", "enum", "extends", "false",
    "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof",
    "int", "interface", "long", "native", "new", "null", "package", "private", "protected",
    "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized",
    "this", "throw", "throws", "transient", "true", "try", "void", "volatile", "while",
    "var", "record", "yield", "sealed", "permits", "non-sealed", "_",
}

# Options du patch « ModProd Réglages » acceptées dans l'entrée « reglages » (JSON).
REGLAGES = {
    "orientation": ("choice", {"portrait", "auto"}),
    "fullscreen": ("bool", None),
    "keepScreenOn": ("bool", None),
    "blockScreenshots": ("bool", None),
    "zoom": ("bool", None),
    "scrollBars": ("bool", None),
    "debug": ("bool", None),
    "backgroundColor": ("color", None),
    "barsColor": ("color", None),
    "accentColor": ("color", None),
    "camera": ("bool", None),
    "microphone": ("bool", None),
    "location": ("bool", None),
}

COLOR_RE = re.compile(r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$")
VERSION_NAME_RE = re.compile(r"^[0-9A-Za-z._+-]{1,50}$")

errors = []


def env(name):
    return (os.environ.get(name) or "").strip()


def fail(msg):
    errors.append(msg)


def check_package(pkg):
    if not pkg:
        fail("Nom de package obligatoire (ex. app.modprod.monappli).")
        return
    parts = pkg.split(".")
    if len(parts) < 2:
        fail(f"Nom de package « {pkg} » : il faut au moins deux segments (ex. app.modprod.monappli).")
    for p in parts:
        if not re.fullmatch(r"[a-z][a-z0-9_]*", p):
            fail(f"Nom de package « {pkg} » : le segment « {p} » doit être en minuscules, "
                 "commencer par une lettre et ne contenir que lettres, chiffres ou _.")
        elif p in JAVA_RESERVED or keyword.iskeyword(p):
            fail(f"Nom de package « {pkg} » : « {p} » est un mot réservé Java.")


def check_https(label, url, required=False):
    if not url:
        if required:
            fail(f"{label} obligatoire.")
        return
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or not u.netloc:
        fail(f"{label} : adresse https:// attendue (reçu « {url} »).")


def download(url, dest):
    """Télécharge url dans dest (50 Mo max). Renvoie le chemin ou None en cas d'erreur."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "apk-factory"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            total = 0
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_DOWNLOAD:
                    raise ValueError("fichier de plus de 50 Mo")
                f.write(chunk)
    except Exception as e:  # noqa: BLE001
        fail(f"Téléchargement impossible : {url} ({e})")
        return None
    return dest


def is_png(path):
    with open(path, "rb") as f:
        return f.read(8) == b"\x89PNG\r\n\x1a\n"


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def get_png(label, url, dest, expect=None):
    if not url:
        return None
    check_https(label, url)
    if errors:
        return None
    p = download(url, dest)
    if not p:
        return None
    if not is_png(p):
        fail(f"{label} : le fichier doit être une image PNG.")
        return None
    w, h = png_size(p)
    if expect and (w, h) != expect:
        fail(f"{label} : {w} × {h} px, il faut {expect[0]} × {expect[1]} px.")
        return None
    if not expect and w != h:
        print(f"::warning::{label} : image non carrée ({w} × {h} px).")
    return str(p)


def get_html(url, work):
    """Page .html ou archive .zip → dossier prêt pour l'option htmlFolder."""
    check_https("Page HTML / archive .zip", url, required=True)
    if errors:
        return None
    folder = work / "html"
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    name = Path(urllib.parse.urlparse(url).path).name or "index.html"
    raw = download(url, work / ("download_" + name))
    if not raw:
        return None

    if zipfile.is_zipfile(raw):
        with zipfile.ZipFile(raw) as z:
            for info in z.infolist():
                target = (folder / info.filename).resolve()
                if not str(target).startswith(str(folder.resolve()) + os.sep) and target != folder.resolve():
                    fail(f"Archive .zip refusée : chemin dangereux « {info.filename} ».")
                    return None
            z.extractall(folder)
        # Dossier racine unique dans l'archive (MonAppli/index.html) → on descend dedans.
        entries = [e for e in folder.iterdir() if e.name != "__MACOSX"]
        if len(entries) == 1 and entries[0].is_dir():
            inner = entries[0]
            tmp = work / "html_inner"
            shutil.move(str(inner), tmp)
            shutil.rmtree(folder)
            shutil.move(str(tmp), folder)
        shutil.rmtree(folder / "__MACOSX", ignore_errors=True)
    else:
        text = raw.read_bytes()[:2048].lower()
        if b"<html" not in text and b"<!doctype" not in text:
            fail("Page HTML : le fichier n'est ni une page .html ni une archive .zip.")
            return None
        dest_name = name if name.lower().endswith((".html", ".htm")) else "index.html"
        shutil.copy(raw, folder / dest_name)

    pages = sorted(p.name for p in folder.iterdir() if p.suffix.lower() in (".html", ".htm"))
    if not pages:
        fail("Page HTML : aucun fichier .html à la racine (de l'archive).")
        return None
    start = "index.html" if "index.html" in pages else pages[0]
    print(f"Page de démarrage : {start} ({sum(1 for _ in folder.rglob('*') if _.is_file())} fichiers)")
    return str(folder)


def parse_reglages(text):
    if not text:
        return {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        fail(f"Réglages : JSON invalide ({e}). Exemple : {{\"fullscreen\": true, \"barsColor\": \"#FAFAFA\"}}")
        return {}
    if not isinstance(data, dict):
        fail("Réglages : un objet JSON est attendu, ex. {\"fullscreen\": true}.")
        return {}
    out = {}
    for k, v in data.items():
        if k not in REGLAGES:
            fail(f"Réglages : option inconnue « {k} ». Options : {', '.join(REGLAGES)}.")
            continue
        kind, values = REGLAGES[k]
        if kind == "bool":
            if not isinstance(v, bool):
                fail(f"Réglages : « {k} » doit valoir true ou false.")
                continue
        elif kind == "choice":
            if v not in values:
                fail(f"Réglages : « {k} » doit valoir {' ou '.join(sorted(values))}.")
                continue
        elif kind == "color":
            if v in (None, ""):
                v = None
            elif not isinstance(v, str) or not COLOR_RE.match(v):
                fail(f"Réglages : « {k} » doit être une couleur #RGB, #RRGGBB ou #AARRGGBB.")
                continue
            else:
                v = v.upper()  # Morphe attend les couleurs en majuscules
        out[k] = v
    return out


def main():
    work = Path(env("WORK_DIR") or "work").resolve()
    work.mkdir(parents=True, exist_ok=True)

    app_type = env("IN_TYPE")
    app_name = env("IN_APP_NAME")
    package = env("IN_PACKAGE")
    version_name = env("IN_VERSION_NAME")
    version_code = env("IN_VERSION_CODE")

    if app_type not in ("site-web", "html", "atv"):
        fail(f"Type d'appli inconnu « {app_type} » (site-web, html ou atv).")
    if not app_name:
        fail("Nom de l'appli obligatoire.")
    elif len(app_name) > 50:
        fail("Nom de l'appli : 50 caractères maximum.")
    check_package(package)
    if version_name and not VERSION_NAME_RE.match(version_name):
        fail("Version (nom) : lettres, chiffres et . _ + - seulement (ex. 1.0.0).")
    vcode = None
    if version_code:
        if not version_code.isdigit() or not (1 <= int(version_code) <= 2100000000):
            fail("Version (code) : nombre entier entre 1 et 2100000000.")
        else:
            vcode = int(version_code)

    common = {"appName": app_name, "packageName": package,
              "versionName": version_name or None, "versionCode": vcode}

    patches = {}
    if app_type in ("site-web", "html"):
        base = "apk-base.apk"
        app = dict(common, htmlFolder=None, webUrl=None, configFile=None, webIcon=True, iconFile=None)
        app["iconFile"] = get_png("Icône", env("IN_ICON_URL"), work / "icon.png")
        if app_type == "site-web":
            check_https("Adresse du site", env("IN_WEB_URL"), required=True)
            app["webUrl"] = env("IN_WEB_URL") or None
        else:
            app["htmlFolder"] = get_html(env("IN_HTML_URL"), work)
            cfg = env("IN_CONFIG_URL")
            if cfg:
                check_https("Fichier config.js", cfg)
                if not errors:
                    p = download(cfg, work / "config" / "config.js")
                    app["configFile"] = str(p) if p else None
        # Valeurs par défaut = APK de base inchangé, puis ce qui est demandé.
        reglages = {}
        for k, (kind, _) in REGLAGES.items():
            reglages[k] = False if kind == "bool" else None
        reglages["orientation"] = "portrait"
        reglages.update(parse_reglages(env("IN_REGLAGES")))
        patches["ModProd App"] = {"enabled": True, "options": app}
        patches["ModProd Réglages"] = {"enabled": True, "options": reglages}
        patches["ATV Launcher"] = {"enabled": False, "options": {}}
    else:
        base = "atv-base.apk"
        mode = env("IN_ATV_MODE") or "url"
        if mode not in ("url", "apk", "apkToUrl"):
            fail("Lanceur TV : action url, apk ou apkToUrl.")
        target_url = env("IN_ATV_TARGET_URL")
        target_apk = env("IN_ATV_TARGET_APK")
        if mode in ("url", "apkToUrl"):
            if not target_url:
                fail("Lanceur TV : lien cible obligatoire pour cette action.")
            elif not re.match(r"^(https://|intent://)", target_url):
                fail("Lanceur TV : le lien cible doit commencer par https:// ou intent://.")
        if mode in ("apk", "apkToUrl"):
            if not target_apk:
                fail("Lanceur TV : package de l'appli cible obligatoire pour cette action.")
            elif not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+", target_apk):
                fail(f"Lanceur TV : package cible « {target_apk} » invalide.")
        atv = dict(common, mode=mode, targetUrl=target_url or None, targetApk=target_apk or None,
                   isGame=env("IN_ATV_IS_GAME").lower() == "true")
        atv["banner"] = get_png("Bannière TV", env("IN_BANNER_URL"), work / "banner.png", expect=(320, 180))
        atv["icon"] = get_png("Icône", env("IN_ICON_URL"), work / "icon.png")
        patches["ATV Launcher"] = {"enabled": True, "options": atv}
        patches["ModProd App"] = {"enabled": False, "options": {}}
        patches["ModProd Réglages"] = {"enabled": False, "options": {}}

    if errors:
        for e in errors:
            print(f"::error::{e}")
        sys.exit(1)

    # On part du fichier généré par « options-create » (même format que Morphe) et on remplit.
    options_path = work / "options.json"
    template = env("OPTIONS_TEMPLATE")
    if template and Path(template).exists():
        data = json.loads(Path(template).read_text(encoding="utf-8"))
        bundle = data[0]["patches"]
        for name, conf in patches.items():
            if name not in bundle:
                print(f"::error::Patch « {name} » absent du fichier .mpp.")
                sys.exit(1)
            bundle[name]["enabled"] = conf["enabled"]
            for k, v in conf["options"].items():
                if k not in bundle[name]["options"]:
                    print(f"::error::Option « {k} » absente du patch « {name} ».")
                    sys.exit(1)
                bundle[name]["options"][k] = v
    else:
        data = [{"patches": patches}]
    options_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    vn = re.sub(r"[^0-9A-Za-z._-]", "_", version_name) if version_name else "build"
    apk_name = f"{package}-{vn}.apk"

    outputs = {"base": base, "options": str(options_path), "apk_name": apk_name, "package": package}
    out_file = os.environ.get("GITHUB_OUTPUT")
    if out_file:
        with open(out_file, "a", encoding="utf-8") as f:
            for k, v in outputs.items():
                f.write(f"{k}={v}\n")
    for k, v in outputs.items():
        print(f"{k} = {v}")


if __name__ == "__main__":
    main()
