import { PamAccessStatus, PamAccountType, TAccessiblePamAccount } from "@app/hooks/api/pam";

import { PamAccountRow } from "./PamAccountRow";

type Props = {
  account: TAccessiblePamAccount;
  search: string;
  onLaunch: (account: TAccessiblePamAccount) => void;
  onRequestAccess: (account: TAccessiblePamAccount) => void;
  indented?: boolean;
};

export const AccountRow = ({ account, search, onLaunch, onRequestAccess, indented }: Props) => {
  const { canLaunch, requiresApproval, accessStatus, grantExpiresAt, disabledReason } = account;

  const isDisabled = !!disabledReason;
  const isGranted = accessStatus === PamAccessStatus.Granted;
  // Approval is a layer on top of standing access: only users who could launch the account may
  // request a grant, and launching a gated account requires both the permission and the grant.
  const needsApproval = Boolean(requiresApproval && !isGranted && !isDisabled && canLaunch);
  const canLaunchNow = canLaunch && (!requiresApproval || isGranted);

  return (
    <PamAccountRow
      name={account.name}
      accountType={account.accountType as PamAccountType}
      search={search}
      accessStatus={accessStatus ?? PamAccessStatus.None}
      grantExpiresAt={grantExpiresAt ?? null}
      needsApproval={needsApproval}
      canLaunchNow={canLaunchNow}
      isDisabled={isDisabled}
      disabledReason={disabledReason ?? undefined}
      onLaunch={() => onLaunch(account)}
      onRequestAccess={() => onRequestAccess(account)}
      indented={indented}
    />
  );
};
