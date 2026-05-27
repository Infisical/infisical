import { PlusIcon } from "lucide-react";

import { Button } from "@app/components/v3";
import { usePopUp } from "@app/hooks";

import { OrgPolicySelectionPopover } from "./OrgPolicySelectionModal";

type Props = {
  isDisabled?: boolean;
  invalidSubjects?: string[];
};

export const OrgAddPoliciesButton = ({ isDisabled, invalidSubjects }: Props) => {
  const { popUp, handlePopUpToggle } = usePopUp(["addPolicy"] as const);

  return (
    <OrgPolicySelectionPopover
      isOpen={popUp.addPolicy.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("addPolicy", isOpen)}
      invalidSubjects={invalidSubjects}
    >
      <Button type="button" isDisabled={isDisabled} variant="outline">
        <PlusIcon />
        Add Policies
      </Button>
    </OrgPolicySelectionPopover>
  );
};
