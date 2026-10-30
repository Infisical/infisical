import { AccessRestrictedNotice } from "@app/components/v3";

type Props = {
  containerClassName?: string;
};

export const PermissionDeniedBanner = ({ containerClassName }: Props) => {
  return <AccessRestrictedNotice className={containerClassName} />;
};
