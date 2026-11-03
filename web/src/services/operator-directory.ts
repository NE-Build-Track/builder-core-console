/**
 * Adding an operator (Auth0 database user, no engine allocation). Pure form parsing and the review.
 */
import { invalid, optionalLabel, text, type Parsed } from "@/domain/forms";
import type { ActionInput, Review } from "@/domain/operator";

/** A subject name the operator types. Auth0 stores it as the user id and prefixes the connection, so the token's sub is `auth0|<name>`. */
export const SUBJECT = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

export function provisionOperatorOf(form: FormData): Parsed<ActionInput> {
  const subjectRaw = text(form, "subject");
  if (!SUBJECT.test(subjectRaw)) return invalid("subject", "Subject name starts with a letter and may use letters, digits and . _ -.");
  const email = text(form, "email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid("email", "Give an email address. Auth0 needs one to create the user.");
  return {
    ok: true,
    value: {
      action: "provisionOperator",
      subject: subjectRaw,
      email,
      userId: `auth0|${subjectRaw}`,
      label: optionalLabel(form, "label"),
      roleId: null,
    },
  };
}

export function operatorReview(input: Extract<ActionInput, { action: "provisionOperator" }>, base: Omit<Review, "lines" | "button">): Review {
  return {
    ...base,
    lines: [
      { label: "Operator", value: input.userId, mono: true },
      { label: "Email", value: input.email },
      { label: "Role", value: "operator (livepeer:admin)" },
      ...(input.label ? [{ label: "Label", value: input.label }] : []),
      { label: "Effect", value: "A database sign-in. No grant is drawn and no allocation is created." },
    ],
    button: "Add the operator",
  };
}
