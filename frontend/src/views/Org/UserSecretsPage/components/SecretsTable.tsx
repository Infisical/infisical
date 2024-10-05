import { useState } from "react";
import { faEdit, faEye, faTrash } from "@fortawesome/free-solid-svg-icons";
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

  const [showSecretId, setShowSecretId] = useState<string>("");

  const onCLickShow = (id: string) => {
    setShowSecretId(id)
    setTimeout(() => {
      setShowSecretId("")
    }, 3000);
  }

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            {columns.map((column) => (
              <Th key={column}>{column}</Th>
            ))}
            <Th aria-label="button" className="w-5" />
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
                {Object.values(secret.fields).map((value, i) => {
                  if(showSecretId === secret.id){
                    return (
                      // eslint-disable-next-line
                      <Td key={`secret-${value}-${i}`}>{value}</Td>
                    )
                  }
                  
                    return (
                      (
                        // eslint-disable-next-line
                        <Td key={`secret-${value}-${i}`} className="blur">xxxxxxx</Td>
                      )
                    )
                  
                })}
                <Td>
                  <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onCLickShow(secret.id)
                      }}
                      variant="plain"
                      ariaLabel="edit"
                    >
                    <FontAwesomeIcon icon={faEye} />
                  </IconButton>
                </Td>
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
