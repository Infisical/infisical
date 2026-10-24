import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { CLOUDFLARE_PAGES_VARIABLE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import {
  CloudflarePagesVariableType,
  TCloudflarePagesSync
} from "@app/hooks/api/secretSyncs/types/cloudflare-pages-sync";

type Props = {
  secretSync: TCloudflarePagesSync;
};

export const CloudflarePagesSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { variableType = CloudflarePagesVariableType.Secret }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Variable Type</DetailLabel>
      <DetailValue>{CLOUDFLARE_PAGES_VARIABLE_TYPE_LABELS[variableType]}</DetailValue>
    </Detail>
  );
};
