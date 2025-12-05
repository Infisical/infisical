import { useState } from "react";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { HardDriveIcon, UserIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Button, Input, Modal, ModalContent, Tooltip } from "@app/components/v2";
import { useDebounce } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AddGroupIdentitiesTab, AddGroupUsersTab } from "./AddGroupMemberModalTabs";

enum AddMemberType {
  Users = "users",
  MachineIdentities = "machineIdentities"
}

type Props = {
  popUp: UsePopUpState<["addGroupMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addGroupMembers"]>, state?: boolean) => void;
  isOidcManageGroupMembershipsEnabled: boolean;
};

export const AddGroupMembersModal = ({
  popUp,
  handlePopUpToggle,
  isOidcManageGroupMembershipsEnabled
}: Props) => {
  const [addMemberType, setAddMemberType] = useState<AddMemberType>(
    isOidcManageGroupMembershipsEnabled ? AddMemberType.MachineIdentities : AddMemberType.Users
  );

  const [searchMemberFilter, setSearchMemberFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchMemberFilter);

  const popUpData = popUp?.addGroupMembers?.data as {
    groupId: string;
    slug: string;
  };

  return (
    <Modal
      isOpen={popUp?.addGroupMembers?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addGroupMembers", isOpen);
      }}
    >
      <ModalContent title="Add Group Members">
        <div className="mx-auto flex w-3/4 gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
          <Tooltip
            className="text-center"
            content={
              isOidcManageGroupMembershipsEnabled
                ? "OIDC Group Membership Mapping Enabled. Assign users to this group in your OIDC provider."
                : undefined
            }
          >
            <div className="flex-1">
              <Button
                variant="outline_bg"
                onClick={() => {
                  setAddMemberType(AddMemberType.Users);
                }}
                size="xs"
                isDisabled={isOidcManageGroupMembershipsEnabled}
                className={twMerge(
                  "w-full min-w-[2.4rem] rounded border-none hover:bg-mineshaft-600",
                  addMemberType === AddMemberType.Users ? "bg-mineshaft-500" : "bg-transparent"
                )}
              >
                <div className="flex items-center gap-2">
                  <UserIcon size={16} />
                  Users
                </div>
              </Button>
            </div>
          </Tooltip>
          <Button
            variant="outline_bg"
            onClick={() => {
              setAddMemberType(AddMemberType.MachineIdentities);
            }}
            size="xs"
            className={twMerge(
              "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
              addMemberType === AddMemberType.MachineIdentities
                ? "bg-mineshaft-500"
                : "bg-transparent"
            )}
          >
            <div className="flex items-center gap-2">
              <HardDriveIcon size={16} />
              Machine Identities
            </div>
          </Button>
        </div>
        <div className="mt-4 mb-4 flex items-center justify-center gap-x-2">
          <Input
            value={searchMemberFilter}
            onChange={(e) => setSearchMemberFilter(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search members..."
          />
        </div>
        {addMemberType === AddMemberType.Users &&
          popUpData &&
          !isOidcManageGroupMembershipsEnabled && (
            <AddGroupUsersTab
              groupId={popUpData.groupId}
              groupSlug={popUpData.slug}
              search={debouncedSearch}
            />
          )}
        {addMemberType === AddMemberType.MachineIdentities && popUpData && (
          <AddGroupIdentitiesTab
            groupId={popUpData.groupId}
            groupSlug={popUpData.slug}
            search={debouncedSearch}
          />
        )}
      </ModalContent>
    </Modal>
  );
};
