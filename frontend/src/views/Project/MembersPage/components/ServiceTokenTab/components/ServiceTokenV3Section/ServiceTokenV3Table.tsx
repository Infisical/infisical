import { faKey, faPencil,faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
    EmptyState,
    IconButton,
    Switch,
    Table,
    TableContainer,
    TableSkeleton,
    TBody,
    Td,
    Th,
    THead,
    Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub , useWorkspace } from "@app/context";
import {
    useGetWorkspaceServiceTokenDataV3,
    useUpdateServiceTokenV3
} from "@app/hooks/api";
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

export const ServiceTokenV3Table = ({
    handlePopUpOpen
}: Props) => {
    const { createNotification } = useNotificationContext();
    const { currentWorkspace } = useWorkspace();
    const { data, isLoading } = useGetWorkspaceServiceTokenDataV3(currentWorkspace?._id || "");
    const { mutateAsync: updateMutateAsync } = useUpdateServiceTokenV3();

    const handleToggleServiceTokenDataStatus = async ({
        serviceTokenDataId,
        isActive
    }: {
        serviceTokenDataId: string;
        isActive: boolean;
    }) => {
        try {
            await updateMutateAsync({
                serviceTokenDataId,
                isActive
            });

            createNotification({
                text: `Successfully ${isActive ? "enabled" : "disabled"} service token v3`,
                type: "success"
              });
        } catch (err) {
            console.log(err);
            createNotification({
                text: `Failed to ${isActive ? "enable" : "disable"} service token v3`,
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
                        <Th>Status</Th>
                        <Th>Role</Th>
                        <Th>Trusted IPs</Th>
                        <Th>Access Token TTL</Th>
                        <Th>Created At</Th>
                        <Th>Valid Until</Th>
                        <Th className="w-5" />
                    </Tr>
                </THead>
                <TBody>
                    {isLoading && <TableSkeleton columns={7} innerKey="service-tokens" />}
                    {!isLoading &&
                    data &&
                    data.length > 0 &&
                    data.map(({
                        _id,
                        name,
                        isActive,
                        role,
                        customRole,
                        trustedIps,
                        createdAt,
                        expiresAt,
                        accessTokenTTL,
                        isRefreshTokenRotationEnabled
                    }) => {
                        return (
                            <Tr className="h-10" key={`st-v3-${_id}`}>
                                <Td>{name}</Td>
                                <Td>
                                    <ProjectPermissionCan
                                        I={ProjectPermissionActions.Edit}
                                        a={ProjectPermissionSub.ServiceTokens}
                                    >
                                        {(isAllowed) => (
                                            <Switch
                                                id={`enable-service-token-${_id}`}
                                                onCheckedChange={(value) => handleToggleServiceTokenDataStatus({
                                                    serviceTokenDataId: _id,
                                                    isActive: value
                                                })}
                                                isChecked={isActive}
                                                isDisabled={!isAllowed}
                                            >
                                                <p className="w-12 mr-4">{isActive ? "Active" : "Inactive"}</p>
                                            </Switch>
                                        )}
                                    </ProjectPermissionCan>
                                </Td>
                                <Td>{customRole?.slug ?? role}</Td> 
                                <Td>
                                    {trustedIps.map(({
                                        _id: trustedIpId,
                                        ipAddress,
                                        prefix
                                    }) => {
                                        return (
                                            <p key={`service-token-${_id}-}-trusted-ip-${trustedIpId}`}>
                                                {`${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`}
                                            </p>
                                        );
                                    })}
                                </Td> 
                                <Td>{accessTokenTTL}</Td>
                                <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                                <Td>{expiresAt ? format(new Date(expiresAt), "yyyy-MM-dd") : "-"}</Td>
                                <Td className="flex justify-end">
                                    <ProjectPermissionCan
                                        I={ProjectPermissionActions.Edit}
                                        a={ProjectPermissionSub.ServiceTokens}
                                    >
                                        {(isAllowed) => (
                                            <IconButton
                                                onClick={async () => {
                                                    handlePopUpOpen("serviceTokenV3", {
                                                        serviceTokenDataId: _id,
                                                        name,
                                                        role,
                                                        customRole,
                                                        trustedIps,
                                                        accessTokenTTL,
                                                        isRefreshTokenRotationEnabled
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
                                        )}
                                    </ProjectPermissionCan>
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
                                <EmptyState title="No service token v3 on file" icon={faKey} />
                            </Td>
                        </Tr>
                    )}
                </TBody>
            </Table>
        </TableContainer>
    );
}