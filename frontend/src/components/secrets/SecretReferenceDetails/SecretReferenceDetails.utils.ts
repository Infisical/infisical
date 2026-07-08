import { TSecretDependencyTreeNode, TSecretReferenceTraceNode } from "@app/hooks/api/types";

export type SecretReferenceListEntry = {
  key: string;
  secretPath: string;
  environments: string[];
  isDraft?: boolean;
};

const SECRET_REFERENCE_REG = /\${([^}]+)}/g;

export const formatReferenceEnvironmentList = (environments: string[]) => {
  const uniqueEnvironments = [...new Set(environments.filter(Boolean))];
  const environmentList = uniqueEnvironments.join(", ");

  if (uniqueEnvironments.length > 3 || environmentList.length > 18) {
    return String(uniqueEnvironments.length);
  }

  return environmentList;
};

export const parseSecretReferenceValue = (value: string) => {
  const parts: { type: "text" | "reference"; value: string }[] = [];
  let lastIndex = 0;

  value.replace(SECRET_REFERENCE_REG, (match, reference: string, offset: number) => {
    if (offset > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, offset) });
    }

    parts.push({ type: "reference", value: reference });
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: "text" as const, value }];
};

export const getIngestedSecretReferences = (
  tree?: TSecretReferenceTraceNode
): SecretReferenceListEntry[] => {
  if (!tree?.children?.length) return [];

  return tree.children.map((child) => ({
    key: child.key,
    secretPath: child.secretPath,
    environments: [child.environment]
  }));
};

const getReferenceSecretPath = (segments: string[], fallbackPath: string) => {
  if (!segments.length) return fallbackPath;
  return `/${segments.join("/")}`;
};

export const getDraftIngestedSecretReferences = ({
  value,
  environment,
  secretPath
}: {
  value: string;
  environment: string;
  secretPath: string;
}): SecretReferenceListEntry[] => {
  const entries = new Map<string, SecretReferenceListEntry>();

  parseSecretReferenceValue(value).forEach((part) => {
    if (part.type !== "reference") return;

    const segments = part.value.split(".").filter(Boolean);
    if (!segments.length) return;

    const isCrossProjectReference = segments[0].startsWith("@");
    const secretKey = segments[segments.length - 1];
    let referenceEnvironment = environment;
    let pathSegments: string[] = [];

    if (isCrossProjectReference) {
      referenceEnvironment = segments[1] || environment;
      pathSegments = segments.slice(2, -1);
    } else if (segments.length > 1) {
      [referenceEnvironment] = segments;
      pathSegments = segments.slice(1, -1);
    }

    const referencePath = getReferenceSecretPath(
      pathSegments,
      segments.length === 1 ? secretPath : "/"
    );
    const entryKey = `${referencePath}:${secretKey}`;
    const existing = entries.get(entryKey);

    if (existing) {
      existing.environments = [...new Set([...existing.environments, referenceEnvironment])];
      return;
    }

    entries.set(entryKey, {
      key: secretKey,
      secretPath: referencePath,
      environments: [referenceEnvironment],
      isDraft: true
    });
  });

  return [...entries.values()];
};

const addDependencyEntry = (
  entries: Map<string, SecretReferenceListEntry>,
  node: TSecretDependencyTreeNode
) => {
  const entryKey = `${node.secretPath}:${node.key}`;
  const existing = entries.get(entryKey);

  if (existing) {
    existing.environments = [...new Set([...existing.environments, node.environment])];
    return;
  }

  entries.set(entryKey, {
    key: node.key,
    secretPath: node.secretPath,
    environments: [node.environment]
  });
};

export const getUsedBySecretReferences = (
  tree?: TSecretDependencyTreeNode
): SecretReferenceListEntry[] => {
  if (!tree?.children?.length) return [];

  const entries = new Map<string, SecretReferenceListEntry>();
  const visit = (node: TSecretDependencyTreeNode) => {
    addDependencyEntry(entries, node);
    node.children?.forEach(visit);
  };

  tree.children.forEach(visit);
  return [...entries.values()];
};
