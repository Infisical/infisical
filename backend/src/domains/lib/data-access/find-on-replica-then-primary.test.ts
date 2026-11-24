import { findOnReplicaThenPrimary } from "./find-on-replica-then-primary";
import { ReadFrom, TReadOptions } from "./read-from";

// A replica that hasn't caught up: only the primary has the row.
const laggingFind = (row: string | null) => {
  const reads: (TReadOptions | undefined)[] = [];
  const find = async (options?: TReadOptions) => {
    reads.push(options);
    return options?.readFrom === ReadFrom.Primary ? row : null;
  };
  return { find, reads };
};

const notFound = () => new Error("not found");

describe("findOnReplicaThenPrimary", () => {
  test("should read a row the replica does not have yet from the primary", async () => {
    // Setup
    const { find, reads } = laggingFind("row");

    // Action
    const found = await findOnReplicaThenPrimary(find, notFound);

    // Assert
    expect(found).toBe("row");
    expect(reads).toEqual([undefined, { readFrom: ReadFrom.Primary }]);
  });

  test("should read once when the replica has the row", async () => {
    // Setup
    const reads: (TReadOptions | undefined)[] = [];
    const find = async (options?: TReadOptions) => {
      reads.push(options);
      return "row";
    };

    // Action
    const found = await findOnReplicaThenPrimary(find, notFound);

    // Assert
    expect(found).toBe("row");
    expect(reads).toEqual([undefined]);
  });

  test("should throw the caller's error when neither has the row", async () => {
    // Setup
    const { find, reads } = laggingFind(null);

    // Action
    const result = findOnReplicaThenPrimary(find, notFound);

    // Assert
    await expect(result).rejects.toThrow("not found");
    expect(reads).toEqual([undefined, { readFrom: ReadFrom.Primary }]);
  });

  test("should not read again when the caller already read the primary", async () => {
    // Setup
    const { find, reads } = laggingFind(null);

    // Action
    const result = findOnReplicaThenPrimary(find, notFound, { readFrom: ReadFrom.Primary });

    // Assert
    await expect(result).rejects.toThrow("not found");
    expect(reads).toEqual([{ readFrom: ReadFrom.Primary }]);
  });
});
