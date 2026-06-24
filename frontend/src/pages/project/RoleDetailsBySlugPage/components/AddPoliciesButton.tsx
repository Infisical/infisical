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
import { useCanUseProjectAppConnectionImport, usePopUp } from "@app/hooks";
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

type VaultImportMenuItemProps = {
  projectId: string;
  isDisabled?: boolean;
  onSelect: () => void;
};

// Mounted only when a projectId is present so the project-permission hook
// isn't called outside a ProjectPermissionContext (e.g. the org-level
// project-templates editor).
const VaultImportMenuItem = ({ projectId, isDisabled, onSelect }: VaultImportMenuItemProps) => {
  const canUseAppConnectionImport = useCanUseProjectAppConnectionImport(
    ProjectPermissionSub.Secrets
  );
  const { data: vaultAppConnections = [] } = useListAvailableAppConnections(
    AppConnection.HCVault,
    projectId,
    { enabled: canUseAppConnectionImport }
  );

  if (vaultAppConnections.length === 0) return null;

  return (
    <Tooltip open={!canUseAppConnectionImport ? undefined : false}>
      <TooltipTrigger className="block w-full">
        <DropdownMenuItem onClick={onSelect} isDisabled={isDisabled}>
          <DownloadIcon />
          Add from HashiCorp Vault
        </DropdownMenuItem>
      </TooltipTrigger>
      <TooltipContent side="left">
        Only authorized users can import policies from HashiCorp Vault
      </TooltipContent>
    </Tooltip>
  );
};

type VaultPolicyImportModalContainerProps = {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

// Rendered outside the dropdown so the modal (and its open state) isn't
// unmounted when the dropdown menu closes on item select. Gated by projectId
// for the same reason as VaultImportMenuItem. The connections query shares its
// cache key with the menu item, so React Query dedupes the request.
const VaultPolicyImportModalContainer = ({
  projectId,
  isOpen,
  onOpenChange
}: VaultPolicyImportModalContainerProps) => {
  const canUseAppConnectionImport = useCanUseProjectAppConnectionImport(
    ProjectPermissionSub.Secrets
  );
  const { data: vaultAppConnections = [] } = useListAvailableAppConnections(
    AppConnection.HCVault,
    projectId,
    { enabled: canUseAppConnectionImport }
  );

  return (
    <VaultPolicyImportModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      appConnections={vaultAppConnections}
    />
  );
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
    "importVault"
  ] as const);

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
            {projectId && (
              <VaultImportMenuItem
                projectId={projectId}
                isDisabled={isDisabled}
                onSelect={() => {
                  handlePopUpOpen("importVault");
                  handlePopUpClose("addPolicyOptions");
                }}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <PolicyTemplateModal
        type={projectType}
        isOpen={popUp.applyTemplate.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("applyTemplate", isOpen)}
      />
      {projectId && (
        <VaultPolicyImportModalContainer
          projectId={projectId}
          isOpen={popUp.importVault.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("importVault", isOpen)}
        />
      )}
    </div>
  );
};
