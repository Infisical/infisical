import { faEdit,faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tr } from "@app/components/v2";
import { TUserSecrets } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";


type UserSecretsRowProps = {
  row: TUserSecrets;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["editCredentials", "deleteSharedSecretConfirmation"]>, data?: any) => void;
}

export const UserSecretsRow = ({ row, handlePopUpOpen }: UserSecretsRowProps) => {



  const handleEditClick = () => {
    handlePopUpOpen("editCredentials", { data: row });
  };



  return (
    <>
      <Tr
        key={row.id}
        // className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
        // onClick={() => setIsRowExpanded.toggle()}
      >
        <Td>{row.username ? `${row.username}` : "-"}</Td>
        <Td>
         {row.type}
        </Td>
        <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
        <Td>{format(new Date(row.updatedAt), "yyyy-MM-dd - HH:mm a")}</Td>
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
