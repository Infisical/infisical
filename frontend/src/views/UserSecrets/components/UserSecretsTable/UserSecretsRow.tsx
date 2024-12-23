import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { 
  faCreditCard,
  faEdit, 
  faEye, 
  faEyeSlash, 
  faGlobe,
  faNoteSticky,
  faTrash} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { IconButton, Td, Tooltip, Tr } from "@app/components/v2";
import { UserSecret, UserSecretType } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { SecretDetailsView } from "../SecretDetailsView";

type Props = {
  secret: UserSecret;
  popUp: UsePopUpState<["deleteUserSecret" | "editUserSecret" | "viewUserSecret"]>;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteUserSecret" | "editUserSecret" | "viewUserSecret"]>,
    data: any
  ) => void;
  handlePopUpClose: (
    popUpName: keyof UsePopUpState<["deleteUserSecret" | "editUserSecret" | "viewUserSecret"]>
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

export const UserSecretsRow = ({ 
  secret, 
  popUp,
  handlePopUpOpen, 
  handlePopUpClose, 
  onEditSecret 
}: Props) => {
  const isViewing = popUp.viewUserSecret.isOpen && 
    popUp.viewUserSecret.data?.id === secret.id;

  return (
    <>
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
            <Tooltip content={isViewing ? "Hide" : "Show"}>
              <IconButton
                onClick={() => {
                  if (isViewing) {
                    handlePopUpClose("viewUserSecret");
                  } else {
                    handlePopUpOpen("viewUserSecret", {
                      id: secret.id,
                      secret
                    });
                  }
                }}
                variant="plain"
                ariaLabel={isViewing ? "hide secret" : "show secret"}
              >
                <FontAwesomeIcon icon={isViewing ? faEyeSlash : faEye} />
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
      {isViewing && (
        <Tr>
          <Td colSpan={5} className="bg-mineshaft-800">
            <div className="p-4">
              <SecretDetailsView 
                secret={secret} 
                isRevealed
              />
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
}; 