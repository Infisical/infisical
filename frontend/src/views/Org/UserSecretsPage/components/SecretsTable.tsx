import { faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
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
import { Secrets } from "@app/hooks/api/userSecrets/types";

type Props = {
  columns: string[];
  isLoading: boolean;
  secrets?: Secrets;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
};

const SecretsTable = (props: Props) => {
  const { columns, isLoading, secrets, onDelete, onEdit } = props;

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            {columns.map((column) => (
              <Th key={column}>{column}</Th>
            ))}
            {onEdit && (<Th aria-label="button" className="w-5" />)}
            {onDelete && (<Th aria-label="button" className="w-5" />)}
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={7} innerKey="shared-secrets" />}
          {!isLoading &&
            secrets?.map((secret) => (
              <Tr
                key={secret.id}
                className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
              >
                {Object.values(secret.fields).map((value, i) => (
                  // eslint-disable-next-line
                  <Td key={`secret-${value}-${i}`}>{value}</Td>
                ))}
                {onEdit && (
                  <Td>
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(secret.id);
                      }}
                      variant="plain"
                      ariaLabel="edit"
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </IconButton>
                  </Td>
                )}
                {onDelete && (
                  <Td>
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(secret.id);
                      }}
                      variant="plain"
                      ariaLabel="delete"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </Td>
                )}
              </Tr>
            ))}
        </TBody>
      </Table>
    </TableContainer>
  );
};

export default SecretsTable;
