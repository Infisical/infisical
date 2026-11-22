import { AxiosError } from "axios";

import { Skeleton } from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetExpandedSecretValue } from "@app/hooks/api";

type Props = {
  environment: string;
  secretPath: string;
  secretKey: string;
};

const ResolvedReferenceValue = ({ environment, secretPath, secretKey }: Props) => {
  const { currentProject } = useProject();
  const { data, isPending, isError, error } = useGetExpandedSecretValue({
    projectId: currentProject?.id || "",
    environment,
    secretPath,
    secretKey
  });

  if (isPending) return <Skeleton className="h-4 w-32" />;

  if (isError) {
    const status = error instanceof AxiosError ? error.response?.status : undefined;
    if (status === 404) return "Referenced secret not found.";
    if (status === 403) return "You do not have permission to view this referenced secret.";
    return "Failed to resolve this reference.";
  }

  if (data.secretValueHidden) return "You do not have permission to view this referenced secret.";
  if (!data.secretValue) return <span className="text-muted">EMPTY</span>;

  return <p className="line-clamp-6 font-mono break-all whitespace-pre-wrap">{data.secretValue}</p>;
};

export const ResolvedReferenceTooltipContent = ({
  environment,
  secretPath,
  reference
}: Omit<Props, "secretKey"> & { reference: string }) => {
  if (!/^\$\{[a-zA-Z0-9-_.@]+(?: +[a-zA-Z0-9-_@]+)*\}$/.test(reference)) {
    return "Not a valid reference, so it stays as written.";
  }

  const parts = reference.slice(2, -1).split(".");
  if (parts[0]?.startsWith("@")) return "Cross-project references can't be previewed here.";

  const secretKey = parts[parts.length - 1];
  if (parts.length === 1) {
    return (
      <ResolvedReferenceValue
        environment={environment}
        secretPath={secretPath}
        secretKey={secretKey}
      />
    );
  }

  return (
    <ResolvedReferenceValue
      environment={parts[0]}
      secretPath={`/${parts.slice(1, -1).join("/")}`}
      secretKey={secretKey}
    />
  );
};
