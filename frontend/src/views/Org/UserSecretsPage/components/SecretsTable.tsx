import { faTrash } from "@fortawesome/free-solid-svg-icons";
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
  Tr} from "@app/components/v2";

type Props = {
  columns: string[];
  isLoading: boolean;
  secrets: {
    [key in string]: string;
  }[];
};

const SecretsTable = (props: Props) => {
  const { columns, isLoading, secrets } = props;

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            {columns.map((column, index) => (
              // eslint-disable-next-line
              <Th key={`th-${index}`}>{column}</Th>
            ))}
            <Th aria-label="button" className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={7} innerKey="shared-secrets" />}
          {!isLoading &&
            secrets.map((secret, index) => (
              // eslint-disable-next-line
              <Tr key={`tr-${index}`}
                className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
                // onClick={() => setIsRowExpanded.toggle()}
              >
                {Object.values(secret).map((value, i) => (
                  // eslint-disable-next-line
                  <Td key={`secret-${value}-${i}`}>{value}</Td>
                ))}
                <Td>
                  <IconButton
                    // onClick={(e) => {
                    //   e.stopPropagation();
                    //   handlePopUpOpen("deleteSharedSecretConfirmation", {
                    //     name: "delete",
                    //     id: row.id
                    //   });
                    // }}
                    variant="plain"
                    ariaLabel="delete"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </Td>
              </Tr>
            ))}
        </TBody>
      </Table>
    </TableContainer>
  );
};

export default SecretsTable;
