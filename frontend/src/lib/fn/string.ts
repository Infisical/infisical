import { ReservedFolders } from "@app/hooks/api/secretFolders/types";

export const formatReservedPaths = (secretPath: string) => {
  const i = secretPath.indexOf(ReservedFolders.SecretReplication);
  if (i !== -1) {
    return `${secretPath.slice(0, i)} - (replication)`;
  }
  return secretPath;
};

export const parsePathFromReplicatedPath = (secretPath: string) => {
  const i = secretPath.indexOf(ReservedFolders.SecretReplication);
  return secretPath.slice(0, i);
};

export const camelCaseToSpaces = (input: string) => {
  return input.replace(/([a-z])([A-Z])/g, "$1 $2");
};

export const toTitleCase = (str: string) => {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const formatSessionUserAgent = (userAgent: string) => {
  const result = {
    os: "Unknown",
    browser: "Unknown",
    device: "Desktop"
  };

  // Operating System detection
  if (userAgent.includes("Windows")) {
    result.os = "Windows";
  } else if (
    userAgent.includes("Mac OS") ||
    userAgent.includes("Macintosh") ||
    userAgent.includes("macOS")
  ) {
    result.os = "macOS";
  } else if (userAgent.includes("Linux") && !userAgent.includes("Android")) {
    result.os = "Linux";
  } else if (userAgent.includes("Android")) {
    result.os = "Android";
    result.device = "Mobile";
  } else if (
    userAgent.includes("iOS") ||
    userAgent.includes("iPhone") ||
    userAgent.includes("iPad")
  ) {
    result.os = "iOS";
    result.device = userAgent.includes("iPad") ? "Tablet" : "Mobile";
  }

  // Browser detection
  if (userAgent.includes("Firefox/")) {
    result.browser = "Firefox";
  } else if (userAgent.includes("Edge/") || userAgent.includes("Edg/")) {
    result.browser = "Edge";
  } else if (userAgent.includes("Brave/") || userAgent.includes("Brave ")) {
    result.browser = "Brave";
  } else if (
    userAgent.includes("Chrome/") &&
    !userAgent.includes("Chromium/") &&
    !userAgent.includes("Edg/")
  ) {
    result.browser = "Chrome";
  } else if (
    userAgent.includes("Safari/") &&
    !userAgent.includes("Chrome/") &&
    !userAgent.includes("Chromium/")
  ) {
    result.browser = "Safari";
  } else if (userAgent.includes("Opera/") || userAgent.includes("OPR/")) {
    result.browser = "Opera";
  } else if (userAgent.includes("Trident/") || userAgent.includes("MSIE")) {
    result.browser = "Internet Explorer";
  }

  if (userAgent.toLowerCase() === "cli") {
    result.browser = "CLI";
  }

  return result;
};
