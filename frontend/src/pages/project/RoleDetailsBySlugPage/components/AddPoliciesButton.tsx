import { ChevronDownIcon, DownloadIcon, LayersIcon, PlusIcon } from "lucide-react";

import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { useCanUseAppConnectionImport, usePopUp } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
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

  const canUseAppConnectionImport = useCanUseAppConnectionImport({
    scope: "project-secret",
    subject: ProjectPermissionSub.Secrets
  });
  const { data: vaultAppConnections = [] } = useListAvailableAppConnections(
    AppConnection.HCVault,
    projectId ?? "",
    { enabled: Boolean(projectId) && canUseAppConnectionImport }
  );
  const hasVaultConnection = vaultAppConnections.length > 0;
  const isVaultImportDisabled = isDisabled;

  return (
    <div>
      <ButtonGroup>
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
        <DropdownMenu
          open={popUp.addPolicyOptions.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("addPolicyOptions", isOpen)}
        >
          <DropdownMenuTrigger asChild>
            <IconButton type="button" variant="outline">
              <ChevronDownIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                handlePopUpOpen("applyTemplate");
                handlePopUpClose("addPolicyOptions");
              }}
              isDisabled={isDisabled}
            >
              <LayersIcon />
              Add From Template
            </DropdownMenuItem>
            {hasVaultConnection && (
              <Tooltip open={!canUseAppConnectionImport ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    onClick={() => {
                      handlePopUpOpen("importFromVault");
                      handlePopUpClose("addPolicyOptions");
                    }}
                    isDisabled={isVaultImportDisabled}
                  >
                    <DownloadIcon />
                    Add from HashiCorp Vault
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Only authorized users can import policies from HashiCorp Vault
                </TooltipContent>
              </Tooltip>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <PolicyTemplateModal
        type={projectType}
        isOpen={popUp.applyTemplate.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("applyTemplate", isOpen)}
      />
      <VaultPolicyImportModal
        isOpen={popUp.importFromVault.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("importFromVault", isOpen)}
        appConnections={vaultAppConnections}
      />
    </div>
  );
};
