import picomatch from "picomatch";

/**
 * Glob set-containment for permission boundary checks: answers "is every string matched by
 * `subsetGlob` also matched by `parentGlob`?".
 *
 * `picomatch.isMatch(subsetGlob, parentGlob)` treats the subset as a literal
 * value, so `/apps/**` appears to be a subset of `/apps/*` (the two chars `**` match `*`). This
 * module instead compares segment sequences (literal, `*`, `**`) with proper containment semantics.
 * Patterns with intra-segment wildcards (`foo*`, `?`, `[…]`, `{…}`) fall back to picomatch.
 */

type Segment = { type: "literal"; value: string } | { type: "star" } | { type: "globstar" };

const SEGMENT_METACHARACTER = /[*?[\]{}!()]/;

const parseSegments = (glob: string): Segment[] | null => {
  const parts = glob.split("/");
  const segments: Segment[] = [];
  for (const part of parts) {
    if (part === "") {
      segments.push({ type: "literal", value: "" });
    } else if (part === "*") {
      segments.push({ type: "star" });
    } else if (part === "**") {
      segments.push({ type: "globstar" });
    } else if (SEGMENT_METACHARACTER.test(part)) {
      // Intra-segment wildcards or other glob features (e.g. `foo*`, `*foo`, `[abc]`, `{a,b}`).
      // Signal the caller to fall back rather than guessing about containment.
      return null;
    } else {
      segments.push({ type: "literal", value: part });
    }
  }
  return segments;
};

const segmentMatch = (parent: Segment[], subset: Segment[], pi: number, si: number): boolean => {
  if (pi >= parent.length && si >= subset.length) return true;

  // A globstar in parent can consume zero or more subset segments — try both branches.
  if (pi < parent.length && parent[pi].type === "globstar") {
    if (segmentMatch(parent, subset, pi + 1, si)) return true;
    if (si < subset.length) return segmentMatch(parent, subset, pi, si + 1);
    return false;
  }

  // Parent exhausted but subset has more segments — parent cannot match those longer strings.
  if (pi >= parent.length) return false;

  // Subset exhausted but parent has more — only valid if every remaining parent segment is `**`
  // (each can consume zero subset segments).
  if (si >= subset.length) {
    for (let i = pi; i < parent.length; i += 1) {
      if (parent[i].type !== "globstar") return false;
    }
    return true;
  }

  const pSeg = parent[pi];
  const sSeg = subset[si];

  if (pSeg.type === "star") {
    // `*` matches a single segment of any literal/star content, but not a globstar (which spans
    // multiple segments and is therefore broader than `*`).
    if (sSeg.type === "globstar") return false;
    return segmentMatch(parent, subset, pi + 1, si + 1);
  }

  if (pSeg.type === "literal") {
    // A literal segment in parent must be matched by an identical literal segment in subset; any
    // wildcard in subset would make subset broader than parent.
    if (sSeg.type !== "literal") return false;
    if (sSeg.value !== pSeg.value) return false;
    return segmentMatch(parent, subset, pi + 1, si + 1);
  }

  return false;
};

/**
 * Returns true if every string matched by `subsetGlob` is also matched by `parentGlob`.
 *
 * Analyzes globs whose segments are literals, `*`, or `**`. For globs with other features
 * (intra-segment wildcards, character classes, brace expansion), falls back to
 * `picomatch.isMatch(subsetGlob, parentGlob)` — preserving the previous
 * behavior so this change does not affect rules that rely on those patterns.
 */
export const isGlobSubsetOfGlob = (parentGlob: string, subsetGlob: string): boolean => {
  if (parentGlob === subsetGlob) return true;
  const parentSegs = parseSegments(parentGlob);
  const subsetSegs = parseSegments(subsetGlob);
  if (parentSegs && subsetSegs) {
    return segmentMatch(parentSegs, subsetSegs, 0, 0);
  }
  return picomatch.isMatch(subsetGlob, parentGlob, { strictSlashes: false });
};

/**
 * Returns the static text of a glob — the prefix up to (but not including) the first glob
 * metacharacter. Used by callers that need a sound disjointness heuristic for two globs.
 */
export const literalPrefix = (glob: string): string => {
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" || c === "?" || c === "[" || c === "{") return glob.slice(0, i);
  }
  return glob;
};

/**
 * Returns true if the literal prefixes of two globs definitively prove the patterns share no
 * matches. This is sound but conservative: returns true only when neither prefix is a prefix of
 * the other (so no string can begin with both), and false otherwise — including cases where the
 * patterns may or may not actually overlap.
 */
export const haveDisjointLiteralPrefixes = (a: string, b: string): boolean => {
  const pa = literalPrefix(a);
  const pb = literalPrefix(b);
  return !pa.startsWith(pb) && !pb.startsWith(pa);
};
