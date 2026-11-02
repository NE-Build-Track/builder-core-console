import unittest

from inventory_from_moba import connection


class InventoryTests(unittest.TestCase):
    def test_extracts_only_ssh_connection_fields(self):
        actual = connection("Example =#109#0%203.0.113.10%22%root%%-1%-1%%%ignored-secret\n")
        self.assertEqual(actual, {"ansible_host": "203.0.113.10", "ansible_port": 22, "ansible_user": "root"})

    def test_rejects_other_sessions_and_unsafe_values(self):
        for text in ("not a bookmark", "Example=#108#0%203.0.113.10%22%root", "Example=#109#0%203.0.113.10%99999%root",
                     "Example=#109#0%203.0.113.10%22%root;command"):
            with self.assertRaises(ValueError):
                connection(text)


if __name__ == "__main__":
    unittest.main()
