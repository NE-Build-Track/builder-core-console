"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/domain/operator";
import type { Area, SignInState } from "@/domain/session";
import { commitAction, reviewAction, valuesOf } from "@/runtime/operator";
import { signIn } from "@/runtime/session";

import { endSession, keepSession, sessionFor } from "./session-cookies";

/**
 * The console's server actions: signing in and out of the writing areas (D16) and the Operator actions'
 * review and commit (D17). Next.js checks each call's Origin against the host, and the session cookie is
 * SameSite=Strict, so another site cannot post here. Every action re-reads the session itself.
 */

async function signInTo(area: Area, form: FormData): Promise<SignInState> {
  const key = form.get("key");
  const result = await signIn(area, typeof key === "string" ? key : "");
  if (!result.ok) return { message: result.message };
  await keepSession(area, result.sealed);
  refresh();
  return { message: null };
}

export async function signInOperator(_previous: SignInState, form: FormData): Promise<SignInState> {
  return signInTo("operator", form);
}

export async function signInBuilder(_previous: SignInState, form: FormData): Promise<SignInState> {
  return signInTo("builder", form);
}

export async function signOutOperator(): Promise<void> {
  await endSession("operator");
  refresh();
}

export async function signOutBuilder(): Promise<void> {
  await endSession("builder");
  refresh();
}

/** The key just issued, used to sign in to the Builder area (outcome 1, then the journey). */
export async function signInBuilderWithKey(form: FormData): Promise<void> {
  const key = form.get("key");
  const result = await signIn("builder", typeof key === "string" ? key : "");
  if (result.ok) {
    await keepSession("builder", result.sealed);
    redirect("/builder");
  }
  redirect(`/builder?signin=${encodeURIComponent(result.message)}`);
}

/** One Operator action: `intent` is review, commit, back or again (D17). */
export async function operate(previous: ActionState, form: FormData): Promise<ActionState> {
  const session = await sessionFor("operator");
  if (!session) return { step: "fill", values: valuesOf(form), error: { message: "Your operator session ended. Sign in again." } };
  switch (form.get("intent")) {
    case "review":
      return reviewAction(session, form);
    case "commit": {
      const state = await commitAction(session, form);
      if (state.step === "done" && state.ok) refresh();
      return state;
    }
    case "back":
      return { step: "fill", values: previous.step === "fill" ? (previous.values ?? valuesOf(form)) : previous.values };
    default:
      return { step: "fill" };
  }
}
