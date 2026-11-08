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
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

JAVA_RESERVED = {
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
    "continue", "default", "do", "double", "else", "enum", "extends", "false", "final", "finally",
    "float", "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long",
    "native", "new", "null", "package", "private", "protected", "public", "return", "short", "static",
    "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "true",
    "try", "void", "volatile", "while", "var", "record", "yield", "sealed", "permits", "non-sealed", "_",
}

# Options du patch « ModProd Réglages » acceptées dans l'entrée « reglages » (JSON).
REGLAGES = {
    "orientation": ("choice", {"portrait", "auto"}),
    "webTheme": ("choice", {"auto", "native", "css", "invert"}),
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

errors = []


def env(name, default=""):
    return os.environ.get(name, default).strip()


def fail(msg):
    errors.append(msg)


def check_package(pkg):
    if not pkg:
        fail("Nom de package obligatoire (ex. app.modprod.monappli).")
        return
    parts = pkg.split(".")
    if len(parts) < 2:
        fail(f"Nom de package « {pkg} » : au moins deux segments.")
    for p in parts:
        if not re.fullmatch(r"[a-z][a-z0-9_]*", p):
            fail(f"Nom de package « {pkg} » : segment « {p} » invalide.")
        elif p in JAVA_RESERVED:
            fail(f"Nom de package « {pkg} » : « {p} » est un mot réservé Java.")


def download(url, dest):
    if not url:
        return None
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "apk-factory"})
    site, token = env("SITE_URL"), env("CALLBACK_TOKEN")
    if site and token and url.startswith(site.rstrip("/") + "/"):
        req.add_unredirected_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            f.write(r.read())
    except Exception as e:
        fail(f"Téléchargement impossible : {url} ({e})")
        return None
    return dest


def png_size(path):
    data = Path(path).read_bytes()
    # Signature PNG : 89 50 4E 47 0D 0A 1A 0A
    if len(data) < 24 or data[:8] != bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]):
        return None
    import struct
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def get_png(label, url, dest, expect=None):
    if not url:
        return None
    p = download(url, dest)
    if not p:
        return None
    size = png_size(p)
    if not size:
        fail(f"{label} : image PNG attendue.")
        return None
    if expect and size != expect:
        fail(f"{label} : {size[0]} × {size[1]} px, il faut {expect[0]} × {expect[1]} px.")
        return None
    return str(p)


def parse_reglages(raw):
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except Exception:
        fail("Réglages : JSON invalide.")
        return {}
    if not isinstance(data, dict):
        fail("Réglages : un objet JSON est attendu.")
        return {}
    out = {}
    for k, v in data.items():
        if k not in REGLAGES:
            fail(f"Réglages : option inconnue « {k} ».")
            continue
        kind, values = REGLAGES[k]
        if kind == "bool":
            if not isinstance(v, bool):
                fail(f"Réglages : « {k} » doit valoir true ou false.")
                continue
        elif kind == "choice":
            if v not in values:
                fail(f"Réglages : « {k} » valeur invalide.")
                continue
        elif kind == "color":
            if not isinstance(v, str) or not re.fullmatch(r"#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})", v):
                fail(f"Réglages : couleur « {v} » invalide.")
                continue
            v = v.upper()
        out[k] = v
    return out


def get_html(url, work):
    if not url:
        fail("Page HTML / archive obligatoire.")
        return None
    raw = download(url, work / "download_html")
    if not raw:
        return None
    data = raw.read_bytes()[:4]
    if data[:2] == b"PK":
        import zipfile
        zdir = work / "html"
        zdir.mkdir(exist_ok=True)
        with zipfile.ZipFile(raw) as zf:
            zf.extractall(zdir)
        return str(zdir)
    dest = work / "html" / "index.html"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw.read_bytes())
    return str(dest.parent)


def main():
    work = Path(env("WORK_DIR") or "work")
    work.mkdir(parents=True, exist_ok=True)

    typ = env("IN_TYPE") or "site-web"
    app_name = env("IN_APP_NAME")
    package = env("IN_PACKAGE")
    version_name = env("IN_VERSION_NAME") or "1.0.0"
    version_code = env("IN_VERSION_CODE") or "1"

    if not app_name:
        fail("Nom de l'appli obligatoire.")
    check_package(package)

    common = {
        "appName": app_name,
        "packageName": package,
        "versionName": version_name,
        "versionCode": int(version_code) if version_code.isdigit() else 1,
    }

    patches = {}
    if typ in ("site-web", "html"):
        base = "apk-base.apk"
        app = dict(common, htmlFolder=None, webUrl=None, configFile=None, webIcon=True, iconFile=None)
        app["iconFile"] = get_png("Icône", env("IN_ICON_URL"), work / "icon.png")
        if typ == "site-web":
            url = env("IN_WEB_URL")
            if not url:
                fail("Adresse du site obligatoire.")
            else:
                try:
                    from urllib.parse import urlparse
                    u = urlparse(url)
                    if u.scheme != "https" or "." not in (u.hostname or ""):
                        raise ValueError
                except Exception:
                    fail("Adresse du site : https://… attendue.")
            app["webUrl"] = url or None
        else:
            app["htmlFolder"] = get_html(env("IN_HTML_URL"), work)
            cfg = env("IN_CONFIG_URL")
            if cfg:
                p = download(cfg, work / "config" / "config.js")
                app["configFile"] = str(p) if p else None
        reglages = {}
        for k, (kind, _) in REGLAGES.items():
            reglages[k] = False if kind == "bool" else None
        reglages["orientation"] = "portrait"
        reglages["webTheme"] = "auto"
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
        if mode in ("url", "apkToUrl") and not target_url:
            fail("Lanceur TV : lien cible obligatoire.")
        if mode in ("apk", "apkToUrl") and not target_apk:
            fail("Lanceur TV : package cible obligatoire.")
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
                    print(f"::warning::Option « {k} » absente du patch « {name} » (ignorée).")
                    continue
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
