import RE2 from "re2";
import { z } from "zod";

// Namespaces are RFC 1123 labels; service account names are RFC 1123 subdomains, which also
// permit dots. Bounding the character set keeps an entry from matching more than it looks like it
// does once it reaches picomatch.
const namespaceEntry = new RE2("^[a-z0-9*]([a-z0-9*-]{0,61}[a-z0-9*])?$");
const nameEntry = new RE2("^[a-z0-9*]([a-z0-9*.-]{0,251}[a-z0-9*])?$");

const csvOf = (pattern: RE2, field: string, max: number, allowed: string) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) =>
        value
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
          .every((entry) => pattern.test(entry)),
      { message: `${field} must be a comma-separated list of ${allowed}, optionally containing "*" wildcards` }
    );

export const validateAllowedNamespaces = csvOf(
  namespaceEntry,
  "Allowed namespaces",
  1024,
  "lowercase Kubernetes namespace names"
);

export const validateAllowedNames = csvOf(
  nameEntry,
  "Allowed service account names",
  1024,
  "lowercase Kubernetes service account names"
);
