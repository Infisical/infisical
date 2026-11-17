import { slugSchema } from "./schemas";

describe("slugSchema", () => {
  describe("default validation (allowUnderscore: false)", () => {
    const schema = slugSchema({ min: 1, max: 64 });

    it("should accept valid lowercase alphanumeric and hyphenated slugs", () => {
      expect(schema.safeParse("project-slug-123").success).toBe(true);
      expect(schema.safeParse("abc").success).toBe(true);
      expect(schema.safeParse("my-cool-project").success).toBe(true);
    });

    it("should reject slugs with underscores by default", () => {
      expect(schema.safeParse("project_slug").success).toBe(false);
      expect(schema.safeParse("my_cool_project").success).toBe(false);
    });

    it("should reject slugs with spaces or special characters", () => {
      expect(schema.safeParse("project slug").success).toBe(false);
      expect(schema.safeParse("project/slug").success).toBe(false);
      expect(schema.safeParse("project:slug").success).toBe(false);
      expect(schema.safeParse("project@slug").success).toBe(false);
    });

    it("should enforce min and max lengths", () => {
      const minMaxSchema = slugSchema({ min: 3, max: 10 });
      expect(minMaxSchema.safeParse("ab").success).toBe(false);
      expect(minMaxSchema.safeParse("abc").success).toBe(true);
      expect(minMaxSchema.safeParse("1234567890").success).toBe(true);
      expect(minMaxSchema.safeParse("12345678901").success).toBe(false);
    });
  });

  describe("allowUnderscore: true", () => {
    const schemaWithUnderscore = slugSchema({ min: 1, max: 64, allowUnderscore: true });

    it("should accept slugs containing underscores", () => {
      expect(schemaWithUnderscore.safeParse("project_slug").success).toBe(true);
      expect(schemaWithUnderscore.safeParse("my_cool_project_123").success).toBe(true);
      expect(schemaWithUnderscore.safeParse("project_with-hyphens_and_underscores").success).toBe(true);
    });

    it("should accept alphanumeric characters and hyphens", () => {
      expect(schemaWithUnderscore.safeParse("valid-slug-123").success).toBe(true);
      expect(schemaWithUnderscore.safeParse("my-app").success).toBe(true);
    });

    it("should reject invalid characters such as spaces, colons, slashes", () => {
      expect(schemaWithUnderscore.safeParse("project slug").success).toBe(false);
      expect(schemaWithUnderscore.safeParse("project/slug").success).toBe(false);
      expect(schemaWithUnderscore.safeParse("project:slug").success).toBe(false);
      expect(schemaWithUnderscore.safeParse("project.slug").success).toBe(false);
      expect(schemaWithUnderscore.safeParse("project!slug").success).toBe(false);
    });

    it("should enforce min and max lengths with allowUnderscore", () => {
      const minMaxSchema = slugSchema({ min: 5, max: 20, allowUnderscore: true });
      expect(minMaxSchema.safeParse("a_b").success).toBe(false);
      expect(minMaxSchema.safeParse("a_b_c").success).toBe(true);
      expect(minMaxSchema.safeParse("a_b_c_d_e_f_g_h_i_j_k").success).toBe(false);
    });
  });
});
