import { useCallback } from "react";
import { faServer, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
    EmptyState,
    IconButton,
    Select,
    SelectItem,
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
    ProjectPermissionActions, 
    ProjectPermissionSub, 
    useOrganization,
    useWorkspace,
} from "@app/context";
import {
    useGetRoles,
    useGetWorkspaceServiceMemberships} from "@app/hooks/api";
import { ServiceTokenV3TrustedIp } from "@app/hooks/api/serviceTokens/types"
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
    handlePopUpOpen: (
      popUpName: keyof UsePopUpState<["deleteServiceTokenV3", "serviceTokenV3"]>,
      data?: {
        serviceTokenDataId?: string;
        name?: string;
        role?: string;
        customRole?: {
            name: string;
            slug: string;
        };
        trustedIps?: ServiceTokenV3TrustedIp[];
        accessTokenTTL?: number;
        isRefreshTokenRotationEnabled?: boolean;
      }
    ) => void;
};

// TODO: update roles thing here
export const ServiceTokenV3Table = ({
    handlePopUpOpen
}: Props) => {
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const { currentWorkspace } = useWorkspace();
    const orgId = currentOrg?._id || "";
    const workspaceId = currentWorkspace?._id || "";

    const { data, isLoading } = useGetWorkspaceServiceMemberships(currentWorkspace?._id || "");

    const { data: roles } = useGetRoles({
        orgId,
        workspaceId
    });

    const handleChangeRole = async ({
        serviceTokenDataId,
        role
    }: {
        serviceTokenDataId: string;
        role: string;
    }) => {

        try {
            
            console.log("handle project-level role change vals: ", {
                serviceTokenDataId,
                role
            });
            
            // await updateMutateAsync({
            //     serviceTokenDataId,
            //     role
            // });
            
            createNotification({
                text: "Successfully updated service account role",
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to update service account role",
                type: "error"
              });
        }
    }

    const findRoleFromId = useCallback(
        (roleId: string) => {
            return (roles || []).find(({ _id: id }) => id === roleId);
        },
        [roles]
    );
      
    return (
        <TableContainer>
            <Table>
                <THead>
                    <Tr>
                        <Th>Name</Th>
                        <Th>Role</Th>
                        <Th>Added on</Th>
                        <Th className="w-5" />
                    </Tr>
                </THead>
                <TBody>
                    {isLoading && <TableSkeleton columns={7} innerKey="service-tokens" />}
                    {!isLoading &&
                    data &&
                    data.length > 0 &&
                    data.map(({
                        service: {
                            _id,
                            name
                        },
                        role,
                        customRole,
                        createdAt
                    }) => {
                        return (
                            <Tr className="h-10" key={`st-v3-${_id}`}>
                                <Td>{name}</Td>
                                <Td>
                                    <ProjectPermissionCan
                                        I={ProjectPermissionActions.Edit}
                                        a={ProjectPermissionSub.ServiceTokens}
                                    >
                                        {(isAllowed) => {
                                            return (
                                                <Select
                                                    value={
                                                        role === "custom" ? findRoleFromId(customRole)?.slug : role
                                                    }
                                                    isDisabled={!isAllowed}
                                                    className="w-40 bg-mineshaft-600"
                                                    dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                                                    onValueChange={(selectedRole) => 
                                                        handleChangeRole({
                                                            serviceTokenDataId: _id,
                                                            role: selectedRole
                                                        })
                                                    }
                                                >
                                                    {(roles || [])
                                                        .map(({ slug, name: roleName }) => (
                                                            <SelectItem value={slug} key={`owner-option-${slug}`}>
                                                            {roleName}
                                                            </SelectItem>
                                                        ))}
                                                </Select>
                                            );
                                        }}
                                    </ProjectPermissionCan>
                                </Td> 
                                <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                                <Td className="flex justify-end">
                                    <ProjectPermissionCan
                                        I={ProjectPermissionActions.Delete}
                                        a={ProjectPermissionSub.ServiceTokens}
                                    >
                                        {(isAllowed) => (
                                            <IconButton
                                                onClick={() => {
                                                    handlePopUpOpen("deleteServiceTokenV3", {
                                                        serviceTokenDataId: _id,
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
                                        )}
                                    </ProjectPermissionCan>
                                </Td>
                            </Tr>
                        );
                    })}
                    {!isLoading && data && data?.length === 0 && (
                        <Tr>
                            <Td colSpan={7}>
                                <EmptyState title="No service accounts have been added to this project" icon={faServer} />
                            </Td>
                        </Tr>
                    )}
                </TBody>
            </Table>
        </TableContainer>
    );
}