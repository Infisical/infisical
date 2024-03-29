import { useMemo,useState } from "react";
import { faMagnifyingGlass,faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
    Button,
    EmptyState,
    Input,
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
import {
    OrgPermissionActions,
    OrgPermissionSubjects
} from "@app/context";
import { 
    useAddUserToGroup,
    useListGroupUsers,
    useRemoveUserFromGroup} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["groupMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["groupMembers"]>, state?: boolean) => void;
};

export const OrgGroupMembersModal = ({
    popUp,
    handlePopUpToggle
}: Props) => {
    const [searchMemberFilter, setSearchMemberFilter] = useState("");
    
    const popUpData = popUp?.groupMembers?.data as {
        slug: string;
    };
    
    const { data: users, isLoading } = useListGroupUsers(popUpData?.slug ?? "");
    const { mutateAsync: assignMutateAsync } = useAddUserToGroup();
    const { mutateAsync: unassignMutateAsync } = useRemoveUserFromGroup();
    
    const handleAssignment = async (username: string, assign: boolean) => {
        try {
            if (!popUpData?.slug) return;
            
            if (assign) {
                await assignMutateAsync({
                    username,
                    slug: popUpData.slug
                });
            } else {
                await unassignMutateAsync({
                    username,
                    slug: popUpData.slug
                });
            }

            createNotification({
                text: `Successfully ${assign ? "assigned" : "removed "} user ${assign ? "to" : "from"} group`,
                type: "success"
            });
        } catch (err) {
            createNotification({
                text: `Failed to ${assign ? "assigned" : "remove"} user ${assign ? "to" : "from"} group`,
                type: "error"
            });
        }
    }
    
    const filterdUser = useMemo(
        () =>
        users?.filter(
            ({ firstName, lastName, username }) =>
              firstName?.toLowerCase().includes(searchMemberFilter.toLowerCase()) ||
              lastName?.toLowerCase().includes(searchMemberFilter.toLowerCase()) ||
              username?.toLowerCase().includes(searchMemberFilter.toLowerCase())
          ),
        [users, searchMemberFilter]
      );
    
    return (
        <Modal
            isOpen={popUp?.groupMembers?.isOpen}
            onOpenChange={(isOpen) => {
                handlePopUpToggle("groupMembers", isOpen);
            }}
        >
            <ModalContent title="Manage Group Members">
                <Input
                    value={searchMemberFilter}
                    onChange={(e) => setSearchMemberFilter(e.target.value)}
                    leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                    placeholder="Search members..."
                />
                <TableContainer className="mt-4">
                    <Table>
                        <THead>
                            <Tr>
                                <Th>User</Th>
                                <Th />
                            </Tr>
                        </THead>
                        <TBody>
                            {isLoading && <TableSkeleton columns={2} innerKey="group-users" />}
                            {!isLoading && filterdUser?.map(({
                                id,
                                firstName,
                                lastName,
                                username,
                                isPartOfGroup
                            }) => {
                                return (
                                    <Tr className="items-center" key={`group-user-${id}`}>
                                        <Td>
                                            <p>{`${firstName} ${lastName}`}</p>
                                            <p>{username}</p>
                                        </Td>
                                        <Td className="flex justify-end">
                                            <OrgPermissionCan
                                                I={OrgPermissionActions.Edit}
                                                a={OrgPermissionSubjects.Groups}
                                            >
                                                {(isAllowed) => {
                                                    return (
                                                        <Button
                                                            isLoading={isLoading}
                                                            isDisabled={!isAllowed}
                                                            colorSchema="primary"
                                                            variant="outline_bg"
                                                            type="submit"
                                                            onClick={() => handleAssignment(username, !isPartOfGroup)}
                                                        >
                                                            {isPartOfGroup ? "Unassign" : "Assign"}
                                                        </Button>
                                                    );
                                                }}
                                            </OrgPermissionCan>
                                        </Td>
                                    </Tr>
                                );
                            })}
                        </TBody>
                    </Table>
                    {!isLoading && !filterdUser?.length && (
                        <EmptyState
                            title="No users found"
                            icon={faUsers}
                        />
                    )}
                </TableContainer>
            </ModalContent>
        </Modal>
    );
}