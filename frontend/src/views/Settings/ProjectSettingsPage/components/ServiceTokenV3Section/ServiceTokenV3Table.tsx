import { faKey, faPencil,faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
import {
    ServiceTokenV3Scope
} from "@app/hooks/api/serviceTokens/types"
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
    handlePopUpOpen: (
      popUpName: keyof UsePopUpState<["deleteServiceTokenV3", "serviceTokenV3"]>,
      data?: {
        serviceTokenDataId?: string;
        name?: string;
        scopes?: ServiceTokenV3Scope[];
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
    
    const formatDate = (dateToFormat: string) => {
        const date = new Date(dateToFormat);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
    
        const formattedDate = `${day}/${month}/${year}`;
    
        return formattedDate;
    };
      
    return (
        <TableContainer>
            <Table>
                <THead>
                    <Tr>
                        <Th>Name</Th>
                        <Th>Status</Th>
                        <Th>Scopes</Th>
                        <Th>Last Used</Th>
                        <Th>Created At</Th>
                        <Th>Expires At</Th>
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
                        lastUsed,
                        scopes,
                        createdAt,
                        expiresAt
                    }) => {
                        return (
                            <Tr className="h-10" key={`st-v3-${_id}`}>
                                <Td>{name}</Td>
                                <Td>
                                    <Switch
                                        id={`enable-service-token-${_id}`}
                                        onCheckedChange={(value) => handleToggleServiceTokenDataStatus({
                                            serviceTokenDataId: _id,
                                            isActive: value
                                        })}
                                        isChecked={isActive}
                                    >
                                        <p className="w-12 mr-4">{isActive ? "Active" : "Inactive"}</p>
                                    </Switch>
                                </Td>
                                <Td>
                                    {scopes.map((scope) => {
                                        return (
                                            <p key={`service-token-${_id}-scope-${scope.environment}-${scope.secretPath}`}>
                                                <span className="font-bold">
                                                    {scope.permission}
                                                </span>
                                                {` @${scope.environment} - ${scope.secretPath}`}
                                            </p>
                                        );
                                    })}
                                </Td> 
                                <Td>{lastUsed ? formatDate(lastUsed) : "-"}</Td>
                                <Td>{formatDate(createdAt)}</Td>
                                <Td>{expiresAt ? formatDate(expiresAt) : "-"}</Td>
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
                                                        scopes,
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