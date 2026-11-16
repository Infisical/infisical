import { EmptyState } from "@infisical/cipher/ui/empty";
import { Spinner } from "@infisical/cipher/ui/spinner";
import { useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { PamAccountType } from "@app/hooks/api/pam";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { SessionAccessGate } from "./access-gate";
import { AwsConsoleAccess } from "./aws-console-access";
import { DataExplorer } from "./data-explorer/data-explorer";
import { RemoteDesktopLauncher } from "./remote-desktop-session";
import { TerminalSession } from "./terminal-session";

const route = v4Path("/organizations/$orgId/pam/accounts/$accountType/$accountId/access");

const DATA_EXPLORER_TYPES = new Set<PamAccountType>([
  PamAccountType.Postgres,
  PamAccountType.CockroachDB,
  PamAccountType.MySQL,
  PamAccountType.Snowflake,
  PamAccountType.ClickHouse
]);

const REMOTE_DESKTOP_TYPES = new Set<PamAccountType>([
  PamAccountType.Windows,
  PamAccountType.WindowsAd
]);

const AccountAccess = () => {
  const { accountId } = useParams({ from: route });
  const { host } = useSearch({ from: route });
  const { data: account, isPending } = useV4Adapter("pam").useAccount(accountId);

  if (isPending) return <Spinner size="page" label="Loading account" />;
  if (!account)
    return (
      <EmptyState
        icon="alert"
        title="Account not found"
        description={`Could not find an account with ID ${accountId}.`}
      />
    );
  if (account.accountType === PamAccountType.AwsIam) return <AwsConsoleAccess account={account} />;
  if (account.accountType === PamAccountType.SSH) return <TerminalSession account={account} />;

  return (
    <SessionAccessGate account={account}>
      {({ reason, mfaSessionId }) => {
        if (DATA_EXPLORER_TYPES.has(account.accountType))
          return <DataExplorer account={account} reason={reason} mfaSessionId={mfaSessionId} />;
        return REMOTE_DESKTOP_TYPES.has(account.accountType) ? (
          <RemoteDesktopLauncher
            account={account}
            reason={reason}
            mfaSessionId={mfaSessionId}
            preselectedHost={host}
          />
        ) : (
          <TerminalSession account={account} reason={reason} mfaSessionId={mfaSessionId} />
        );
      }}
    </SessionAccessGate>
  );
};

export const PamAccountAccessPage = () => (
  <>
    <PageTitle title="Web Access" />
    <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
      <AccountAccess />
    </div>
  </>
);
