import { faPen, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Td, Tr } from "@app/components/v2";
// import { useToggle } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { TUserSecret } from "@app/hooks/api/userSecrets/types";

export const UserSecretsRow = ({
  row,
  handlePopUpOpen
}: {
  row: TUserSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteUserSecretsConfirmation", "updateUserSecrets"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
}) => {
  return (
    <>
      <Tr
        key={row.id}
        // className="h-10 cursor-pointer transition-colors duration-300 hover:bg-mineshaft-700"
        // onClick={() => setIsRowExpanded.toggle()}
      >
        <Td>{row.title ? `${row.title}` : "-"}</Td>
        <Td>{row.content ? `${row.content}` : "-"}</Td>
        <Td>{row.username ? `${row.username}` : "-"}</Td>
        <Td>{row.password ? `${row.password}` : "-"}</Td>
        <Td>{row.cardNumber ? `${row.cardNumber}` : "-"}</Td>
        <Td>{row.expiryDate ? `${row.expiryDate}` : "-"}</Td>
        <Td>{row.cvv ? `${row.cvv}` : "-"}</Td>
        <Td>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              handlePopUpOpen("updateUserSecrets", {
                name: "update",
                id: row.id
              });
            }}
            variant="plain"
            ariaLabel="update"
          >
            <FontAwesomeIcon icon={faPen} />
          </IconButton>
        </Td>
        <Td>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              handlePopUpOpen("deleteUserSecretsConfirmation", {
                name: "delete",
                id: row.id
              });
            }}
            variant="plain"
            ariaLabel="delete"
          >
            <FontAwesomeIcon icon={faTrash} />
          </IconButton>
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
