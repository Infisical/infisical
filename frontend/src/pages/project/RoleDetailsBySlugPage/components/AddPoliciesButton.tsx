import { ChevronDownIcon, LayersIcon, PlusIcon, UploadIcon } from "lucide-react";

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableButtonGroup,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3";
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
      <UnstableButtonGroup>
        <Button
          className="rounded-r-none"
          isDisabled={isDisabled}
          variant="outline"
          onClick={() => handlePopUpToggle("addPolicy")}
        >
          <PlusIcon />
          Add Policies
        </Button>
        <UnstableDropdownMenu
          open={popUp.addPolicyOptions.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("addPolicyOptions", isOpen)}
        >
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton variant="outline">
              <ChevronDownIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            <UnstableDropdownMenuItem
              onClick={() => {
                handlePopUpOpen("applyTemplate");
                handlePopUpClose("addPolicyOptions");
              }}
              isDisabled={isDisabled}
            >
              <LayersIcon />
              Add From Template
            </UnstableDropdownMenuItem>
            {hasVaultConnection && (
              <Tooltip open={!isOrgAdmin ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <UnstableDropdownMenuItem
                    onClick={() => {
                      handlePopUpOpen("importFromVault");
                      handlePopUpClose("addPolicyOptions");
                    }}
                    isDisabled={isVaultImportDisabled}
                  >
                    <UploadIcon />
                    Add from HashiCorp Vault
                  </UnstableDropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Only organization admins can import policies from HashiCorp Vault
                </TooltipContent>
              </Tooltip>
            )}
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </UnstableButtonGroup>
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
