import { InfoIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, Button } from "@app/components/v3";
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
      <Alert variant="info" className="mb-4">
        <InfoIcon />
        <AlertDescription>
          <span>Load values from HashiCorp Vault</span>
          <AlertAction>
            <Button
              variant="info"
              size="xs"
              type="button"
              onClick={onClick}
              isDisabled={!canUseAppConnectionImport}
            >
              <img src="/images/integrations/Vault.png" alt="" className="size-4" />
              Load from Vault
            </Button>
          </AlertAction>
        </AlertDescription>
      </Alert>
    );
  }

  return <span />;
};
