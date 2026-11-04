import { AxiosError } from "axios";

import { Skeleton } from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetSecretReferenceTree } from "@app/hooks/api";
import { TSecretReferenceTraceNode } from "@app/hooks/api/secrets/types";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

const REFERENCE_REGEX = /\${([@a-zA-Z0-9-_. ]+)}/g;

const normalizePath = (secretPath: string) => `/${secretPath.split("/").filter(Boolean).join("/")}`;

const findReferencedNode = (parent: TSecretReferenceTraceNode, reference: string) => {
  const parts = reference.slice(2, -1).trim().split(".");
  const key = parts[parts.length - 1];
  let location = {
    projectSlug: undefined as string | undefined,
    environment: parts[0],
    secretPath: parts.slice(1, -1).join("/")
  };
  if (parts[0]?.startsWith("@")) {
    location = {
      projectSlug: parts[0].slice(1),
      environment: parts[1],
      secretPath: parts.slice(2, -1).join("/")
    };
  } else if (parts.length === 1) {
    location = { ...location, environment: parent.environment, secretPath: parent.secretPath };
  }

  return parent.children.find(
    (child) =>
      child.key === key &&
      child.environment === location.environment &&
      normalizePath(child.secretPath) === normalizePath(location.secretPath) &&
      child.projectSlug === location.projectSlug
  );
};

const resolveNodeValue = (node: TSecretReferenceTraceNode): string =>
  (node.value ?? "").replace(REFERENCE_REGEX, (reference) => {
    const child = findReferencedNode(node, reference);
    return child && child.exists !== false ? resolveNodeValue(child) : reference;
  });

type Props = {
  environment: string;
  secretPath: string;
  secretKey: string;
  reference: string;
};

export const ResolvedReferenceTooltipContent = ({
  environment,
  secretPath,
  secretKey,
  reference
}: Props) => {
  const { currentProject } = useProject();
  const { data, isPending, isError, error } = useGetSecretReferenceTree({
    secretPath,
    environmentSlug: environment,
    projectId: currentProject?.id || "",
    secretKey
  });

  if (isPending) return <Skeleton className="h-4 w-32" />;

  if (isError) {
    const apiError = (error instanceof AxiosError ? error.response?.data : undefined) as
      | TApiErrors
      | undefined;
    return apiError?.error === ApiErrorTypes.CustomForbiddenError
      ? "You do not have permission to view this referenced secret."
      : "Failed to resolve this reference.";
  }

  const node = findReferencedNode(data.tree, reference);
  if (!node || node.exists === false) return "Referenced secret not found.";

  const value = resolveNodeValue(node);
  if (!value) return <span className="text-muted">EMPTY</span>;

  return <p className="line-clamp-6 font-mono break-all whitespace-pre-wrap">{value}</p>;
};
