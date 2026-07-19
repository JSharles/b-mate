import { describe, expect, it } from "vitest";
import { LoginFormSchema, SignupFormSchema } from "./schemas";

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

describe("SignupFormSchema", () => {
  const base = {
    firstName: "Jean",
    lastName: "Charles",
    email: "jc@example.com",
    password: "supersecret123",
  };

  it("accepts matching passwords", () => {
    const result = SignupFormSchema.safeParse({ ...base, confirmPassword: "supersecret123" });
    expect(result.success).toBe(true);
  });

  it("rejects when confirmPassword doesn't match password", () => {
    const result = SignupFormSchema.safeParse({ ...base, confirmPassword: "different123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
    }
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = SignupFormSchema.safeParse({
      ...base,
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });
});
