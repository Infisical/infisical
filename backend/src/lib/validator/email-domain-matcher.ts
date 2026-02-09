/**
 * Checks if an email's domain matches the allowed domains configuration.
 * Supports exact domains (e.g. "example.com") and wildcard patterns (e.g. "*.example.com", "*.infisical").
 *
 * Wildcard patterns match:
 * - The root domain: user@acme.com matches *.acme.com
 * - Any subdomain: user@team.acme.com matches *.acme.com
 * - Multi-level subdomains: user@sub.team.acme.com matches *.acme.com
 * - Parent domains: *.infisical matches user@infisical.com, user@team.infisical.com
 *
 * Matching is case-insensitive (email domains are case-insensitive per RFC 5321).
 */
export const matchesAllowedEmailDomain = (email: string, allowedDomainsConfig: string): boolean => {
  if (!allowedDomainsConfig?.trim()) {
    return true;
  }

  const emailParts = email.split("@");
  if (emailParts.length !== 2 || !emailParts[1]?.trim()) {
    return false;
  }

  const emailDomain = emailParts[1].trim().toLowerCase();
  const patterns = allowedDomainsConfig
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const pattern of patterns) {
    const patternLower = pattern.toLowerCase();

    if (patternLower.startsWith("*.")) {
      // Wildcard: *.suffix - matches suffix as a domain label (e.g. *.infisical matches infisical.com, team.infisical.com)
      const suffix = patternLower.slice(2).trim(); // everything after "*."
      if (
        suffix &&
        (emailDomain === suffix ||
          emailDomain.endsWith(`.${suffix}`) ||
          emailDomain.startsWith(`${suffix}.`) ||
          emailDomain.includes(`.${suffix}.`))
      ) {
        return true;
      }
    } else if (emailDomain === patternLower) {
      return true;
    }
  }

  return false;
};
