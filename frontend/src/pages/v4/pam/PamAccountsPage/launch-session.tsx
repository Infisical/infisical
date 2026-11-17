import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline } from "@infisical/cipher/ui/layout";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { Select } from "@infisical/cipher/ui/select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Meta } from "@infisical/cipher/ui/text";
import { useParams } from "@tanstack/react-router";

import type { TPamAccount, TPamAccountTypeMetadata } from "@app/hooks/api/pam";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo } from "../../links";
import { accountHosts, browserUnavailableReason, cliLaunchCommand } from "./launch-command";

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

const LaunchHeader = ({
  account,
  meta
}: {
  account: TPamAccount;
  meta?: TPamAccountTypeMetadata;
}) => (
  <DialogHeader>
    <DialogTitle>
      <Inline gap={8} align="center">
        {meta && <ProviderIcon icon={meta.icon} alt="" size="sm" />}
        <span style={{ overflowWrap: "anywhere" }}>{account.name}</span>
        <Badge tone="outline">{meta?.name ?? account.accountType}</Badge>
      </Inline>
    </DialogTitle>
    {account.folderName && <Meta mono={false}>{account.folderName}</Meta>}
  </DialogHeader>
);

const LaunchSession = ({ account }: { account: TPamAccount }) => {
  const go = useGo();
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const { meta, browserReason } = useBrowserSupport(account);
  const [picked, setPicked] = useState<LaunchMethod>("browser");
  const method: LaunchMethod = browserReason ? "cli" : picked;
  const hosts = accountHosts(account);
  const [pickedHost, setPickedHost] = useState("");
  const host = hosts.length > 1 ? pickedHost || undefined : hosts[0];

  const openInBrowser = () =>
    go(
      orgHref(
        orgId,
        `/pam/accounts/${account.accountType}/${account.id}/access${
          host ? `?host=${encodeURIComponent(host)}` : ""
        }`
      )
    );

  return (
    <>
      <LaunchHeader account={account} meta={meta} />
      <DialogBody>
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
      </DialogBody>
      <DialogFooter showCloseButton>
        {method === "browser" && (
          <Button
            icon="globe"
            disabledReason={host || hosts.length <= 1 ? undefined : "Choose a host first"}
            onClick={openInBrowser}
          >
            Open in browser
          </Button>
        )}
      </DialogFooter>
    </>
  );
};

const LaunchSessionContent = ({ accountId }: { accountId: string }) => {
  const { data: account, isPending } = useV4Adapter("pam").useAccount(accountId);
  if (account) return <LaunchSession account={account} />;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{isPending ? "Loading account" : "Account not found"}</DialogTitle>
      </DialogHeader>
      {isPending && (
        <DialogBody>
          <Skeleton height={96} />
        </DialogBody>
      )}
      <DialogFooter showCloseButton />
    </>
  );
};

export const LaunchSessionDialog = ({
  accountId,
  onOpenChange
}: {
  accountId?: string;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={Boolean(accountId)} onOpenChange={onOpenChange}>
    <DialogContent>
      {accountId && <LaunchSessionContent key={accountId} accountId={accountId} />}
    </DialogContent>
  </Dialog>
);
