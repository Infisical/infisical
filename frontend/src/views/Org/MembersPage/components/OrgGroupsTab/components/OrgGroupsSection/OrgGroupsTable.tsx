import { useState } from "react";
// import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { faMagnifyingGlass, faPencil, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
//   Button,
  EmptyState,
  IconButton,
  Input,
//   Select,
//   SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr} from "@app/components/v2";
import {
    OrgPermissionActions,
    OrgPermissionSubjects,
    useOrganization} from "@app/context";
import { 
    useGetOrganizationGroups, 
    // useGetOrgRoles 
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
    handlePopUpOpen: (
      popUpName: keyof UsePopUpState<
        ["group", "deleteGroup"]
      >,
      data?: {
        groupId?: string;
        name?: string;
        slug?: string;
      }
    ) => void;
  };

export const OrgGroupsTable = ({
    handlePopUpOpen
}: Props) => {
    // const { createNotification } = useNotificationContext();
    const [searchGroupsFilter, setSearchGroupsFilter] = useState("");
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";
    const { isLoading, data: groups } = useGetOrganizationGroups(orgId);
    
    // const { data: roles } = useGetOrgRoles(orgId);
    
    console.log("OrgGroupsTable groups: ", groups);
    console.log("OrgGroupsTable roles: ", groups);
    
    // const handleChangeRole = ({
    //     groupId,
    //     role
    // }: {
    //     groupId: string;
    //     role: string;
    // }) => {
    //     try {
            
    //         // TODO
            
    //         createNotification({
    //             text: "Successfully updated group role",
    //             type: "success"
    //         });
    //     } catch (err) {
    //         console.error(err);
            
    //         createNotification({
    //             text: "Failed to update group role",
    //             type: "error"
    //         });
    //     }
    // }
    
    return (
        <div>
            <Input
                value={searchGroupsFilter}
                onChange={(e) => setSearchGroupsFilter(e.target.value)}
                leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                placeholder="Search groups..."
            />
            <TableContainer className="mt-4">
                <Table>
                    <THead>
                        <Tr>
                            <Th>Name</Th>
                            <Th>Slug</Th>
                            <Th>Role</Th>
                            <Th className="w-5" />
                        </Tr>
                    </THead>
                    <TBody>
                        {isLoading && <TableSkeleton columns={4} innerKey="org-groups" />}
                        {!isLoading && groups?.map(({ id, name, slug }) => {
                            return (
                                <Tr className="h-10" key={`org-group-${id}`}>
                                    <Td>{name}</Td>
                                    <Td>{slug}</Td>
                                    <Td>N/A</Td>
                                    <Td>
                                        <div className="flex items-center justify-end">
                                            <OrgPermissionCan
                                                I={OrgPermissionActions.Edit}
                                                a={OrgPermissionSubjects.Groups}
                                            >
                                                {(isAllowed) => (
                                                    <Tooltip content="Edit group">
                                                        <IconButton
                                                            onClick={async () => {
                                                                handlePopUpOpen("group", {
                                                                    groupId: id,
                                                                    name,
                                                                    slug
                                                                });
                                                            }}
                                                            size="lg"
                                                            colorSchema="primary"
                                                            variant="plain"
                                                            ariaLabel="update"
                                                            isDisabled={!isAllowed}
                                                        >
                                                            <FontAwesomeIcon icon={faPencil} />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </OrgPermissionCan>
                                            <OrgPermissionCan
                                                I={OrgPermissionActions.Delete}
                                                a={OrgPermissionSubjects.Groups}
                                            >
                                                {(isAllowed) => (
                                                    <Tooltip content="Delete group">
                                                        <IconButton
                                                            onClick={() => {
                                                                console.log("Delete group");
                                                                handlePopUpOpen("deleteGroup", {
                                                                    slug,
                                                                    name
                                                                });
                                                            }}
                                                            size="lg"
                                                            colorSchema="danger"
                                                            variant="plain"
                                                            ariaLabel="update"
                                                            className="ml-4"
                                                            isDisabled={!isAllowed}
                                                        >
                                                            <FontAwesomeIcon icon={faXmark} />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </OrgPermissionCan>
                                        </div>
                                    </Td>
                                </Tr>
                            );
                        })}
                    </TBody>
                </Table>
                {groups?.length === 0 && (
                    <EmptyState title="No groups found" icon={faUsers} />
                )}
            </TableContainer>
        </div>
    );
}
