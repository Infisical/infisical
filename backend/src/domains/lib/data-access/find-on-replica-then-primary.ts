import { ReadFrom, TReadOptions } from "./read-from";

// For a read that must find a row committed just before, possibly by another request (a new org, project or key),
// when the caller treats a miss as final. A miss on the replica retries once on the primary; a caller that already
// asked for the primary reads once.
export const findOnReplicaThenPrimary = async <T>(
  find: (options?: TReadOptions) => Promise<T | null>,
  notFound: () => Error,
  options?: TReadOptions
): Promise<T> => {
  const found =
    (await find(options)) ??
    (options?.readFrom === ReadFrom.Primary ? null : await find({ readFrom: ReadFrom.Primary }));
  if (!found) throw notFound();
  return found;
};
