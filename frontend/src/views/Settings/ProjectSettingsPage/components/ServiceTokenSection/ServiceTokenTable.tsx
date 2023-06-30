import { faKey, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetUserWsServiceTokens } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
    handlePopUpOpen: (
        popUpName: keyof UsePopUpState<["deleteAPITokenConfirmation"]>,
        {
            name,
            id
        }: {
            name: string;
            id: string;
        }
    ) => void;
};

export const ServiceTokenTable = ({
    handlePopUpOpen
}: Props) => {
    const { currentWorkspace } = useWorkspace();
    const { data, isLoading } = useGetUserWsServiceTokens({
        workspaceID: currentWorkspace?._id || ""
    });

    return (
        <TableContainer>
            <Table>
                <THead>
                    <Tr>
                    <Th>Token Name</Th>
                    <Th>Environment</Th>
                    <Th>Secret Path</Th>
                    <Th>Valid Until</Th>
                    <Th aria-label="button" />
                    </Tr>
                </THead>
                <TBody>
                    {isLoading && <TableSkeleton columns={4} key="project-service-tokens" />}
                    {!isLoading && data && data.map((row) => (
                        <Tr key={row._id}>
                            <Td>{row.name}</Td>
                            <Td>{row.environment}</Td>
                            <Td>{row.secretPath}</Td>
                            <Td>{row.expiresAt && new Date(row.expiresAt).toUTCString()}</Td>
                            <Td className="flex items-center justify-end">
                                <IconButton
                                onClick={() =>
                                    handlePopUpOpen("deleteAPITokenConfirmation", {
                                        name: row.name,
                                        id: row._id
                                    })
                                }
                                colorSchema="danger"
                                ariaLabel="delete"
                                >
                                <FontAwesomeIcon icon={faTrashCan} />
                                </IconButton>
                            </Td>
                        </Tr>
                    ))}
                    {!isLoading && data && data?.length === 0 && (
                        <Tr>
                            <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
                            <EmptyState title="No service tokens found" icon={faKey} />
                            </Td>
                        </Tr>
                    )}
                </TBody>
            </Table>
        </TableContainer> 
    );
}