import { diff } from "./array";

describe("diff", () => {
  test("returns items in root that are not in other", () => {
    expect(diff([1, 2, 3], [2])).toEqual([1, 3]);
  });

  test("uses the identity function when provided", () => {
    const root = [{ id: "a" }, { id: "b" }];
    const other = [{ id: "b" }];
    expect(diff(root, other, (x) => x.id)).toEqual([{ id: "a" }]);
  });

  test("an empty other returns a copy of root", () => {
    expect(diff([1, 2], [])).toEqual([1, 2]);
  });

  test("an empty or nullish root returns an empty array", () => {
    // A missing root means there are no items to diff, so both an empty array
    // and a nullish root must produce []. Previously a nullish root returned
    // `other`, which is the opposite of what diff should do.
    expect(diff([], [1, 2, 3])).toEqual([]);
    expect(diff(null as unknown as number[], [1, 2, 3])).toEqual([]);
    expect(diff(undefined as unknown as number[], [1, 2, 3])).toEqual([]);
  });
});
