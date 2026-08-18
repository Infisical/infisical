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
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { PolicySelectionPopover } from "@app/pages/project/RoleDetailsBySlugPage/components/PolicySelectionModal";
import { VaultPolicyImportModal } from "@app/pages/project/RoleDetailsBySlugPage/components/VaultPolicyImportModal";

import { MembershipPolicyTemplateDialog } from "./MembershipPolicyTemplateDialog";

type Props = {
  isDisabled?: boolean;
  projectType: ProjectType;
  projectId?: string;
  allowedSubjects?: ProjectPermissionSub[];
  portalContainer?: React.RefObject<HTMLElement | null>;
};

type VaultImportControlsProps = {
  projectId: string;
  isDisabled?: boolean;
  onOpenModal: (appConnections: TAvailableAppConnection[]) => void;
};

const VaultImportControls = ({ projectId, isDisabled, onOpenModal }: VaultImportControlsProps) => {
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
        <DropdownMenuItem onClick={() => onOpenModal(vaultAppConnections)} isDisabled={isDisabled}>
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

export const MembershipAddPoliciesButton = ({
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

  const vaultAppConnections =
    (popUp.importVault.data as TAvailableAppConnection[] | undefined) ?? [];

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
              <VaultImportControls
                projectId={projectId}
                isDisabled={isDisabled}
                onOpenModal={(appConnections) => {
                  handlePopUpOpen("importVault", appConnections);
                  handlePopUpClose("addPolicyOptions");
                }}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <MembershipPolicyTemplateDialog
        type={projectType}
        isOpen={popUp.applyTemplate.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("applyTemplate", isOpen)}
      />
      <VaultPolicyImportModal
        isOpen={popUp.importVault.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("importVault", isOpen)}
        appConnections={vaultAppConnections}
      />
    </div>
  );
};
