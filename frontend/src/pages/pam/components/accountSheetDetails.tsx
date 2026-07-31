import { ReactNode } from "react";
import { FolderOpen } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import {
  PamAccountType,
  PamFieldWidget,
  TAccessiblePamAccount,
  TPamFieldDescriptor,
  useGetPamAccountById,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";

const formatFieldValue = (field: TPamFieldDescriptor, value: unknown): ReactNode => {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (field.widget === PamFieldWidget.Textarea) {
    return <Badge variant="success">Configured</Badge>;
  }
  const str = String(value);
  if (str.length > 48) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block max-w-full cursor-default overflow-hidden font-mono text-ellipsis !whitespace-nowrap">
            {str}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs font-mono break-all">{str}</TooltipContent>
      </Tooltip>
    );
  }
  return <span className="font-mono">{str}</span>;
};

const fieldRows = (fields: TPamFieldDescriptor[] | undefined, source: Record<string, unknown>) =>
  (fields ?? [])
    .filter((f) => !f.secret)
    .filter((f) => source[f.key] !== undefined && source[f.key] !== null && source[f.key] !== "")
    .map((f) => ({ label: f.label, value: formatFieldValue(f, source[f.key]) }));

// Shared sidebar content for the account sheets on the access page: the same non-secret
// connection/credential details show whether the user is launching or requesting access.
export const useAccountSheetDetails = (account: TAccessiblePamAccount | null, isOpen: boolean) => {
  const { map } = usePamAccountTypeMap();
  const { data: fullAccount } = useGetPamAccountById(isOpen ? account?.id : undefined);

  if (!account) {
    return {
      typeMeta: undefined,
      typeName: undefined,
      subtitle: undefined,
      metadata: [],
      hosts: []
    };
  }

  const typeMeta = map[account.accountType as PamAccountType];
  const typeName = typeMeta?.name ?? account.accountType;

  const subtitle = account.folderName ? (
    <span className="flex items-center gap-1.5">
      <FolderOpen className="size-3.5" />
      {account.folderName}
    </span>
  ) : undefined;

  const conn = (fullAccount?.connectionDetails ?? {}) as Record<string, unknown>;
  const credentials = (fullAccount?.credentials ?? {}) as Record<string, unknown>;

  const hosts =
    account.accountType === PamAccountType.WindowsAd && Array.isArray(conn.hosts)
      ? (conn.hosts as unknown[]).filter((host): host is string => typeof host === "string")
      : [];

  const metadata = [
    ...(account.description ? [{ label: "Description", value: account.description }] : []),
    ...fieldRows(typeMeta?.connectionFields, conn),
    ...fieldRows(typeMeta?.credentialFields, credentials)
  ];

  return { typeMeta, typeName, subtitle, metadata, hosts };
};
