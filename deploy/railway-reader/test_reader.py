import ast
from pathlib import Path
import tomllib
import unittest

from console_reader import patched_entrypoint, reader_credential


class ReaderTests(unittest.TestCase):
    def test_no_credential_when_unconfigured(self):
        self.assertEqual(reader_credential(""), "")

    def test_only_explicit_read_permissions(self):
        credential = tomllib.loads(reader_credential("a" * 64))["credentials"][0]
        self.assertEqual(credential["id"], "console-reader")
        self.assertEqual(len(credential["management"]["allow"]), 8)
        self.assertTrue(all(permission.endswith(".read") and "*" not in permission for permission in credential["management"]["allow"]))
        self.assertNotIn("webhook", credential)
        self.assertNotIn("kafka", credential)

    def test_invalid_secret_is_refused_without_echoing_it(self):
        with self.assertRaisesRegex(ValueError, "64 lowercase hex"):
            reader_credential('bad"\nsecret')

    def test_pinned_entrypoint_patch_is_narrow_and_valid_python(self):
        source = (Path(__file__).parent / "base-entrypoint.py").read_text()
        result = patched_entrypoint(source)
        ast.parse(result)
        self.assertIn('creds += reader_credential(os.environ.get("CONSOLE_READER_TOKEN", ""))', result)
        self.assertIn('os.execv(', result)
        with self.assertRaises(ValueError):
            patched_entrypoint("unexpected source")


if __name__ == "__main__":
    unittest.main()
