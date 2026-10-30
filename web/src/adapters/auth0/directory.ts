import "server-only";

import { randomBytes } from "node:crypto";

import type { DirectorySettings } from "@/config/config";

/** A builder created in Auth0 before the engine provisions their allocation. `password` is null when the user already existed. */
export type NewBuilder = { readonly userId: string; readonly password: string | null };

/**
 * Create the Auth0 database user for a subject name, then give them the builder role.
 * The returned user id is what the engine stores as the actor id, and what a later sign-in
 * puts in the token's `sub`. An existing user is reused, so a retried provision does not stop
 * after Auth0 has already created the person.
 */
export async function ensureBuilderUser(
  settings: DirectorySettings,
  person: { readonly subject: string; readonly email: string; readonly name: string },
  fetchImpl: typeof fetch = fetch,
): Promise<NewBuilder> {
  const token = await managementToken(settings, fetchImpl);
  const password = randomBytes(18).toString("base64url");
  const created = await createUser(settings, person, password, token, fetchImpl);
  await assignRole(settings, created.userId, token, fetchImpl);
  return created;
}

async function managementToken(settings: DirectorySettings, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(`https://${settings.domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      audience: `https://${settings.domain}/api/v2/`,
    }),
  });
  const body = (await response.json()) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`Auth0 management token was refused (HTTP ${response.status}).`);
  return body.access_token;
}

async function createUser(
  settings: DirectorySettings,
  person: { readonly subject: string; readonly email: string; readonly name: string },
  password: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<NewBuilder> {
  const response = await fetchImpl(`https://${settings.domain}/api/v2/users`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      connection: settings.connection,
      email: person.email,
      password,
      user_id: person.subject,
      name: person.name,
      nickname: person.subject,
      email_verified: true,
    }),
  });
  if (response.status === 409) return existingUser(settings, person, token, fetchImpl);
  const body = (await response.json()) as { user_id?: string; message?: string };
  if (!response.ok || !body.user_id) throw new Error(body.message ?? `Auth0 did not create the user (HTTP ${response.status}).`);
  return { userId: body.user_id, password };
}

async function existingUser(
  settings: DirectorySettings,
  person: { readonly subject: string; readonly email: string },
  token: string,
  fetchImpl: typeof fetch,
): Promise<NewBuilder> {
  const wanted = `auth0|${person.subject}`;
  const response = await fetchImpl(`https://${settings.domain}/api/v2/users-by-email?email=${encodeURIComponent(person.email)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { user_id?: string }[] | { message?: string };
  if (!response.ok || !Array.isArray(body)) throw new Error("Auth0 could not look up the existing user.");
  const match = body.find((user) => user.user_id === wanted);
  if (!match) throw new Error(`That email already belongs to another Auth0 user, not ${wanted}.`);
  return { userId: wanted, password: null };
}

async function assignRole(settings: DirectorySettings, userId: string, token: string, fetchImpl: typeof fetch): Promise<void> {
  const response = await fetchImpl(`https://${settings.domain}/api/v2/users/${encodeURIComponent(userId)}/roles`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ roles: [settings.builderRoleId] }),
  });
  if (!response.ok) throw new Error(`Auth0 did not grant the builder role (HTTP ${response.status}).`);
}
