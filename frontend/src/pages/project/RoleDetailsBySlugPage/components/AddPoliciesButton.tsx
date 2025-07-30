import { faAngleDown, faLayerGroup, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { PolicySelectionModal } from "@app/pages/project/RoleDetailsBySlugPage/components/PolicySelectionModal";
import { PolicyTemplateModal } from "@app/pages/project/RoleDetailsBySlugPage/components/PolicyTemplateModal";

type Props = {
  isDisabled?: boolean;
  projectType: ProjectType;
};

export const AddPoliciesButton = ({ isDisabled, projectType }: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addPolicy",
    "addPolicyOptions",
    "applyTemplate"
  ] as const);

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
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <PolicySelectionModal
        type={projectType}
        isOpen={popUp.addPolicy.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addPolicy", isOpen)}
      />
      <PolicyTemplateModal
        type={projectType}
        isOpen={popUp.applyTemplate.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("applyTemplate", isOpen)}
      />
    </div>
  );
};
