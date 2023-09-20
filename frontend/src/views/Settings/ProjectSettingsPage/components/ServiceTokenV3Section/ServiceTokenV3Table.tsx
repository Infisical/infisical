import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faXmark, faPencil } from "@fortawesome/free-solid-svg-icons";
import { useWorkspace } from "@app/context";
import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
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
import {
    useGetWorkspaceServiceTokenDataV3,
    useUpdateServiceTokenV3,
    useDeleteServiceTokenV3
} from "@app/hooks/api";

export const ServiceTokenV3Table = () => {
    const { createNotification } = useNotificationContext();
    const { currentWorkspace } = useWorkspace();
    const { data, isLoading } = useGetWorkspaceServiceTokenDataV3(currentWorkspace?._id || "");
    const { mutateAsync: updateMutateAsync } = useUpdateServiceTokenV3();
    const { mutateAsync: deleteMutateAsync } = useDeleteServiceTokenV3();
    
    console.log("data1: ", data);
    
    const handleDeleteServiceTokenData = async (serviceTokenDataId: string) => {
        try {
            await deleteMutateAsync({
                serviceTokenDataId 
            });
            createNotification({
                text: "Successfully deleted service token v3",
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to delete service token v3",
                type: "error"
            });
        }
    }
    
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
                        <Th>Last Active</Th>
                        <Th>Created</Th>
                        <Th>Expiration</Th>
                        <Th className="w-5"></Th>
                    </Tr>
                </THead>
                <TBody>
                    {isLoading && <TableSkeleton columns={5} innerKey="service-tokens" />}
                    {!isLoading &&
                    data &&
                    data.length > 0 &&
                    data.map(({
                        _id,
                        name,
                        isActive,
                        lastUsed,
                        createdAt,
                        // expiresAt
                    }) => {
                        return (
                            <Tr className="h-10" key={`st-v3-${_id}`}>
                                <Td>{name}</Td>
                                <Td>
                                <Switch
                                    id="test"
                                    // id={`enable-${authMethodOpt.value}-auth`}
                                    onCheckedChange={(value) => handleToggleServiceTokenDataStatus({
                                        serviceTokenDataId: _id,
                                        isActive: value
                                    })}
                                    isChecked={isActive}
                                >
                                    <p className="w-12 mr-4">{isActive ? "Active" : "Inactive"}</p>
                                </Switch>
                                </Td>
                                <Td>{lastUsed ? formatDate(lastUsed) : "-"}</Td>
                                <Td>{formatDate(createdAt)}</Td>
                                <Td>{formatDate(createdAt)}</Td>
                                <Td className="flex justify-end">
                                    <IconButton
                                        onClick={async () => {
                                            console.log("edit");
                                        }}
                                        size="lg"
                                        colorSchema="primary"
                                        variant="plain"
                                        ariaLabel="update"
                                        >
                                        <FontAwesomeIcon icon={faPencil} />
                                    </IconButton>
                                    <IconButton
                                        onClick={() => handleDeleteServiceTokenData(_id)}
                                        size="lg"
                                        colorSchema="danger"
                                        variant="plain"
                                        ariaLabel="update"
                                        className="ml-4"
                                        >
                                        <FontAwesomeIcon icon={faXmark} />
                                    </IconButton>
                                </Td>
                            </Tr>
                        );
                    })}
                    {!isLoading && data && data?.length === 0 && (
                        <Tr>
                            <Td colSpan={5}>
                                <EmptyState title="No service token v3 on file" icon={faKey} />
                            </Td>
                        </Tr>
                    )}
                </TBody>
            </Table>
        </TableContainer>
    );
}