import { faTags, faTrashCan } from "@fortawesome/free-solid-svg-icons";
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
import { useGetWsTags } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteTagConfirmation"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
};

export const SecretTagsTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useGetWsTags(currentWorkspace?._id ?? "");

  return (
    <TableContainer className="mt-4">
      <Table>
        <THead>
          <Tr>
            <Th>Tag</Th>
            <Th>Slug</Th>
            <Th aria-label="button" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={3} innerKey="secret-tags" />}
          {!isLoading &&
            data &&
            data.map(({ _id, name, slug }) => (
              <Tr key={name}>
                <Td>{name}</Td>
                <Td>{slug}</Td>
                <Td className="flex items-center justify-end">
                  <IconButton
                    onClick={() =>
                      handlePopUpOpen("deleteTagConfirmation", {
                        name,
                        id: _id
                      })
                    }
                    colorSchema="danger"
                    ariaLabel="update"
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                  </IconButton>
                </Td>
              </Tr>
            ))}
          {!isLoading && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={3}>
                <EmptyState title="No secret tags found" icon={faTags} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
