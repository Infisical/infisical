import { faEdit,faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tr } from "@app/components/v2";
import { Badge } from "@app/components/v2/Badge";
import { TUserSecret } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";


type UserSecretsRowProps = {
  row: TUserSecret;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["editCredentials", "deleteSharedSecretConfirmation"]>, data?: any) => void;
}

export const UserSecretsRow = ({ row, handlePopUpOpen }: UserSecretsRowProps) => {



  const handleEditClick = () => {
    handlePopUpOpen("editCredentials", { data: row });
  };


  let isExpired = false;

  if (row.expiresAt !== null && new Date(row.expiresAt) < new Date()) {
    isExpired = true;
  }

  return (
    <>
      <Tr
        key={row.id}
        // className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
        // onClick={() => setIsRowExpanded.toggle()}
      >
        <Td>{row.name ? `${row.name}` : "-"}</Td>
        <Td>
          <Badge variant={isExpired ? "danger" : "success"}>
            {isExpired ? "Expired" : "Active"}
          </Badge>
        </Td>
        <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
        <Td>{format(new Date(row.expiresAt), "yyyy-MM-dd - HH:mm a")}</Td>
        {/* <Td>{row.expiresAfterViews !== null ? row.expiresAfterViews : "-"}</Td> */}
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
        handlePopUpOpen("deleteSharedSecretConfirmation", {
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
      {/* {isRowExpanded && (
        <Tr>
          <Td
            colSpan={6}
            className={`bg-bunker-600 px-0 py-0 ${isRowExpanded && " border-mineshaft-500 p-8"}`}
          >
            <div className="grid grid-cols-3 gap-4">
              <div>Test 1</div>
              <div>Test 2</div>
              <div>Test 3</div>
            </div>
          </Td>
        </Tr>
      )} */}
    </>
  );
};
