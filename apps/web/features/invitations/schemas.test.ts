import { describe, expect, it } from "vitest";
import { createAcceptInvitationFormSchema, CreateInvitationFormSchema } from "./schemas";

describe("CreateInvitationFormSchema", () => {
  it("accepts a valid email", () => {
    const result = CreateInvitationFormSchema.safeParse({ email: "client@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = CreateInvitationFormSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("createAcceptInvitationFormSchema", () => {
  describe("when the account does not exist yet", () => {
    const schema = createAcceptInvitationFormSchema(false);

    it("accepts firstName, lastName and a password of at least 8 characters", () => {
      const result = schema.safeParse({
        firstName: "Jean",
        lastName: "Charles",
        password: "supersecret123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a missing firstName", () => {
      const result = schema.safeParse({ lastName: "Charles", password: "supersecret123" });
      expect(result.success).toBe(false);
    });

    it("rejects a password shorter than 8 characters", () => {
      const result = schema.safeParse({
        firstName: "Jean",
        lastName: "Charles",
        password: "short",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("when the account already exists", () => {
    const schema = createAcceptInvitationFormSchema(true);

    it("accepts just a password, no name required", () => {
      const result = schema.safeParse({ password: "x" });
      expect(result.success).toBe(true);
    });

    it("rejects an empty password", () => {
      const result = schema.safeParse({ password: "" });
      expect(result.success).toBe(false);
    });
  });
});
