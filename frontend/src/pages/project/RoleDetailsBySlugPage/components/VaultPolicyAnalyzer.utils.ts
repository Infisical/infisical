import { VaultMount } from "./VaultPolicyImportModal.utils";

export type PolicyBlock = {
  id: string;
  path: string;
  capabilities: string[];
  rawText: string;
  startLine: number;
  endLine: number;
  canTranslate: boolean;
  reason?: string;
};

export type PolicyLine = {
  id: string;
  text: string;
  lineNumber: number;
  type: "comment" | "empty" | "part-of-block" | "other";
  belongsToBlock?: string;
};

const hasTranslatableCapabilities = (capabilities: string[], isMetadataPath: boolean): boolean => {
  if (isMetadataPath) {
    // For metadata/folder paths, only these capabilities create permissions
    return capabilities.some((cap) =>
      ["create", "update", "patch", "delete"].includes(cap.toLowerCase())
    );
  }
  // For data/secret paths, all these capabilities create permissions
  return capabilities.some((cap) =>
    ["create", "list", "read", "update", "patch", "delete"].includes(cap.toLowerCase())
  );
};

const canTranslateBlock = (
  path: string,
  capabilities: string[],
  mounts: VaultMount[]
): { canTranslate: boolean; reason?: string } => {
  if (path === "*" || path === "+") {
    return { canTranslate: true };
  }

  const isWildcardMount = path.startsWith("*/") || path.startsWith("+/");
  if (isWildcardMount) {
    // Check if it's a metadata path
    const isMetadata = path.includes("/metadata/");
    if (!hasTranslatableCapabilities(capabilities, isMetadata)) {
      return {
        canTranslate: false,
        reason: isMetadata
          ? "Cannot translate list/read capabilities for metadata (Infisical only supports translation for create, update, delete)"
          : "No translatable capabilities found"
      };
    }
    return { canTranslate: true };
  }

  const sortedMounts = [...mounts].sort((a, b) => b.path.length - a.path.length);
  const mount = sortedMounts.find((m) => path.startsWith(m.path));

  if (!mount) {
    return {
      canTranslate: false,
      reason: "KV mount path not found in your Vault configuration"
    };
  }

  // Check if it's a KV secret engine
  if (mount.type !== "kv" && mount.type !== "generic") {
    return {
      canTranslate: false,
      reason: `Only KV secret engines are supported (found: ${mount.type})`
    };
  }

  // Check if it's a metadata path and has valid capabilities
  const isKvV2 = mount.version === "2";
  const isMetadata = isKvV2 && path.includes("/metadata/");

  if (!hasTranslatableCapabilities(capabilities, isMetadata)) {
    return {
      canTranslate: false,
      reason: isMetadata
        ? "Cannot translate list/read capabilities for metadata (Infisical only supports translation for create, update, delete)"
        : "No translatable capabilities found"
    };
  }

  return { canTranslate: true };
};

export const analyzeVaultPolicy = (
  hclPolicy: string,
  mounts: VaultMount[]
): {
  blocks: PolicyBlock[];
  lines: PolicyLine[];
  translatableCount: number;
  nonTranslatableCount: number;
} => {
  const blocks: PolicyBlock[] = [];
  const lines: PolicyLine[] = [];
  let blockIdCounter = 0;

  const policyLines = hclPolicy.split("\n");

  // Track which lines belong to which blocks
  const lineToBlockMap = new Map<number, string>();

  // Step 1: Extract all path blocks
  try {
    const pathRegex = /path\s+"([^"]+)"\s*\{[^}]*capabilities\s*=\s*\[([^\]]+)\][^}]*\}/gi;
    let match = pathRegex.exec(hclPolicy);

    while (match !== null) {
      const [fullMatch, path, capabilitiesStr] = match;

      const capabilities = capabilitiesStr
        .split(",")
        .map((c) => c.trim().replace(/["'\s]/g, ""))
        .filter((c) => c.length > 0);

      // Find the line numbers for this block
      const matchIndex = match.index;
      const textBeforeMatch = hclPolicy.substring(0, matchIndex);
      const textIncludingMatch = hclPolicy.substring(0, matchIndex + fullMatch.length);
      const startLine = textBeforeMatch.split("\n").length;
      const endLine = textIncludingMatch.split("\n").length;

      // Determine if this block can be translated
      const { canTranslate, reason } = canTranslateBlock(path, capabilities, mounts);

      const blockId = `block-${blockIdCounter}`;
      blockIdCounter += 1;
      blocks.push({
        id: blockId,
        path,
        capabilities,
        rawText: fullMatch,
        startLine,
        endLine,
        canTranslate,
        reason
      });

      // Mark these lines as belonging to this block
      for (let i = startLine; i <= endLine; i += 1) {
        lineToBlockMap.set(i, blockId);
      }

      match = pathRegex.exec(hclPolicy);
    }
  } catch (err) {
    console.error("Error analyzing HCL policy:", err);
  }

  // Step 2: Process each line
  policyLines.forEach((lineText, index) => {
    const lineNumber = index + 1;
    const trimmedLine = lineText.trim();
    const blockId = lineToBlockMap.get(lineNumber);

    let type: PolicyLine["type"] = "other";
    if (trimmedLine.startsWith("#") || trimmedLine.startsWith("//")) {
      type = "comment";
    } else if (trimmedLine === "") {
      type = "empty";
    } else if (blockId) {
      type = "part-of-block";
    }

    lines.push({
      id: `line-${lineNumber}`,
      text: lineText,
      lineNumber,
      type,
      belongsToBlock: blockId
    });
  });

  const translatableCount = blocks.filter((b) => b.canTranslate).length;
  const nonTranslatableCount = blocks.filter((b) => !b.canTranslate).length;

  return {
    blocks,
    lines,
    translatableCount,
    nonTranslatableCount
  };
};
