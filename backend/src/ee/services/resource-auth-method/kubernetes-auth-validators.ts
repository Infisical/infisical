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

// Normalises the host to a canonical `https://host[:port]` and rejects anything that is not a bare
// API server address. The scheme is matched case-insensitively: "HTTPS://x" used to be accepted and
// then mangled into "https://HTTPS://x", and "HTTP://x" slipped past an https-only check.
export const validateKubernetesHost = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .transform((raw, ctx) => {
    const reject = (message: string) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    };

    const lowered = raw.toLowerCase();
    // Any scheme other than https is reported as such, rather than falling through and being
    // reported as a path problem once https:// is prepended to it.
    if (lowered.includes("://") && !lowered.startsWith("https://")) {
      return reject("Kubernetes host must use https");
    }
    const hasScheme = lowered.startsWith("https://");

    let url: URL;
    try {
      url = new URL(hasScheme ? raw : `https://${raw}`);
    } catch {
      return reject("Kubernetes host must be a valid URL, for example https://my-cluster.example.com:6443");
    }

    if (url.protocol.toLowerCase() !== "https:") {
      return reject("Kubernetes host must use https");
    }
    if (url.username || url.password) {
      return reject("Kubernetes host must not include credentials");
    }
    if (url.pathname !== "/" || url.search || url.hash) {
      return reject(
        "Kubernetes host must be the API server address only, with no path, for example https://my-cluster.example.com:6443"
      );
    }

    return `https://${url.host}`;
  });
