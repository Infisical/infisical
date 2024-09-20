import { faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tr } from "@app/components/v2";
// import { useToggle } from "@app/hooks";
import { Badge } from "@app/components/v2/Badge";
import { TUserSecret } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

export const UserSecretsRow = ({
  row,
  handlePopUpOpen
}: {
  row: TUserSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteUserSecretConfirmation", "viewSecret"]>,
    args:
      | {
          name: string;
          id: string;
        }
      | TUserSecret
  ) => void;
}) => {
  return (
    <Tr key={row.id}>
      <Td>{row.name ? `${row.name}` : "-"}</Td>
      <Td>
        <Badge variant="success" className="uppercase">
          {row.secretType}
        </Badge>
      </Td>
      <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
      <Td>
        <div className="flex items-center gap-2">
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              handlePopUpOpen("viewSecret", row);
            }}
            variant="plain"
            ariaLabel="edit"
          >
            <FontAwesomeIcon icon={faPencil} />
          </IconButton>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              handlePopUpOpen("deleteUserSecretConfirmation", {
                name: row.name || "",
                id: row.id
              });
            }}
            variant="plain"
            ariaLabel="delete"
          >
            <FontAwesomeIcon icon={faTrash} />
          </IconButton>
        </div>
      </Td>
    </Tr>
  );
};
