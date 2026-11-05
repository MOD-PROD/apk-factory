import importlib.util
import io
import shutil
import stat
from unittest.mock import patch
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / ".github" / "scripts" / "build_app.py"
spec = importlib.util.spec_from_file_location("apk_factory_build", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def archive(items):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name, payload in items:
            z.writestr(name, payload)
    data.seek(0)
    return zipfile.ZipFile(data)


class HtmlArchiveTests(unittest.TestCase):
    def check(self, items):
        with tempfile.TemporaryDirectory() as tmp, archive(items) as z:
            return module.validate_html_archive(z, Path(tmp))

    def test_valid_html(self):
        entries = self.check([("index.html", "<html>OK</html>"), ("assets/main.css", "body{}")])
        self.assertEqual(len(entries), 2)

    def test_rejects_parent_escape(self):
        with self.assertRaisesRegex(ValueError, "chemin dangereux"):
            self.check([("../secret.txt", "bad")])

    def test_rejects_backslash(self):
        with self.assertRaisesRegex(ValueError, "dangereux"):
            self.check([(r"..\secret.txt", "bad")])

    def test_rejects_windows_drive(self):
        with self.assertRaisesRegex(ValueError, "Windows"):
            self.check([("C:/temp/secret.txt", "bad")])

    def test_rejects_duplicate(self):
        with self.assertRaisesRegex(ValueError, "dupliquée"):
            self.check([("index.html", "a"), ("index.html", "b")])

    def test_rejects_unpacked_size(self):
        old = module.MAX_UNPACKED
        module.MAX_UNPACKED = 10
        try:
            with self.assertRaisesRegex(ValueError, "100 Mo"):
                self.check([("index.html", "x" * 11)])
        finally:
            module.MAX_UNPACKED = old

    def test_rejects_too_many_entries(self):
        old = module.MAX_ARCHIVE_FILES
        module.MAX_ARCHIVE_FILES = 1
        try:
            with self.assertRaisesRegex(ValueError, "entrées"):
                self.check([("index.html", "a"), ("style.css", "b")])
        finally:
            module.MAX_ARCHIVE_FILES = old

    def test_rejects_symlink(self):
        entry = zipfile.ZipInfo("link")
        entry.create_system = 3
        entry.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaisesRegex(ValueError, "spéciale"):
            self.check([(entry, "../outside")])


    def test_named_html_is_normalized_to_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            source = work / "source.htm"
            source.write_text("<html>Page de test</html>", encoding="utf-8")
            with patch.object(module, "download", return_value=source):
                folder = module.get_html("https://example.com/accueil.htm", work)
            self.assertIsNotNone(folder)
            self.assertEqual((Path(folder) / "index.html").read_text(encoding="utf-8"), "<html>Page de test</html>")
            self.assertTrue((Path(folder) / "accueil.htm").exists())

    def test_zip_html_with_nonstandard_entry_point(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            source = work / "source.zip"
            with zipfile.ZipFile(source, "w") as z:
                z.writestr("mon-site/accueil.html", "<html>Bienvenue</html>")
                z.writestr("mon-site/assets/style.css", "body {}")
            with patch.object(module, "download", return_value=source):
                folder = module.get_html("https://example.com/site.zip", work)
            self.assertIsNotNone(folder)
            self.assertEqual((Path(folder) / "index.html").read_text(encoding="utf-8"), "<html>Bienvenue</html>")
            self.assertTrue((Path(folder) / "assets/style.css").exists())


if __name__ == "__main__":
    unittest.main()
