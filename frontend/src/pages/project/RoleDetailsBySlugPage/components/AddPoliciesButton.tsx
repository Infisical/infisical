import { faAngleDown, faLayerGroup, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconButton,
  Tooltip
} from "@app/components/v2";
import { useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useGetVaultExternalMigrationConfigs } from "@app/hooks/api/migration";
import { ProjectType } from "@app/hooks/api/projects/types";
import { PolicySelectionModal } from "@app/pages/project/RoleDetailsBySlugPage/components/PolicySelectionModal";
import { PolicyTemplateModal } from "@app/pages/project/RoleDetailsBySlugPage/components/PolicyTemplateModal";
import { VaultPolicyImportModal } from "@app/pages/project/RoleDetailsBySlugPage/components/VaultPolicyImportModal";

type Props = {
  isDisabled?: boolean;
  projectType: ProjectType;
  projectId?: string;
};

export const AddPoliciesButton = ({ isDisabled, projectType, projectId }: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addPolicy",
    "addPolicyOptions",
    "applyTemplate",
    "importFromVault"
  ] as const);

  const { hasOrgRole } = useOrgPermission();
  const { data: vaultConfigs = [] } = useGetVaultExternalMigrationConfigs();
  const hasVaultConnection = vaultConfigs.some((config) => config.connectionId);
  const isOrgAdmin = hasOrgRole(OrgMembershipRole.Admin);
  const isVaultImportDisabled = isDisabled || !isOrgAdmin;

  return (
    <div>
      <Button
        className="h-10 rounded-r-none"
        variant="outline_bg"
        leftIcon={<FontAwesomeIcon icon={faPlus} />}
        isDisabled={isDisabled}
        onClick={() => handlePopUpToggle("addPolicy")}
      >
        Add Policies
      </Button>
      <DropdownMenu
        open={popUp.addPolicyOptions.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addPolicyOptions", isOpen)}
      >
        <DropdownMenuTrigger asChild>
          <IconButton
            ariaLabel="Open policy template options"
            variant="outline_bg"
            className="rounded-l-none bg-mineshaft-600 p-3"
          >
            <FontAwesomeIcon icon={faAngleDown} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={2} align="end">
          <div className="flex flex-col space-y-1 p-1.5">
            <Button
              leftIcon={<FontAwesomeIcon icon={faLayerGroup} className="pr-2" />}
              onClick={() => {
                handlePopUpOpen("applyTemplate");
                handlePopUpClose("addPolicyOptions");
              }}
              isDisabled={isDisabled}
              variant="outline_bg"
              className="h-10 text-left"
              isFullWidth
            >
              Add From Template
            </Button>
            {hasVaultConnection && (
              <Tooltip
                content={
                  !isOrgAdmin
                    ? "Only organization admins can import policies from HashiCorp Vault"
                    : undefined
                }
              >
                <Button
                  leftIcon={
                    <img
                      src="/images/integrations/Vault.png"
                      alt="HashiCorp Vault"
                      className="h-4 w-4"
                    />
                  }
                  onClick={() => {
                    handlePopUpOpen("importFromVault");
                    handlePopUpClose("addPolicyOptions");
                  }}
                  isDisabled={isVaultImportDisabled}
                  variant="outline_bg"
                  className="h-10 text-left"
                  isFullWidth
                >
                  Add from HashiCorp Vault
                </Button>
              </Tooltip>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <PolicySelectionModal
        projectId={projectId}
        type={projectType}
        isOpen={popUp.addPolicy.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addPolicy", isOpen)}
      />
      <PolicyTemplateModal
        type={projectType}
        isOpen={popUp.applyTemplate.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("applyTemplate", isOpen)}
      />
      <VaultPolicyImportModal
        isOpen={popUp.importFromVault.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("importFromVault", isOpen)}
      />
    </div>
  );
};
