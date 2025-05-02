import { faServer } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  EmptyState,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useAddHostToSshHostGroup, useListSshHostGroupHosts } from "@app/hooks/api";
import { EHostGroupMembershipFilter } from "@app/hooks/api/sshHostGroup/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["addHostGroupMembers"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["addHostGroupMembers"]>,
    state?: boolean
  ) => void;
};

export const AddHostGroupMemberModal = ({ popUp, handlePopUpToggle }: Props) => {
  const popUpData = popUp?.addHostGroupMembers?.data as {
    sshHostGroupId: string;
  };

  const { data, isPending } = useListSshHostGroupHosts({
    sshHostGroupId: popUpData?.sshHostGroupId,
    filter: EHostGroupMembershipFilter.NON_GROUP_MEMBERS
  });
  const { mutateAsync: addHostToSshHostGroup, isPending: isAddingHostToSshHostGroup } =
    useAddHostToSshHostGroup();

  const handleAddHost = async (sshHostId: string) => {
    try {
      if (!popUpData?.sshHostGroupId) {
        createNotification({
          text: "Some data is missing, please refresh the page and try again",
          type: "error"
        });
        return;
      }

      await addHostToSshHostGroup({
        sshHostGroupId: popUpData.sshHostGroupId,
        sshHostId
      });

      createNotification({
        text: "Successfully added host to the group",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to add host to the group",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.addHostGroupMembers?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addHostGroupMembers", isOpen);
      }}
    >
      <ModalContent title="Add Hosts to Group">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Alias</Th>
                <Th>Hostname</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={3} innerKey="ssh-hosts" />}
              {!isPending &&
                data?.hosts?.map((host) => {
                  return (
                    <Tr className="items-center" key={`host-${host.id}`}>
                      <Td>{host.alias ?? "-"}</Td>
                      <Td>{host.hostname}</Td>
                      <Td className="flex justify-end">
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.SshHostGroups}
                        >
                          {(isAllowed) => (
                            <Button
                              isLoading={isAddingHostToSshHostGroup}
                              isDisabled={!isAllowed}
                              colorSchema="primary"
                              variant="outline_bg"
                              type="button"
                              onClick={() => handleAddHost(host.id)}
                            >
                              Add
                            </Button>
                          )}
                        </ProjectPermissionCan>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isPending && !data?.hosts?.length && (
            <EmptyState title="No hosts available to add to the SSH host group" icon={faServer} />
          )}
        </TableContainer>
      </ModalContent>
    </Modal>
  );
};
