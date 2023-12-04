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
    useGetWorkspaceMachineMemberships,
    useUpdateMachineWorkspaceRole
} from "@app/hooks/api";
import { MachineTrustedIp} from "@app/hooks/api/machineIdentities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
    handlePopUpOpen: (
      popUpName: keyof UsePopUpState<["deleteMachineIdentity", "machineIdentity"]>,
      data?: {
        machineId?: string;
        name?: string;
        role?: string;
        customRole?: {
            name: string;
            slug: string;
        };
        trustedIps?: MachineTrustedIp[];
        accessTokenTTL?: number;
        isRefreshTokenRotationEnabled?: boolean;
      }
    ) => void;
};

export const MachineIdentityTable = ({
    handlePopUpOpen
}: Props) => {
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const { currentWorkspace } = useWorkspace();
    const orgId = currentOrg?._id || "";
    const workspaceId = currentWorkspace?._id || "";

    const { data, isLoading } = useGetWorkspaceMachineMemberships(currentWorkspace?._id || "");

    const { data: roles } = useGetRoles({
        orgId,
        workspaceId
    });

    const { mutateAsync: updateMutateAsync } = useUpdateMachineWorkspaceRole();

    const handleChangeRole = async ({
        machineId,
        role
    }: {
        machineId: string;
        role: string;
    }) => {
        try {

            await updateMutateAsync({
                machineId,
                workspaceId,
                role
            });
            
            createNotification({
                text: "Successfully updated machine identity role",
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to update machine identity role",
                type: "error"
              });
        }
    }
      
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
                    {isLoading && <TableSkeleton columns={7} innerKey="project-machine-identities" />}
                    {!isLoading &&
                    data &&
                    data.length > 0 &&
                    data.map(({
                        machineIdentity: {
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
                                        a={ProjectPermissionSub.MachineIdentity}
                                    >
                                        {(isAllowed) => {
                                            return (
                                                <Select
                                                    value={
                                                        role === "custom" ? (customRole?.slug as string) : role
                                                    }
                                                    isDisabled={!isAllowed}
                                                    className="w-40 bg-mineshaft-600"
                                                    dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                                                    onValueChange={(selectedRole) => 
                                                        handleChangeRole({
                                                            machineId: _id,
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
                                        a={ProjectPermissionSub.MachineIdentity}
                                    >
                                        {(isAllowed) => (
                                            <IconButton
                                                onClick={() => {
                                                    handlePopUpOpen("deleteMachineIdentity", {
                                                        machineId: _id,
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
                                <EmptyState title="No app clients have been added to this project" icon={faServer} />
                            </Td>
                        </Tr>
                    )}
                </TBody>
            </Table>
        </TableContainer>
    );
}