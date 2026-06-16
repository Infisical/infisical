import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, FolderOpen, Globe, Rocket, Terminal } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Badge, Button, IconButton } from "@app/components/v3";
import { Sheet, SheetContent } from "@app/components/v3/generic/Sheet";
import { useOrganization } from "@app/context";
import { PAM_ACCOUNT_TYPE_MAP, TAccessiblePamAccount } from "@app/hooks/api/pam";

import { AccountPlatformIcon } from "./AccountPlatformIcon";

enum LaunchMethod {
  Browser = "browser",
  CLI = "cli"
}

type Props = {
  account: TAccessiblePamAccount | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const LaunchSessionSheet = ({ account, isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const [launchMethod, setLaunchMethod] = useState<LaunchMethod>(LaunchMethod.Browser);

  if (!account) return null;

  const typeName = PAM_ACCOUNT_TYPE_MAP[account.accountType]?.name ?? account.accountType;
  const cliCommand = `infisical pam access ${account.folderName}/${account.name}`;

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(cliCommand);
    createNotification({
      text: "Command copied to clipboard",
      type: "success"
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full !max-w-5xl flex-row gap-0 p-0" side="right">
        <div className="flex w-[280px] shrink-0 flex-col border-r border-border bg-mineshaft-700/30 p-6">
          <div className="mb-3 flex size-14 items-center justify-center rounded-md border border-border bg-mineshaft-800 p-2.5">
            <AccountPlatformIcon accountType={account.accountType} size={32} />
          </div>
          <h3 className="text-base font-semibold text-foreground">{account.name}</h3>
          {account.folderName && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <FolderOpen className="size-3" />
              {account.folderName}
            </p>
          )}
          <Badge variant="pam" className="mt-2.5 w-fit">
            {typeName}
          </Badge>
          <div className="mt-4 border-t border-border pt-4">
            {account.description && (
              <div>
                <p className="text-xs text-muted">Description</p>
                <p className="mt-0.5 text-sm text-foreground">{account.description}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex-1 p-6">
            <p className="mb-3 text-sm font-medium text-foreground">Launch method</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setLaunchMethod(LaunchMethod.Browser)}
                className={`flex flex-1 cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors ${
                  launchMethod === LaunchMethod.Browser
                    ? "border-product-pam/40 bg-product-pam/5"
                    : "hover:border-muted-foreground/30 border-border"
                }`}
              >
                <Globe className="mt-0.5 size-5 shrink-0 text-foreground" />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Browser</p>
                  <p className="text-xs text-muted">Connect directly from your browser.</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setLaunchMethod(LaunchMethod.CLI)}
                className={`flex flex-1 cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors ${
                  launchMethod === LaunchMethod.CLI
                    ? "border-product-pam/40 bg-product-pam/5"
                    : "hover:border-muted-foreground/30 border-border"
                }`}
              >
                <Terminal className="mt-0.5 size-5 shrink-0 text-foreground" />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">CLI</p>
                  <p className="text-xs text-muted">Use a custom client with the Infisical CLI.</p>
                </div>
              </button>
            </div>

            {launchMethod === LaunchMethod.Browser && (
              <>
                <p className="mt-5 mb-2.5 text-sm text-foreground">Launch browser client</p>
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
              </>
            )}

            {launchMethod === LaunchMethod.CLI && (
              <>
                <p className="mt-5 mb-2.5 text-sm text-foreground">Run this command</p>
                <div className="flex items-center justify-between rounded-md border border-border bg-mineshaft-800 px-4 py-3">
                  <code className="font-mono text-sm text-muted">
                    <span className="text-product-pam">$</span> {cliCommand}
                  </code>
                  <IconButton
                    variant="ghost"
                    aria-label="Copy command"
                    onClick={handleCopyCommand}
                    className="text-muted hover:text-foreground"
                  >
                    <Copy className="size-4" />
                  </IconButton>
                </div>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
