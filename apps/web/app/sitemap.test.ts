import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lists the public pages with a language alternate per locale", () => {
    const result = sitemap();

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      url: "http://localhost:3000/fr",
      alternates: {
        languages: {
          fr: "http://localhost:3000/fr",
          en: "http://localhost:3000/en",
        },
      },
    });
    expect(result.map((entry) => entry.url)).toEqual([
      "http://localhost:3000/fr",
      "http://localhost:3000/fr/login",
      "http://localhost:3000/fr/signup",
    ]);
  });
});
