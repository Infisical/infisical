import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TSupabaseSync } from "@app/hooks/api/secretSyncs/types/supabase";

type Props = {
  secretSync: TSupabaseSync;
};

export const SupabaseSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <Detail>
      <DetailLabel>Project</DetailLabel>
      <DetailValue>{destinationConfig.projectName}</DetailValue>
    </Detail>
  );
};
