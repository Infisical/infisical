import { useMemo, useState } from "react";
import { MonitorSmartphone } from "lucide-react";

import { Button } from "@app/components/v3";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";
import { PamAccountType, TPamAccount } from "@app/hooks/api/pam";

import { RdpContent } from "./RdpContent";
import { WebAccessStatusCard } from "./WebAccessStatusCard";

type Props = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
  preselectedHost?: string;
};

const getSelectableHosts = (account: TPamAccount): string[] => {
  if (account.accountType !== PamAccountType.WindowsAd) return [];
  const raw = (account.connectionDetails as { hosts?: unknown }).hosts;
  return Array.isArray(raw) ? raw.filter((host): host is string => typeof host === "string") : [];
};

export const RdpLauncher = ({ account, reason, mfaSessionId, preselectedHost }: Props) => {
  const hosts = useMemo(() => getSelectableHosts(account), [account]);
  const needsPicker = hosts.length > 1 && !preselectedHost;

  const [selectedHost, setSelectedHost] = useState<string | undefined>(
    preselectedHost ?? (hosts.length > 1 ? undefined : hosts[0])
  );
  const [pendingHost, setPendingHost] = useState<string>(hosts[0] ?? "");

  if (needsPicker && !selectedHost) {
    return (
      <WebAccessStatusCard
        icon={MonitorSmartphone}
        title="Select a host"
        description="Choose which host to connect to for this session."
      >
        <Select value={pendingHost} onValueChange={setPendingHost}>
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
        <Button
          variant="pam"
          isFullWidth
          isDisabled={!pendingHost}
          onClick={() => setSelectedHost(pendingHost)}
        >
          Connect
        </Button>
      </WebAccessStatusCard>
    );
  }

  return (
    <RdpContent
      account={account}
      reason={reason}
      mfaSessionId={mfaSessionId}
      selectedHost={selectedHost}
    />
  );
};
