import { describe, expect, it } from "vitest";
import { createLoginFormSchema, createSignupFormSchema } from "./schemas";

const loginMessages = {
  emailInvalid: "Enter a valid email address",
  passwordRequired: "Password is required",
};

const signupMessages = {
  firstNameRequired: "First name is required",
  lastNameRequired: "Last name is required",
  emailInvalid: "Enter a valid email address",
  passwordTooShort: "Password must be at least 8 characters",
  passwordsDontMatch: "Passwords don't match",
  accountKindRequired: "Choose whether you're a developer or a client",
};

describe("createLoginFormSchema", () => {
  const schema = createLoginFormSchema(loginMessages);

  it("accepts a valid email and password", () => {
    const result = schema.safeParse({ email: "a@b.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = schema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(loginMessages.emailInvalid);
    }
  });

  it("rejects an empty password with a plain-language message", () => {
    const result = schema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(loginMessages.passwordRequired);
    }
  });
});

describe("createSignupFormSchema", () => {
  const base = {
    firstName: "Jean",
    lastName: "Charles",
    email: "jc@example.com",
    password: "supersecret123",
    accountKind: "developer" as const,
  };
  const schema = createSignupFormSchema(signupMessages);

  it("accepts matching passwords", () => {
    const result = schema.safeParse({ ...base, confirmPassword: "supersecret123" });
    expect(result.success).toBe(true);
  });

  it("rejects when confirmPassword doesn't match password", () => {
    const result = schema.safeParse({ ...base, confirmPassword: "different123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
      expect(result.error.issues[0].message).toBe("Passwords don't match");
    }
  });

  it("rejects a password shorter than 8 characters with a plain-language message", () => {
    const result = schema.safeParse({
      ...base,
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(signupMessages.passwordTooShort);
    }
  });

  it("rejects a blank first name with a plain-language message", () => {
    const result = schema.safeParse({ ...base, firstName: "", confirmPassword: base.password });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(signupMessages.firstNameRequired);
    }
  });

  it("accepts a client accountKind", () => {
    const result = schema.safeParse({
      ...base,
      accountKind: "client",
      confirmPassword: base.password,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing accountKind with a plain-language message", () => {
    const { accountKind: _accountKind, ...withoutKind } = base;
    const result = schema.safeParse({ ...withoutKind, confirmPassword: base.password });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(signupMessages.accountKindRequired);
    }
  });
});
