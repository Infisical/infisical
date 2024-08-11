import { faEdit, faEye, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tr } from "@app/components/v2";
import { TUserSecret } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

export const UserSecretsSecureNotesRow = ({
  row,
  handlePopUpOpen
}: {
  row: TUserSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["showSecretData", "addOrUpdateUserSecret", "deleteUserSecretConfirmation"]
    >,
    popUpData: {
      keyName?: string;
      value?: string;
      name?: string;
      id?: string;
      isEditMode?: boolean;
      secretValue?: TUserSecret;
    }
  ) => void;
}) => {
  return (
    <Tr key={row.id}>
      <Td>{row.name ? `${row.name}` : "-"}</Td>
      <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
      <Td>
        <span>{row.secureNote ? "*".repeat(Math.min(row.secureNote.length, 50)) : "-"}</span>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handlePopUpOpen("showSecretData", {
              keyName: "Secure Note",
              value: row.secureNote || ""
            });
          }}
          variant="outline_bg"
          ariaLabel="edit"
        >
          <FontAwesomeIcon icon={faEye} />
        </IconButton>
      </Td>
      <Td>
        <div className="flex flex-row items-center justify-center space-x-1">
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              handlePopUpOpen("addOrUpdateUserSecret", {
                id: row.id,
                isEditMode: true,
                secretValue: row
              });
            }}
            variant="plain"
            ariaLabel="edit"
          >
            <FontAwesomeIcon icon={faEdit} />
          </IconButton>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              handlePopUpOpen("deleteUserSecretConfirmation", {
                name: row.name,
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
