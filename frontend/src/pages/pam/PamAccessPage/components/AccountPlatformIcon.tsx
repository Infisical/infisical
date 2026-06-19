import { PamAccountType, resolvePamAccountType, usePamAccountTypeMap } from "@app/hooks/api/pam";

type Props = {
  accountType: PamAccountType;
  size?: number;
};

export const AccountPlatformIcon = ({ accountType, size = 28 }: Props) => {
  const { map } = usePamAccountTypeMap();
  const resolved = resolvePamAccountType(accountType);
  const meta = map[resolved as PamAccountType];

  if (!meta) return null;

  return (
    <img
      src={`/images/integrations/${meta.icon}`}
      alt={meta.name}
      className="shrink-0 rounded-sm"
      style={{ width: size, height: size }}
    />
  );
};
