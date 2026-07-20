import { describe, expect, it } from "vitest";
import { createSignupFormSchema, LoginFormSchema } from "./schemas";

describe("LoginFormSchema", () => {
  it("accepts a valid email and password", () => {
    const result = LoginFormSchema.safeParse({ email: "a@b.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = LoginFormSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });
});

describe("createSignupFormSchema", () => {
  const base = {
    firstName: "Jean",
    lastName: "Charles",
    email: "jc@example.com",
    password: "supersecret123",
  };
  const schema = createSignupFormSchema("Passwords don't match");

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

  it("rejects a password shorter than 8 characters", () => {
    const result = schema.safeParse({
      ...base,
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });
});
