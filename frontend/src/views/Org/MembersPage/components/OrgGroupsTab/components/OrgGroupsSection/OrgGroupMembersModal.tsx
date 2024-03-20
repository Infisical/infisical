import { faUsers } from "@fortawesome/free-solid-svg-icons";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
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
import { 
    useCreateGroupUserMembership,
    useDeleteGroupUserMembership,
    useGetGroupUserMemberships} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["groupMembers"]>;
//   handlePopUpClose: (popUpName: keyof UsePopUpState<["groupMembers"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["groupMembers"]>, state?: boolean) => void;
};

export const OrgGroupMembersModal = ({
    popUp,
    handlePopUpToggle
}: Props) => {
    const { createNotification } = useNotificationContext();
    
    const popUpData = popUp?.groupMembers?.data as {
        slug: string;
    };
    
    const { data: users, isLoading } = useGetGroupUserMemberships(popUpData?.slug ?? "");
    const { mutateAsync: assignMutateAsync } = useCreateGroupUserMembership();
    const { mutateAsync: unassignMutateAsync } = useDeleteGroupUserMembership();
    
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
    
    return (
        <Modal
            isOpen={popUp?.groupMembers?.isOpen}
            onOpenChange={(isOpen) => {
                handlePopUpToggle("groupMembers", isOpen);
            }}
        >
            <ModalContent title="Manage Group Members">
                <TableContainer>
                    <Table>
                        <THead>
                            <Tr>
                                <Th>User</Th>
                                <Th>Status</Th>
                            </Tr>
                        </THead>
                        <TBody>
                            {isLoading && <TableSkeleton columns={2} innerKey="group-users" />}
                            {!isLoading && users?.map(({
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
                                        <Td>
                                            <Button
                                                // isLoading={isLoading}
                                                // isDisabled={!isAllowed}
                                                colorSchema="primary"
                                                variant="outline_bg"
                                                type="submit"
                                                onClick={() => handleAssignment(username, !isPartOfGroup)}
                                            >
                                                {isPartOfGroup ? "Unassign" : "Assign"}
                                            </Button>
                                        </Td>
                                    </Tr>
                                );
                            })}
                        </TBody>
                    </Table>
                    {!isLoading && !users?.length && (
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