import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, Tooltip } from "@app/components/v2";
import { ProjectPermissionSub, useProject } from "@app/context";
import { useCanUseProjectAppConnectionImport } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

type Props = {
  onClick: () => void;
};

export const LoadFromVaultBanner = ({ onClick }: Props) => {
  const { projectId } = useProject();
  const canUseAppConnectionImport = useCanUseProjectAppConnectionImport(
    ProjectPermissionSub.Secrets
  );
  const { data: vaultAppConnections = [] } = useListAvailableAppConnections(
    AppConnection.HCVault,
    projectId,
    { enabled: canUseAppConnectionImport }
  );
  const hasVaultConnection = vaultAppConnections.length > 0;

  if (hasVaultConnection && canUseAppConnectionImport) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-md border border-primary-400/30 bg-primary/10 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <FontAwesomeIcon icon={faInfoCircle} className="text-primary" />
          <span className="text-mineshaft-200">Load values from HashiCorp Vault</span>
        </div>
        <Tooltip
          content={
            !canUseAppConnectionImport
              ? "Only authorized users can import configurations from HashiCorp Vault"
              : undefined
          }
        >
          <Button
            variant="outline_bg"
            size="xs"
            type="button"
            onClick={onClick}
            isDisabled={!canUseAppConnectionImport}
            leftIcon={
              <img src="/images/integrations/Vault.png" alt="HashiCorp Vault" className="h-4 w-4" />
            }
          >
            Load from Vault
          </Button>
        </Tooltip>
      </div>
    );
  }

  return <span />;
};
