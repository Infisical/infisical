export const REGEX_SECRET_REFERENCE_FIND = /(\${([^}]*)})/g;
export const REGEX_SECRET_REFERENCE_INVALID = /(?:\/|\\|\n|\.$|^\.)/;

export function isValidSecretReferenceValue(str: string): boolean {
  try {
    if (!str) return true;
    let skipNext = false;
    str.split(REGEX_SECRET_REFERENCE_FIND).flatMap((el) => {
      if (skipNext) {
        skipNext = false;
        return [];
      }

      const isInterpolationSyntax = el.startsWith("${") && el.endsWith("}");
      if (!isInterpolationSyntax) return [];

      skipNext = true;
      if (REGEX_SECRET_REFERENCE_INVALID.test(el.slice(2, -1)))
        throw new Error("Invalid reference");

      return el;
    });
    return true;
  } catch (e) {
    return false;
  }
}
