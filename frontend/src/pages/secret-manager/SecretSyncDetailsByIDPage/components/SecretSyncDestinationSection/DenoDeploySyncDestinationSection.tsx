import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import {
  DENO_DEPLOY_SYNC_CONTEXT_OPTIONS,
  TDenoDeploySync
} from "@app/hooks/api/secretSyncs/types/deno-deploy-sync";

type Props = {
  secretSync: TDenoDeploySync;
};

export const DenoDeploySyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { appSlug, context }
  } = secretSync;
  const contextLabel =
    DENO_DEPLOY_SYNC_CONTEXT_OPTIONS.find((option) => option.value === context)?.label ?? context;

  return (
    <>
      <Detail>
        <DetailLabel>App</DetailLabel>
        <DetailValue>{appSlug}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Context</DetailLabel>
        <DetailValue>{contextLabel}</DetailValue>
      </Detail>
    </>
  );
};
