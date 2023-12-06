import { faKey,faPencil,faServer, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
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
    Tooltip,
    Tr} from "@app/components/v2";
import { 
    OrgPermissionActions,
    OrgPermissionSubjects,
    useOrganization} from "@app/context";
import {
    useGetMachineMembershipOrgs,
    useGetRoles,
    useUpdateMachineIdentity,
} from "@app/hooks/api";
import { MachineTrustedIp } from "@app/hooks/api/machineIdentities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
    handlePopUpOpen: (
      popUpName: keyof UsePopUpState<["deleteMachineIdentity", "machineIdentity", "clientSecret"]>,
      data?: {
        machineId?: string;
        name?: string;
        role?: string;
        customRole?: {
            name: string;
            slug: string;
        };
        clientSecretTrustedIps?: MachineTrustedIp[];
        accessTokenTrustedIps?: MachineTrustedIp[];
        accessTokenMaxTTL?: number;
        accessTokenTTL?: number;
        accessTokenNumUsesLimit?: number;
      }
    ) => void;
  };

export const MachineIdentityTable = ({
    handlePopUpOpen
}: Props) => {
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?._id || "";

    const { mutateAsync: updateMutateAsync } = useUpdateMachineIdentity();
    const { data, isLoading } = useGetMachineMembershipOrgs(currentOrg?._id || "");
    
    const { data: roles } = useGetRoles({
        orgId
    });
    
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
                role
            });
            
            createNotification({
                text: "Successfully updated machine identity role",
                type: "success"
            });
        } catch (err) {
            console.error(err);
            const error = err as any;
            const text = error?.response?.data?.message ?? "Failed to update machine identity role"
            
            createNotification({
                text,
                type: "error"
              });
        }
    }

    // const handleToggleStatus = async ({
    //     serviceTokenDataId,
    //     isActive
    // }: {
    //     serviceTokenDataId: string;
    //     isActive: boolean;
    // }) => {
    //     try {
    //         await updateMutateAsync({
    //             serviceTokenDataId,
    //             isActive
    //         });

    //         createNotification({
    //             text: `Successfully ${isActive ? "enabled" : "disabled"} machine identity`,
    //             type: "success"
    //           });
    //     } catch (err) {
    //         console.log(err);
    //         createNotification({
    //             text: `Failed to ${isActive ? "enable" : "disable"} machine identity`,
    //             type: "error"
    //         });
    //     }
    // }
      
    return (
        <TableContainer>
            <Table>
                <THead>
                    <Tr>
                        <Th>Name</Th>
                        <Th>Client ID</Th>
                        {/* <Th>Status</Th> */}
                        <Th>Role</Th>
                        {/* <Th>Trusted IPs</Th> */}
                        {/* <Th>Access Token TTL</Th> */}
                        {/* <Th>Created At</Th> */}
                        {/* <Th>Valid Until</Th> */}
                        <Th className="w-5" />
                    </Tr>
                </THead>
                <TBody>
                    {isLoading && <TableSkeleton columns={7} innerKey="org-machine-identities" />}
                    {!isLoading &&
                    data &&
                    data.length > 0 &&
                    data.map(({
                        machineIdentity: {
                            _id,
                            name,
                            clientId,
                            // isActive,
                            clientSecretTrustedIps,
                            accessTokenTrustedIps,
                            // createdAt,
                            // expiresAt,
                            accessTokenMaxTTL,
                            accessTokenTTL,
                            accessTokenNumUsesLimit
                        },
                        role,
                        customRole
                    }) => {
                        return (
                            <Tr className="h-10" key={`machine-identity-${_id}`}>
                                <Td>{name}</Td>
                                <Td>{clientId}</Td>
                                <Td>
                                    <OrgPermissionCan
                                        I={OrgPermissionActions.Edit}
                                        a={OrgPermissionSubjects.MachineIdentity}
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
                                    </OrgPermissionCan>
                                </Td> 
                                <Td>
                                    <div className="flex justify-end items-center">
                                    <Tooltip content="Manage client secrets">
                                        <IconButton
                                            onClick={async () => {
                                                handlePopUpOpen("clientSecret", {
                                                    machineId: _id,
                                                    name
                                                });
                                            }}
                                            size="lg"
                                            colorSchema="primary"
                                            variant="plain"
                                            ariaLabel="update"
                                            // isDisabled={!isAllowed}
                                        >
                                            <FontAwesomeIcon icon={faKey} />
                                        </IconButton>
                                    </Tooltip>
                                    <OrgPermissionCan
                                        I={OrgPermissionActions.Edit}
                                        a={OrgPermissionSubjects.MachineIdentity}
                                    >
                                        {(isAllowed) => (
                                            <IconButton
                                                onClick={async () => {
                                                    handlePopUpOpen("machineIdentity", {
                                                        machineId: _id,
                                                        name,
                                                        role,
                                                        customRole,
                                                        clientSecretTrustedIps,
                                                        accessTokenTrustedIps,
                                                        accessTokenTTL,
                                                        accessTokenMaxTTL,
                                                        accessTokenNumUsesLimit
                                                    });
                                                }}
                                                size="lg"
                                                colorSchema="primary"
                                                variant="plain"
                                                ariaLabel="update"
                                                className="ml-4"
                                                isDisabled={!isAllowed}
                                            >
                                                <FontAwesomeIcon icon={faPencil} />
                                            </IconButton>
                                        )}
                                    </OrgPermissionCan>
                                    <OrgPermissionCan
                                        I={OrgPermissionActions.Delete}
                                        a={OrgPermissionSubjects.MachineIdentity}
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
                                    </OrgPermissionCan>
                                    </div>
                                </Td>
                            </Tr>
                        );
                    })}
                    {!isLoading && data && data?.length === 0 && (
                        <Tr>
                            <Td colSpan={7}>
                                <EmptyState title="No machine identities have been created in this organization" icon={faServer} />
                            </Td>
                        </Tr>
                    )}
                </TBody>
            </Table>
        </TableContainer>
    );
}