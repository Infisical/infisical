/* eslint-disable no-nested-ternary */
/* eslint-disable no-extra-boolean-cast */
import { faCopy, faEye, faSpinner, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { Badge, IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { TSharedSecret, useRevealSecretRequestValue } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

export const RequestedSecretsRow = ({
  row,
  handlePopUpOpen
}: {
  row: TSharedSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSecretRequestConfirmation", "revealSecretRequestValue"]>,
    data: unknown
  ) => void;
}) => {
  const { mutateAsync: revealSecretValue, isPending } = useRevealSecretRequestValue();

  let isExpired = false;
  if (row.expiresAt !== null && new Date(row.expiresAt) < new Date()) {
    isExpired = true;
  }

  return (
    <Tr key={row.id}>
      <Td>{row.name ? `${row.name}` : "-"}</Td>
      <Td>
        {isExpired && !row.encryptedSecret ? (
          <Badge variant="danger">Expired</Badge>
        ) : (
          <Badge variant={row.encryptedSecret ? "success" : "primary"}>
            {row.encryptedSecret ? "Secret Provided" : "Pending Secret"}
          </Badge>
        )}
      </Td>
      <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
      <Td>{row.expiresAt ? format(new Date(row.expiresAt), "yyyy-MM-dd - HH:mm a") : "-"}</Td>
      <Td>
        <div className="flex items-center gap-2">
          <Tooltip
            content={
              row.encryptedSecret
                ? "Reveal shared secret"
                : "Secret value must be provided before it can be viewed."
            }
          >
            <IconButton
              isDisabled={!row.encryptedSecret}
              className={row.encryptedSecret ? "" : "opacity-50"}
              onClick={async (e) => {
                e.stopPropagation();

                const secretRequest = await revealSecretValue({
                  id: row.id
                });

                console.log("revealSecretRequestValue", {
                  secretValue: secretRequest.secretValue,
                  secretRequestName: secretRequest.name
                });

                handlePopUpOpen("revealSecretRequestValue", {
                  secretValue: secretRequest.secretValue,
                  secretRequestName: secretRequest.name
                });
              }}
              variant="plain"
              ariaLabel="reveal"
            >
              <FontAwesomeIcon
                className={isPending ? "animate-spin" : ""}
                icon={!isPending ? faEye : faSpinner}
              />
            </IconButton>
          </Tooltip>

          <IconButton
            isDisabled={Boolean(row.encryptedSecret) || isExpired}
            className={Boolean(row.encryptedSecret) || isExpired ? "opacity-50" : ""}
            onClick={async (e) => {
              e.stopPropagation();

              navigator.clipboard.writeText(
                `${window.location.origin}/secret-request/secret/${row.id}`
              );

              createNotification({
                text: "Shared secret link copied to clipboard.",
                type: "success"
              });
            }}
            variant="plain"
            ariaLabel="copy link"
          >
            <FontAwesomeIcon icon={faCopy} />
          </IconButton>

          <Tooltip content="Delete Secret Request">
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                handlePopUpOpen("deleteSecretRequestConfirmation", {
                  name: "delete",
                  id: row.id
                });
              }}
              variant="plain"
              ariaLabel="delete"
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </Tooltip>
        </div>
      </Td>
    </Tr>
  );
};
