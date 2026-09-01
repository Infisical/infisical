import { ProjectAccessRequestCommentSchema } from "./project-access-request-schema";

describe("ProjectAccessRequestCommentSchema", () => {
  test.each([
    [undefined, undefined],
    ["", ""],
    ["   ", ""],
    ["  I can't deploy without access. 可以帮我吗？  ", "I can't deploy without access. 可以帮我吗？"]
  ])("normalizes an optional comment", (input, expected) => {
    expect(ProjectAccessRequestCommentSchema.parse(input)).toBe(expected);
  });

  test("rejects null characters", () => {
    const result = ProjectAccessRequestCommentSchema.safeParse("before\0after");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Comment cannot contain null characters");
    }
  });

  test("rejects comments longer than 2500 characters", () => {
    expect(ProjectAccessRequestCommentSchema.safeParse("a".repeat(2501)).success).toBe(false);
  });
});
