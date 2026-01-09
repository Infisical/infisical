import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, Tooltip } from "@app/components/v2";
import { useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { useGetVaultExternalMigrationConfigs } from "@app/hooks/api/migration";

type Props = {
  onClick: () => void;
};

export const LoadFromVaultBanner = ({ onClick }: Props) => {
  const { data: vaultConfigs = [] } = useGetVaultExternalMigrationConfigs();
  const hasVaultConnection = vaultConfigs.some((config) => config.connectionId);

  const { hasOrgRole } = useOrgPermission();
  const isOrgAdmin = hasOrgRole(OrgMembershipRole.Admin);

  if (hasVaultConnection) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-md border border-primary-400/30 bg-primary/10 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <FontAwesomeIcon icon={faInfoCircle} className="text-primary" />
          <span className="text-mineshaft-200">Load values from HashiCorp Vault</span>
        </div>
        <Tooltip
          content={
            !isOrgAdmin
              ? "Only organization admins can import configurations from HashiCorp Vault"
              : undefined
          }
        >
          <Button
            variant="outline_bg"
            size="xs"
            type="button"
            onClick={onClick}
            isDisabled={!isOrgAdmin}
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
