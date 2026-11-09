export const OAUTH_CLIENT_ID = "infisical-mobile";

export const OAUTH_SCOPE = "approvals:review";

export const OAUTH_REDIRECT_URI = "com.infisical.mobile:/oauth";

export const DEFAULT_INSTANCE_URL = "https://app.infisical.com";

const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export const normalizeInstanceUrl = (input: string): { url: string } | { error: string } => {
  const value = input.trim();
  if (!value) return { error: "Enter the address of your Infisical instance." };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i.exec(withScheme);
  if (!match) return { error: "That doesn't look like a web address. Try something like infisical.example.com." };
  const scheme = match[1].toLowerCase();
  if (scheme === "http") return { error: "The app only connects over https. Use the https:// address of your instance." };
  if (scheme !== "https") return { error: "Use an https:// address, like https://infisical.example.com." };
  const authority = match[2];
  if (authority.includes("@")) return { error: "Leave the username and password out of the address." };
  const hostMatch = /^([^:]+)(?::(\d{1,5}))?$/.exec(authority);
  const host = hostMatch?.[1].toLowerCase();
  if (!host || !HOST_PATTERN.test(host) || !host.includes(".") && host !== "localhost") {
    return { error: "That address has no valid host name. Try something like infisical.example.com." };
  }
  const port = hostMatch?.[2];
  if (port && (Number(port) < 1 || Number(port) > 65535)) return { error: "The port in that address isn't valid." };
  return { url: `https://${host}${port && port !== "443" ? `:${port}` : ""}` };
};

export const hostOf = (instanceUrl: string) => instanceUrl.replace(/^https:\/\//, "");
