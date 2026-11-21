import { isValidIpOrCidr } from "@app/helpers/ip";

export const splitList = (value?: string | null) => {
  const entries: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of value ?? "") {
    if (char === "," && depth === 0) {
      entries.push(current);
      current = "";
    } else {
      if (char === "{") depth += 1;
      else if (char === "}" && depth > 0) depth -= 1;
      current += char;
    }
  }
  entries.push(current);
  return entries.map((entry) => entry.trim()).filter(Boolean);
};

export const ipTagError = (tag: string) =>
  isValidIpOrCidr(tag) ? undefined : "Enter a valid IPv4, IPv6, or CIDR block";
