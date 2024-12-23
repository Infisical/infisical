import { useState } from "react";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { 
  faCopy, 
  faCreditCard,
  faEdit, 
  faEye, 
  faEyeSlash, 
  faGlobe,
  faNoteSticky,
  faTrash} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { UserSecret, UserSecretType } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  secret: UserSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteUserSecret" | "editUserSecret"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
  onEditSecret: (secret: UserSecret) => void;
};

const getSecretTypeIcon = (type: UserSecretType): IconProp => {
  switch (type) {
    case UserSecretType.WEB_LOGIN:
      return faGlobe;
    case UserSecretType.CREDIT_CARD:
      return faCreditCard;
    case UserSecretType.SECURE_NOTE:
      return faNoteSticky;
    default:
      throw new Error("Invalid secret type");
  }
};

const getSecretTypeLabel = (type: UserSecretType): string => {
  switch (type) {
    case UserSecretType.WEB_LOGIN:
      return "Web Login";
    case UserSecretType.CREDIT_CARD:
      return "Credit Card";
    case UserSecretType.SECURE_NOTE:
      return "Secure Note";
    default:
      throw new Error("Invalid secret type");
  }
};

const getSecretValue = (secret: UserSecret): string => {
  switch (secret.type) {
    case UserSecretType.WEB_LOGIN:
      return secret.data.password;
    case UserSecretType.CREDIT_CARD:
      return secret.data.cardNumber;
    case UserSecretType.SECURE_NOTE:
      return secret.data.content;
    default:
      throw new Error("Invalid secret type");
  }
};

export const UserSecretsRow = ({ secret, handlePopUpOpen, onEditSecret }: Props) => {
  const [isRevealed, setIsRevealed] = useState(false);

  const handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(getSecretValue(secret));
      createNotification({
        text: "Copied to clipboard",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to copy to clipboard",
        type: "error"
      });
    }
  };

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2">
          <FontAwesomeIcon 
            icon={getSecretTypeIcon(secret.type)} 
            className="text-bunker-300"
          />
          <span>{getSecretTypeLabel(secret.type)}</span>
        </div>
      </Td>
      <Td>{secret.name}</Td>
      <Td>{format(new Date(secret.updatedAt), "MMM d, yyyy")}</Td>
      <Td>{secret.createdBy}</Td>
      <Td>
        <div className="flex items-center justify-end gap-2">
          <Tooltip content={isRevealed ? "Hide" : "Show"}>
            <IconButton
              onClick={() => setIsRevealed(!isRevealed)}
              variant="plain"
              ariaLabel={isRevealed ? "hide secret" : "show secret"}
            >
              <FontAwesomeIcon icon={isRevealed ? faEyeSlash : faEye} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Copy">
            <IconButton
              onClick={handleCopyClick}
              variant="plain"
              ariaLabel="copy secret"
            >
              <FontAwesomeIcon icon={faCopy} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Edit">
            <IconButton
              onClick={() => onEditSecret(secret)}
              variant="plain"
              ariaLabel="edit secret"
            >
              <FontAwesomeIcon icon={faEdit} />
            </IconButton>
          </Tooltip>
          <Tooltip content="Delete">
            <IconButton
              onClick={() => handlePopUpOpen("deleteUserSecret", { 
                name: secret.name, 
                id: secret.id 
              })}
              variant="plain"
              ariaLabel="delete secret"
              className="text-red"
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </Tooltip>
        </div>
      </Td>
    </Tr>
  );
}; 