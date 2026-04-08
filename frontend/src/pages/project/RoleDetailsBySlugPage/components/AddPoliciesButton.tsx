import { ChevronDownIcon, DownloadIcon, LayersIcon, PlusIcon } from "lucide-react";

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
import { ProjectPermissionSub, useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useGetExternalMigrationConfigs } from "@app/hooks/api/migration";
import { ExternalMigrationProviders } from "@app/hooks/api/migration/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { PolicySelectionPopover } from "@app/pages/project/RoleDetailsBySlugPage/components/PolicySelectionModal";
import { PolicyTemplateModal } from "@app/pages/project/RoleDetailsBySlugPage/components/PolicyTemplateModal";
import { VaultPolicyImportModal } from "@app/pages/project/RoleDetailsBySlugPage/components/VaultPolicyImportModal";

type Props = {
  isDisabled?: boolean;
  projectType: ProjectType;
  projectId?: string;
  allowedSubjects?: ProjectPermissionSub[];
  portalContainer?: React.RefObject<HTMLElement | null>;
};

export const AddPoliciesButton = ({
  isDisabled,
  projectType,
  projectId,
  allowedSubjects,
  portalContainer
}: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addPolicy",
    "addPolicyOptions",
    "applyTemplate",
    "importFromVault"
  ] as const);

  const { hasOrgRole } = useOrgPermission();
  const { data: vaultConfigs = [] } = useGetExternalMigrationConfigs(
    ExternalMigrationProviders.Vault
  );
  const hasVaultConnection = vaultConfigs.some((config) => config.connectionId);
  const isOrgAdmin = hasOrgRole(OrgMembershipRole.Admin);
  const isVaultImportDisabled = isDisabled || !isOrgAdmin;

  return (
    <div>
      <UnstableButtonGroup>
        <PolicySelectionPopover
          type={projectType}
          isOpen={popUp.addPolicy.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("addPolicy", isOpen)}
          projectId={projectId}
          allowedSubjects={allowedSubjects}
          portalContainer={portalContainer?.current}
        >
          <Button
            type="button"
            className="rounded-r-none"
            isDisabled={isDisabled}
            variant="outline"
          >
            <PlusIcon />
            Add Policies
          </Button>
        </PolicySelectionPopover>
        <UnstableDropdownMenu
          open={popUp.addPolicyOptions.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("addPolicyOptions", isOpen)}
        >
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton type="button" variant="outline">
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
                    <DownloadIcon />
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
