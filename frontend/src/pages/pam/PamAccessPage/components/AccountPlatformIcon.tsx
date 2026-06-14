import { PAM_ACCOUNT_TYPE_MAP, PamAccountType } from "@app/hooks/api/pam";

type Props = {
  accountType: PamAccountType;
  size?: number;
};

export const AccountPlatformIcon = ({ accountType, size = 28 }: Props) => {
  const details = PAM_ACCOUNT_TYPE_MAP[accountType];

  return (
    <img
      src={`/images/integrations/${details.image}`}
      alt={details.name}
      className="shrink-0 rounded-sm"
      style={{ width: size, height: size }}
    />
  );
};
