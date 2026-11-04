import { Badge } from "@app/components/v3";
import { SECRET_SCANNING_FINDING_STATUS_MAP } from "@app/helpers/secretScanningV2";
import { SecretScanningFindingStatus } from "@app/hooks/api/secretScanningV2";

type Props = {
  status: SecretScanningFindingStatus;
};

export const FindingStatusBadge = ({ status }: Props) => {
  const { Icon, variant, name } = SECRET_SCANNING_FINDING_STATUS_MAP[status];

  return (
    <Badge variant={variant}>
      <Icon />
      {name}
    </Badge>
  );
};
