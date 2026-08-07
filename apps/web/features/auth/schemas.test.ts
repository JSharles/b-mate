import { describe, expect, it } from "vitest";
import { createLoginFormSchema } from "./schemas";

const loginMessages = {
  emailInvalid: "Enter a valid email address",
  passwordRequired: "Password is required",
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
