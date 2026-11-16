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
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Meta } from "@infisical/cipher/ui/text";
import { useParams } from "@tanstack/react-router";

import type { TPamAccountListItem } from "@app/hooks/api/pam";
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
      maxLines={4}
      value={cliLaunchCommand(account, host)}
    />
  </Field>
);

const LaunchSession = ({
  account,
  onClose
}: {
  account: TPamAccountListItem;
  onClose: () => void;
}) => {
  const go = useGo();
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const pam = useV4Adapter("pam");
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const { data: full } = pam.useAccount(account.id);
  const meta = accountTypes.find(({ type }) => type === account.accountType);
  const unavailable = browserUnavailableReason(meta, full);
  const [picked, setPicked] = useState<LaunchMethod>("browser");
  const method: LaunchMethod = unavailable ? "cli" : picked;
  const hosts = accountHosts(full);
  const [pickedHost, setPickedHost] = useState("");
  const host = hosts.length > 1 ? pickedHost || undefined : hosts[0];

  const openInBrowser = () => {
    onClose();
    go(
      orgHref(
        orgId,
        `/pam/accounts/${account.accountType}/${account.id}/access${
          host ? `?host=${encodeURIComponent(host)}` : ""
        }`
      )
    );
  };

  return (
    <>
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
      <DialogBody>
        <RadioGroup
          aria-label="Launch method"
          columns={2}
          value={method}
          onValueChange={(value) => setPicked(value as LaunchMethod)}
        >
          <RadioGroupCard
            value="browser"
            title="Browser"
            media={<Icon name="globe" />}
            description={unavailable}
            disabled={Boolean(unavailable)}
          />
          <RadioGroupCard value="cli" title="CLI" media={<Icon name="terminal" />} />
        </RadioGroup>
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

export const LaunchSessionDialog = ({
  account,
  onOpenChange
}: {
  account: TPamAccountListItem | null;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
    <DialogContent>
      {account && (
        <LaunchSession key={account.id} account={account} onClose={() => onOpenChange(false)} />
      )}
    </DialogContent>
  </Dialog>
);
