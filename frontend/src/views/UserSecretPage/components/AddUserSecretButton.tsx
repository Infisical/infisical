import { useState } from "react";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  UpgradePlanModal
} from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

export function AddUserSecretButton({
  popUp,
  handlePopUpToggle
}: {
  popUp: UsePopUpState<["misc"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["misc", "createUserSecret"]>,
    state?: boolean
  ) => void;
}) {
  const [isUpgradePlanModalOpen, setIsUpgradePlanModalOpen] = useState(false);
  return (
    <>
      <DropdownMenu
        open={popUp.misc.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("misc", isOpen)}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline_bg"
            rightIcon={<FontAwesomeIcon icon={faChevronDown} className="ml-2" />}
            className="h-10"
          >
            Add Secret
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-0">
          <div className="flex flex-col space-y-1 p-1.5">
            <DropdownMenuItem
              className="text-sm"
              onClick={() => {
                handlePopUpToggle("createUserSecret");
              }}
            >
              Web Login
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-sm"
              onClick={() => {
                setIsUpgradePlanModalOpen(true);
              }}
            >
              Credit Card
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-sm"
              onClick={() => {
                setIsUpgradePlanModalOpen(true);
              }}
            >
              Secure Note
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <UpgradePlanModal
        text="You can use more secret types if you switch to a paid Infisical plan."
        isOpen={isUpgradePlanModalOpen}
        onOpenChange={setIsUpgradePlanModalOpen}
      />
    </>
  );
}
