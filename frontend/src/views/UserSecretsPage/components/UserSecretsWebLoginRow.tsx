import { faEdit, faExternalLink, faEye, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tr } from "@app/components/v2";
import { TUserSecret } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

export const UserSecretsWebLoginRow = ({
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
      {!row.isUsernameSecret && <Td>{row.username ? `${row.username}` : "-"}</Td>}
      {row.isUsernameSecret && (
        <Td>
          <span className="mr-2">
            {row.username ? "*".repeat(Math.min(row.username.length, 10)) : "-"}
          </span>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              handlePopUpOpen("showSecretData", {
                keyName: "Username",
                value: row.username || ""
              });
            }}
            variant="outline_bg"
            ariaLabel="edit"
          >
            <FontAwesomeIcon icon={faEye} />
          </IconButton>
        </Td>
      )}

      <Td>
        <span className="mr-2">
          {row.password ? "*".repeat(Math.min(row.password.length, 10)) : "-"}
        </span>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handlePopUpOpen("showSecretData", {
              keyName: "Password",
              value: row.password || ""
            });
          }}
          variant="outline_bg"
          ariaLabel="edit"
        >
          <FontAwesomeIcon icon={faEye} />
        </IconButton>
      </Td>
      {!row.loginURL && (
        <Td>
          <span>-</span>
        </Td>
      )}
      {row.loginURL && (
        <Td>
          <span>{row.loginURL}</span>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              window.open(row.loginURL!, "_blank");
            }}
            variant="outline_bg"
            ariaLabel="edit"
          >
            <FontAwesomeIcon icon={faExternalLink} />
          </IconButton>
        </Td>
      )}
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
