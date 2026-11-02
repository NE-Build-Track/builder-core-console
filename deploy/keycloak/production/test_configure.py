"""Offline production provisioning checks: python3 -m unittest discover -s deploy/keycloak/production."""

import argparse
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import configure


class ProvisioningTests(unittest.TestCase):
    def setUp(self):
        self.realm = configure.realm_config("console.example.com", "https://engine.example.com")

    def test_no_demo_users_passwords_or_privileged_default_roles(self):
        self.assertEqual(len(self.realm["users"]), 1)
        reader = self.realm["users"][0]
        self.assertEqual(reader["serviceAccountClientId"], "console-reader")
        self.assertNotIn("id", reader)
        self.assertNotIn("credentials", reader)
        default = next(role for role in self.realm["roles"]["realm"] if role["name"] == self.realm["defaultRole"]["name"])
        self.assertEqual(default["composites"], {"realm": ["builder"]})
        self.assertNotIn("DEMO_PASSWORD", json.dumps(self.realm))

    def test_exact_https_callbacks_strict_tokens_and_separate_reader(self):
        console, reader = self.realm["clients"]
        self.assertEqual(console["redirectUris"], ["https://console.example.com/auth/callback"])
        self.assertNotIn("*", console["attributes"]["post.logout.redirect.uris"])
        self.assertFalse(console["serviceAccountsEnabled"])
        self.assertFalse(reader["standardFlowEnabled"])
        self.assertNotIn("livepeer:admin", reader["defaultClientScopes"])
        for client in (console, reader):
            self.assertFalse(client["fullScopeAllowed"])
            self.assertFalse(client["directAccessGrantsEnabled"])
            self.assertFalse(client["implicitFlowEnabled"])
            self.assertEqual(client["attributes"]["access.token.header.type.rfc9068"], "true")
        mapping = {item["clientScope"]: item["roles"] for item in self.realm["scopeMappings"]}
        self.assertEqual(mapping["livepeer:admin"], ["operator"])
        self.assertEqual(mapping["livepeer:read"], ["reader"])
        self.assertEqual(self.realm["sslRequired"], "all")
        self.assertEqual(self.realm["accessTokenLifespan"], 300)

    def test_google_only_without_email_linking_or_stored_google_tokens(self):
        google = self.realm["identityProviders"][0]
        self.assertFalse(google["storeToken"])
        self.assertFalse(google["trustEmail"])
        self.assertEqual(google["config"]["clientSecret"], "${GOOGLE_CLIENT_SECRET}")
        first = next(flow for flow in self.realm["authenticationFlows"] if flow["alias"] == google["firstBrokerLoginFlowAlias"])
        self.assertEqual([item["authenticator"] for item in first["authenticationExecutions"]], ["idp-create-user-if-unique"])
        self.assertEqual(first["authenticationExecutions"][0]["requirement"], "REQUIRED")
        self.assertFalse(self.realm["registrationAllowed"])
        self.assertFalse(self.realm["resetPasswordAllowed"])

    def test_init_is_idempotent_and_never_prints_or_renders_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            here = Path(directory)
            args = argparse.Namespace(auth_host="auth.example.com", console_host="console.example.com",
                                      engine_audience="https://engine.example.com", acme_email="ops@example.com",
                                      google_client_id="123-example.apps.googleusercontent.com")
            output = io.StringIO()
            # Keep access to the checked-in source template while redirecting generated outputs.
            with patch.object(configure, "HERE", here), patch.object(configure, "realm_config", return_value=self.realm), \
                 patch.dict(os.environ, {"GOOGLE_CLIENT_SECRET": "test-google-secret"}), contextlib.redirect_stdout(output):
                configure.initialize(args)
                before = (here / ".env").read_bytes()
                configure.initialize(args)
                self.assertEqual(before, (here / ".env").read_bytes())
                self.assertNotIn("test-google-secret", output.getvalue())
                self.assertNotIn("test-google-secret", (here / "runtime/livepeer-realm.json").read_text())
                self.assertEqual(len(configure.read_env(here / ".env")["CONSOLE_SESSION_SECRET"]), 64)
                args.auth_host = "other.example.com"
                with self.assertRaisesRegex(ValueError, "first-install only"):
                    configure.initialize(args)

    def test_rejects_unsafe_hostnames_and_audiences(self):
        for value in ("http://auth.example.com", "auth.example.com/path", "*.example.com", "auth.localhost", "a\n.example.com"):
            with self.assertRaises(ValueError):
                configure.hostname(value)
        with self.assertRaises(ValueError):
            configure.origin("http://engine.example.com")

    def test_operator_requires_existing_google_identity_and_uses_uuid(self):
        uid = "c3f6357e-9f2b-4def-b708-2d87e16222ac"
        args = argparse.Namespace(command="grant-operator", user_id=uid)
        with patch.object(configure, "admin", side_effect=[{"enabled": True}, []]) as admin:
            with self.assertRaisesRegex(ValueError, "existing Google login"):
                configure.operator(args)
            self.assertEqual(admin.call_count, 2)
        with patch.object(configure, "admin", side_effect=[{"enabled": True}, [{"identityProvider": "google"}], None]) as admin, \
             contextlib.redirect_stdout(io.StringIO()):
            configure.operator(args)
            self.assertEqual(admin.call_args.args[0], ["add-roles", "-r", "livepeer", "--uid", uid, "--rolename", "operator"])
        args.user_id = "someone@example.com"
        with self.assertRaises(ValueError):
            configure.operator(args)


if __name__ == "__main__":
    unittest.main()
