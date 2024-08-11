import { faEdit, faEye, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tr } from "@app/components/v2";
import { TUserSecret } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

export const UserSecretsCreditCardsRow = ({
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
        <span>
          {row.cardNumber
            ? `${"x".repeat(Math.min(row.cardNumber.length, 12))} ${row.cardLastFourDigits}`
            : "-"}
        </span>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handlePopUpOpen("showSecretData", {
              keyName: "Card Number",
              value: row.cardNumber || ""
            });
          }}
          variant="outline_bg"
          ariaLabel="edit"
        >
          <FontAwesomeIcon icon={faEye} />
        </IconButton>
      </Td>
      <Td>
        <span>{row.cardExpiry ? "*".repeat(Math.min(row.cardExpiry.length, 5)) : "-"}</span>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            handlePopUpOpen("showSecretData", {
              keyName: "Expiry Date",
              value: row.cardExpiry || ""
            });
          }}
          variant="outline_bg"
          ariaLabel="edit"
        >
          <FontAwesomeIcon icon={faEye} />
        </IconButton>
      </Td>
      <Td>
        <span>{row.cardCvv ? "*".repeat(Math.min(row.cardCvv.length, 4)) : "-"}</span>
        {row.cardCvv && (
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              handlePopUpOpen("showSecretData", {
                keyName: "CVV",
                value: row.cardCvv || ""
              });
            }}
            variant="outline_bg"
            ariaLabel="edit"
          >
            <FontAwesomeIcon icon={faEye} />
          </IconButton>
        )}
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
