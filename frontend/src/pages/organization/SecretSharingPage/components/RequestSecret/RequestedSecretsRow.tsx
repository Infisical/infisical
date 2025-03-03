import { faCopy, faEye, faSpinner, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { Badge, IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import {
  SecretSharingAccessType,
  TSharedSecret,
  useRevealSecretRequestValue
} from "@app/hooks/api/secretSharing";
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
      <Td>
        <Badge variant="primary">
          <Tooltip
            content={
              row.accessType === SecretSharingAccessType.Anyone
                ? "Anyone can input the secret."
                : "Only members of the organization can input the secret."
            }
          >
            <div>
              {row.accessType === SecretSharingAccessType.Anyone
                ? "Anyone"
                : "Organization Members"}
            </div>
          </Tooltip>
        </Badge>
      </Td>
      <Td>{`${format(new Date(row.createdAt), "yyyy-MM-dd - HH:mm a")}`}</Td>
      <Td>{row.expiresAt ? format(new Date(row.expiresAt), "yyyy-MM-dd - HH:mm a") : "-"}</Td>
      <Td>
        <div className="flex items-center gap-2">
          <Tooltip
            content={
              row.encryptedSecret
                ? "Reveal secret"
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

          <Tooltip content="Copy link">
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
          </Tooltip>

          <Tooltip content="Delete">
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
