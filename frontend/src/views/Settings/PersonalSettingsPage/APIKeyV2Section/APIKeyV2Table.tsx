import { faKey, faPencil, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

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
import {
    useGetMyAPIKeysV2
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
    handlePopUpOpen: (
      popUpName: keyof UsePopUpState<["deleteAPIKeyV2", "apiKeyV2"]>,
      data?: {
        apiKeyDataId?: string;
        name?: string;
      }
    ) => void;
  };

export const APIKeyV2Table = ({
    handlePopUpOpen
}: Props) => {
    const { data, isLoading } = useGetMyAPIKeysV2();
    return (
        <TableContainer>
            <Table>
                <THead>
                    <Tr>
                        <Th className="">Name</Th>
                        <Th className="">Last Used</Th>
                        <Th className="">Created At</Th>
                        <Th className="w-5" />
                    </Tr>
                </THead>
                <TBody>
                    {isLoading && <TableSkeleton columns={4} innerKey="api-keys-v2" />}
                    {!isLoading && 
                    data && 
                    data.length > 0 && 
                    data.map(({
                        _id,
                        name,
                        lastUsed,
                        createdAt
                    }) => {
                        return (
                            <Tr className="h-10" key={`api-key-v2-${_id}`}>
                                <Td>{name}</Td>
                                <Td>{lastUsed ? format(new Date(lastUsed), "yyyy-MM-dd") : "-"}</Td>
                                <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                                <Td className="flex justify-end">
                                    <IconButton
                                        onClick={async () => {
                                            handlePopUpOpen("apiKeyV2", {
                                                apiKeyDataId: _id,
                                                name
                                            });
                                        }}
                                        size="lg"
                                        colorSchema="primary"
                                        variant="plain"
                                        ariaLabel="update"
                                    >
                                        <FontAwesomeIcon icon={faPencil} />
                                    </IconButton>
                                    <IconButton
                                        onClick={() => {
                                            handlePopUpOpen("deleteAPIKeyV2", {
                                                apiKeyDataId: _id
                                            });
                                        }}
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
                            <Td colSpan={4}>
                                <EmptyState title="No API key v2 on file" icon={faKey} />
                            </Td>
                        </Tr>
                    )}
                </TBody>
            </Table>
        </TableContainer>
    );
}