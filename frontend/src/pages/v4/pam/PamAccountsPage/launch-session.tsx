import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Link, useParams } from "@tanstack/react-router";

import type { TPamAccount } from "@app/hooks/api/pam";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";
import { accountHosts, browserUnavailableReason, cliLaunchCommand } from "./launch-command";
import { AccessSheetTitle, AccountOverview } from "./request-access";

type LaunchMethod = "browser" | "cli";

export const CliCommand = ({
  account,
  host
}: {
  account: { name: string; folderName: string | null };
  host?: string;
}) => (
  <Field label="Command">
    <Snippet
      label="Command"
      copyLabel="Copy command"
      prompt="$"
      maxLines={6}
      value={cliLaunchCommand(account, host)}
    />
  </Field>
);

const MethodPicker = ({
  method,
  browserReason,
  onChange
}: {
  method: LaunchMethod;
  browserReason?: string;
  onChange: (method: LaunchMethod) => void;
}) => (
  <RadioGroup
    aria-label="Launch method"
    columns={2}
    value={method}
    onValueChange={(value) => onChange(value as LaunchMethod)}
  >
    <RadioGroupCard
      value="browser"
      title="Browser"
      media={<Icon name="globe" />}
      description={browserReason}
      disabled={Boolean(browserReason)}
    />
    <RadioGroupCard value="cli" title="CLI" media={<Icon name="terminal" />} />
  </RadioGroup>
);

const useBrowserSupport = (account: TPamAccount) => {
  const { data: accountTypes = [], isPending, error } = useV4Adapter("pam").useAccountTypes();
  const meta = accountTypes.find(({ type }) => type === account.accountType);
  if (!meta && isPending) return { meta, browserReason: "Checking browser support" };
  return { meta, browserReason: browserUnavailableReason(meta, account, Boolean(error)) };
};

const LaunchSession = ({ account }: { account: TPamAccount }) => {
  const go = useGo();
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const { meta, browserReason } = useBrowserSupport(account);
  const [picked, setPicked] = useState<LaunchMethod>("browser");
  const method: LaunchMethod = browserReason ? "cli" : picked;
  const hosts = accountHosts(account);
  const [pickedHost, setPickedHost] = useState("");
  const host = hosts.length > 1 ? pickedHost || undefined : hosts[0];
  const hostMissing = hosts.length > 1 && !host;

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          <AccessSheetTitle account={account} meta={meta} />
        </SheetTitle>
        {account.folderName && <SheetDescription>{account.folderName}</SheetDescription>}
      </SheetHeader>
      <SheetBody>
        <Stack gap={24}>
          <AccountOverview account={account} meta={meta} />
          <MethodPicker method={method} browserReason={browserReason} onChange={setPicked} />
          {hosts.length > 1 && (
            <Field label="Host">
              <Select
                aria-label="Host"
                placeholder="Choose a host"
                options={hosts.map((value) => ({ value, label: value }))}
                value={pickedHost}
                onValueChange={setPickedHost}
              />
            </Field>
          )}
          {method === "cli" && (
            <CliCommand account={account} host={hosts.length > 1 ? (host ?? "HOST") : host} />
          )}
        </Stack>
      </SheetBody>
      {method === "browser" && (
        <SheetFooter>
          <Inline justify="end">
            {hostMissing ? (
              <Button disabledReason="Choose a host first">Open in new tab</Button>
            ) : (
              <Button asChild>
                <Link
                  {...go.link(
                    orgHref(
                      orgId,
                      `/pam/accounts/${account.accountType}/${account.id}/access${
                        host ? `?host=${encodeURIComponent(host)}` : ""
                      }`
                    )
                  )}
                  target="_blank"
                  rel="noopener"
                >
                  Open in new tab
                </Link>
              </Button>
            )}
          </Inline>
        </SheetFooter>
      )}
    </>
  );
};

const LaunchSessionContent = ({ accountId }: { accountId: string }) => {
  const { data: account, isPending } = useV4Adapter("pam").useAccount(accountId);
  if (account) return <LaunchSession account={account} />;
  return (
    <>
      <SheetHeader>
        <SheetTitle>{isPending ? "Loading account" : "Account not found"}</SheetTitle>
      </SheetHeader>
      <SheetBody>{isPending && <Skeleton height={96} />}</SheetBody>
    </>
  );
};

export const LaunchSessionSheet = ({
  accountId,
  onOpenChange
}: {
  accountId?: string;
  onOpenChange: (open: boolean) => void;
}) => (
  <Sheet open={Boolean(accountId)} onOpenChange={onOpenChange}>
    <SheetContent size="md">
      {accountId && <LaunchSessionContent key={accountId} accountId={accountId} />}
    </SheetContent>
  </Sheet>
);
