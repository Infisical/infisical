import { faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tr } from "@app/components/v2";
import { TUserSecrets } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";


type UserSecretsRowProps = {
  row: TUserSecrets;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["editCredentials", "deleteUserSecretConfirmation"]>, data?: any) => void;
}

export const UserSecretsRow = ({ row, handlePopUpOpen }: UserSecretsRowProps) => {



  const handleEditClick = () => {
    handlePopUpOpen("editCredentials", { data: row });
  };



  return (
    <>
      <Tr
        key={row.id}
      >
        <Td>{row.title}</Td>
        <Td>
          {row.type}
        </Td>
        <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
        <Td>{format(new Date(row.updatedAt), "yyyy-MM-dd - HH:mm a")}</Td>
        <Td>
          <div className="flex items-center justify-start space-x-2">




            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                handleEditClick();
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
                  name: "delete",
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
    </>
  );
};
