import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { 
  faCreditCard,
  faEdit, 
  faGlobe,
  faNoteSticky,
  faTrash} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { UserSecret, UserSecretType } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  secret: UserSecret;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteUserSecret" | "editUserSecret"]>,
    data: any
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

const formatDateTime = (date: string | Date) => {
  const d = new Date(date);
  return {
    date: d.toLocaleDateString(),
    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };
};

export const UserSecretsRow = ({ 
  secret, 
  handlePopUpOpen, 
  onEditSecret 
}: Props) => {
  const updatedAt = formatDateTime(secret.updatedAt);

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
      <Td>
        <div className="flex flex-col">
          <span>{updatedAt.date}</span>
          <span className="text-xs text-mineshaft-300">{updatedAt.time}</span>
        </div>
      </Td>
      <Td>{secret.createdBy}</Td>
      <Td>
        <div className="flex items-center justify-end gap-2">
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