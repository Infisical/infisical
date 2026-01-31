import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSupabaseSync } from "@app/hooks/api/secretSyncs/types/supabase";

type Props = {
  secretSync: TSupabaseSync;
};

export const SupabaseSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return <>
    <GenericFieldLabel label="Project">{destinationConfig.projectName}</GenericFieldLabel>
    { destinationConfig?.projectBranchId && <GenericFieldLabel label="Branch">{destinationConfig.projectBranchName}</GenericFieldLabel> }
  </>
};
