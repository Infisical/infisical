import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { FolderOpen, Globe, Rocket, Terminal } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TAccessiblePamAccount, usePamAccountTypeMap } from "@app/hooks/api/pam";

import { PamDetailSheet } from "../../components/PamDetailSheet";

type Props = {
  account: TAccessiblePamAccount | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const LaunchTab = ({ account }: { account: TAccessiblePamAccount }) => {
  const { currentOrg } = useOrganization();
  const [method, setMethod] = useState("browser");

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Launch Session</CardTitle>
          <CardDescription>Choose how to connect to this account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div>
            <p className="mb-3 text-sm font-medium text-foreground">Launch method</p>
            <RadioGroup value={method} onValueChange={setMethod} className="grid-cols-2 gap-3">
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
                <Field orientation="horizontal" className="relative items-center gap-3">
                  <Terminal className="size-5 shrink-0 text-foreground" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">CLI</p>
                    <p className="text-xs text-muted">
                      Use a custom client with the Infisical CLI.
                    </p>
                  </div>
                  <Badge variant="warning" className="absolute top-2 right-2">
                    Coming soon
                  </Badge>
                  <RadioGroupItem id="launch-cli" value="cli" disabled className="sr-only" />
                </Field>
              </FieldLabel>
            </RadioGroup>
          </div>

          <div>
            <p className="mb-2.5 text-sm text-foreground">Launch browser client</p>
            <Button variant="pam" className="w-full" asChild>
              <Link
                to="/organizations/$orgId/pam/accounts/$accountType/$accountId/access"
                params={{
                  orgId: currentOrg.id,
                  accountType: account.accountType,
                  accountId: account.id
                }}
                target="_blank"
              >
                <Rocket className="size-4" />
                Connect in Browser
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const LaunchSessionSheet = ({ account, isOpen, onOpenChange }: Props) => {
  const { map } = usePamAccountTypeMap();

  if (!account) return null;

  const typeName = map[account.accountType]?.name ?? account.accountType;

  const subtitle = account.folderName ? (
    <span className="flex items-center gap-1.5">
      <FolderOpen className="size-3.5" />
      {account.folderName}
    </span>
  ) : undefined;

  const metadata = account.description
    ? [{ label: "Description", value: account.description }]
    : [];

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
          value: "launch",
          label: "Launch",
          icon: <Rocket className="mr-1.5 size-4" />,
          content: <LaunchTab account={account} />
        }
      ]}
    />
  );
};
