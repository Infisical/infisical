import { isIP } from "net";
import RE2 from "re2";

import { isFQDN } from "@app/lib/validator/validate-url";

// Validates usernames or wildcard (*)
export const isValidUserPattern = (value: string): boolean => {
  // Length check before regex to prevent ReDoS
  if (typeof value !== "string") return false;
  if (value.length > 32) return false; // Maximum Linux username length
  if (value === "*") return true; // Handle wildcard separately

  // Simpler, more specific pattern for usernames
  const userRegex = new RE2(/^[a-z_][a-z0-9_-]*$/i);
  return userRegex.test(value);
};

// Validates hostnames, wildcard domains, or IP addresses
export const isValidHostPattern = (value: string): boolean => {
  // Input validation
  if (typeof value !== "string") return false;

  // Length check
  if (value.length > 255) return false;

  // Handle the wildcard case separately
  if (value === "*") return true;

  // Check for IP addresses using Node.js built-in functions
  if (isIP(value)) return true;

  return isFQDN(value, {
    allow_wildcard: true
  });
};
