import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tr } from "@app/components/v2";
import { TSharedSecret } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

export const ShareSecretsRow = ({
  row,
  handlePopUpOpen
}: {
  row: TSharedSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSharedSecretConfirmation"]>,
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
    <Tr key={row.id} className="h-10">
      <Td>{`${row.encryptedValue.substring(0, 5)}...`}</Td>
      <Td>{format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}</Td>
      <Td>{format(new Date(row.expiresAt), "yyyy-MM-dd - HH:mm a")}</Td>
      <Td>{row.expiresAfterViews ? row.expiresAfterViews : "-"}</Td>
      <Td>
        <IconButton
          onClick={() =>
            handlePopUpOpen("deleteSharedSecretConfirmation", {
              name: "delete",
              id: row.id
            })
          }
          variant="plain"
          ariaLabel="delete"
        >
          <FontAwesomeIcon icon={faTrash} />
        </IconButton>
      </Td>
    </Tr>
  );
};
