import { ReactNode, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, FolderOpen, Globe, Rocket, Terminal } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  IconButton,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";
import { useOrganization } from "@app/context";
import {
  PamAccountType,
  TAccessiblePamAccount,
  TPamFieldDescriptor,
  useGetPamAccountById,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { PamDetailSheet } from "../../components/PamDetailSheet";

type Props = {
  account: TAccessiblePamAccount | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

type LaunchMethod = "browser" | "cli";

const formatFieldValue = (value: unknown): ReactNode => {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  const str = String(value);
  if (str.length > 48) return "Provided";
  return <span className="font-mono">{str}</span>;
};

const LaunchTab = ({
  account,
  supportsWebAccess,
  hosts
}: {
  account: TAccessiblePamAccount;
  supportsWebAccess: boolean;
  hosts: string[];
}) => {
  const { currentOrg } = useOrganization();
  const [method, setMethod] = useState<LaunchMethod>(supportsWebAccess ? "browser" : "cli");

  const needsHost = hosts.length > 1;
  const [selectedHost, setSelectedHost] = useState<string | undefined>(
    needsHost ? undefined : hosts[0]
  );
  const hostMissing = needsHost && !selectedHost;

  const cliHost = selectedHost ?? (needsHost ? "<host>" : undefined);
  const cliCommand = `infisical pam access ${account.folderName}/${account.name}${
    cliHost ? ` --target ${cliHost}` : ""
  }`;
  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(cliCommand);
    createNotification({ text: "Command copied to clipboard", type: "success" });
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Launch Session</CardTitle>
          <CardDescription>Choose how to connect to this account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {needsHost && (
            <div>
              <p className="mb-2.5 text-sm font-medium text-foreground">Host</p>
              <Select value={selectedHost ?? ""} onValueChange={setSelectedHost}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a host" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {hosts.map((host) => (
                    <SelectItem key={host} value={host}>
                      {host}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {supportsWebAccess && (
            <div>
              <p className="mb-3 text-sm font-medium text-foreground">Launch method</p>
              <RadioGroup
                value={method}
                onValueChange={(value) => setMethod(value as LaunchMethod)}
                className="grid-cols-2 gap-3"
              >
                <FieldLabel htmlFor="launch-browser" variant="pam">
                  <Field orientation="horizontal" className="items-center gap-3">
                    <Globe className="size-5 shrink-0 text-foreground" />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-foreground">Browser</p>
                      <p className="text-xs text-muted">Connect directly from your browser.</p>
                    </div>
                    <RadioGroupItem id="launch-browser" value="browser" className="sr-only" />
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="launch-cli" variant="pam">
                  <Field orientation="horizontal" className="items-center gap-3">
                    <Terminal className="size-5 shrink-0 text-foreground" />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-foreground">CLI</p>
                      <p className="text-xs text-muted">
                        Use a custom client with the Infisical CLI.
                      </p>
                    </div>
                    <RadioGroupItem id="launch-cli" value="cli" className="sr-only" />
                  </Field>
                </FieldLabel>
              </RadioGroup>
            </div>
          )}

          {method === "browser" && (
            <div>
              <p className="mb-2.5 text-sm text-foreground">Launch browser client</p>
              {hostMissing ? (
                <Button variant="pam" className="w-full" isDisabled>
                  <Rocket className="size-4" />
                  Connect in Browser
                </Button>
              ) : (
                <Button variant="pam" className="w-full" asChild>
                  <Link
                    to="/organizations/$orgId/pam/accounts/$accountType/$accountId/access"
                    params={{
                      orgId: currentOrg.id,
                      accountType: account.accountType,
                      accountId: account.id
                    }}
                    search={{ host: selectedHost }}
                    target="_blank"
                  >
                    <Rocket className="size-4" />
                    Connect in Browser
                  </Link>
                </Button>
              )}
            </div>
          )}

          {method === "cli" && (
            <div>
              <p className="mb-2.5 text-sm text-foreground">Run this command</p>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-container px-4 py-3">
                <code className="font-mono text-sm break-all text-foreground">
                  <span className="text-product-pam">$</span> {cliCommand}
                </code>
                <IconButton
                  variant="ghost"
                  aria-label="Copy command"
                  onClick={handleCopyCommand}
                  className="shrink-0 text-muted hover:text-foreground"
                >
                  <Copy className="size-4" />
                </IconButton>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const LaunchSessionSheet = ({ account, isOpen, onOpenChange }: Props) => {
  const { map } = usePamAccountTypeMap();
  const { data: fullAccount } = useGetPamAccountById(isOpen ? account?.id : undefined);

  if (!account) return null;

  const typeMeta = map[account.accountType as PamAccountType];
  const typeName = typeMeta?.name ?? account.accountType;
  const supportsWebAccess = Boolean(typeMeta?.supportsWebAccess);

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

  const fieldRows = (fields: TPamFieldDescriptor[] | undefined, source: Record<string, unknown>) =>
    (fields ?? [])
      .filter((f) => !f.secret)
      .filter((f) => source[f.key] !== undefined && source[f.key] !== null && source[f.key] !== "")
      .map((f) => ({ label: f.label, value: formatFieldValue(source[f.key]) }));

  const metadata = [
    ...(account.description ? [{ label: "Description", value: account.description }] : []),
    ...fieldRows(typeMeta?.connectionFields, conn),
    ...fieldRows(typeMeta?.credentialFields, credentials)
  ];

  return (
    <PamDetailSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      accountType={account.accountType}
      title={account.name}
      subtitle={subtitle}
      typeBadge={typeName}
      metadata={metadata}
      tabs={[
        {
          value: PamSheetTab.Launch,
          label: "Launch",
          icon: <Rocket className="mr-1.5 size-4" />,
          content: (
            <LaunchTab account={account} supportsWebAccess={supportsWebAccess} hosts={hosts} />
          )
        }
      ]}
    />
  );
};
