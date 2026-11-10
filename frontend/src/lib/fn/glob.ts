// Port of backend/src/lib/casl/glob-subset.ts. Access request forms check a requested path against
// policy paths with it, so the form refuses exactly the paths the server refuses. Keep the two in sync.

type Segment = { type: "literal"; value: string } | { type: "star" } | { type: "globstar" };

const SEGMENT_METACHARACTER = /[*?[\]{}!()]/;

const parseSegments = (glob: string): Segment[] | null => {
  const segments: Segment[] = [];
  for (const part of glob.split("/")) {
    if (part === "*") {
      segments.push({ type: "star" });
    } else if (part === "**") {
      segments.push({ type: "globstar" });
    } else if (SEGMENT_METACHARACTER.test(part)) {
      return null;
    } else {
      segments.push({ type: "literal", value: part });
    }
  }
  return segments;
};

const segmentMatch = (parent: Segment[], subset: Segment[], pi: number, si: number): boolean => {
  if (pi >= parent.length && si >= subset.length) return true;

  if (pi < parent.length && parent[pi].type === "globstar") {
    if (segmentMatch(parent, subset, pi + 1, si)) return true;
    if (si < subset.length) return segmentMatch(parent, subset, pi, si + 1);
    return false;
  }

  if (pi >= parent.length) return false;

  if (si >= subset.length) {
    return parent.slice(pi).every((segment) => segment.type === "globstar");
  }

  const pSeg = parent[pi];
  const sSeg = subset[si];

  if (pSeg.type === "star") {
    if (sSeg.type === "globstar") return false;
    return segmentMatch(parent, subset, pi + 1, si + 1);
  }

  if (pSeg.type === "literal") {
    if (sSeg.type !== "literal" || sSeg.value !== pSeg.value) return false;
    return segmentMatch(parent, subset, pi + 1, si + 1);
  }

  return false;
};

/**
 * Returns true if every path matched by `subsetGlob` is also matched by `parentGlob`. Only literal, `*` and
 * `**` segments are understood; any other glob feature returns false unless the two globs are identical.
 */
export const isGlobSubsetOfGlob = (parentGlob: string, subsetGlob: string): boolean => {
  if (parentGlob === subsetGlob) return true;
  const parentSegs = parseSegments(parentGlob);
  const subsetSegs = parseSegments(subsetGlob);
  if (!parentSegs || !subsetSegs) return false;
  return segmentMatch(parentSegs, subsetSegs, 0, 0);
};

// The static text of a glob, up to its first metacharacter.
export const literalPrefix = (glob: string): string => {
  const index = glob.search(/[*?[{()@+!]/);
  return index === -1 ? glob : glob.slice(0, index);
};
