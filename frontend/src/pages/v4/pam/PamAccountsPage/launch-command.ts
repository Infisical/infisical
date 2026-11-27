import {
  buildPamAccountCan,
  PamAccessStatus,
  PamAccountType,
  PamResourcePermissionActions,
  type TPamAccount,
  type TPamAccountListItem,
  type TPamAccountTypeMetadata
} from "@app/hooks/api/pam";

export const accountHosts = (account?: Pick<TPamAccount, "accountType" | "connectionDetails">) => {
  const hosts =
    account?.accountType === PamAccountType.WindowsAd ? account.connectionDetails.hosts : undefined;
  return Array.isArray(hosts)
    ? hosts.filter((host): host is string => typeof host === "string")
    : [];
};

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const shellArg = (value: string) => (/^[\w./:@-]+$/.test(value) ? value : quote(value));

export const cliLaunchCommand = (
  account: { name: string; folderName: string | null },
  host?: string
) =>
  `infisical pam access ${shellArg(
    account.folderName ? `${account.folderName}/${account.name}` : account.name
  )}${host ? ` --target ${quote(host)}` : ""} --domain ${quote(window.location.origin)}`;

export const browserUnavailableReason = (
  meta: TPamAccountTypeMetadata | undefined,
  account: Pick<TPamAccount, "webAccessUnavailableReason"> | undefined,
  typesFailed: boolean
) => {
  if (account?.webAccessUnavailableReason) return account.webAccessUnavailableReason;
  if (meta && !meta.supportsWebAccess)
    return `${meta.name} accounts can't be opened in the browser. Connect with the Infisical CLI.`;
  if (!meta && typesFailed)
    return "Couldn't check whether this account opens in the browser. Connect with the Infisical CLI.";
  return undefined;
};

export const launchState = (account: TPamAccountListItem) => {
  const canLaunch = buildPamAccountCan(account.permissions)(
    PamResourcePermissionActions.LaunchSessions
  );
  const isGranted = account.accessStatus === PamAccessStatus.Granted;
  const canLaunchNow =
    account.isAccessible && canLaunch && (!account.requiresApproval || isGranted);
  let launchReason: string | undefined;
  if (!canLaunch) launchReason = "You don't have permission to launch sessions";
  else if (!canLaunchNow) launchReason = "This account is not ready to launch";
  return {
    needsApproval: account.requiresApproval && !isGranted && canLaunch && account.isAccessible,
    canLaunchNow,
    launchReason
  };
};

export const needsAccessRequest = (account: TPamAccountListItem) =>
  launchState(account).needsApproval || account.accessStatus === PamAccessStatus.Pending;
