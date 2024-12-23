import { UserSecret, UserSecretType } from "@app/hooks/api/userSecrets";

import { CreditCardDetails } from "./CreditCardDetails";
import { SecureNoteDetails } from "./SecureNoteDetails";
import { WebLoginDetails } from "./WebLoginDetails";


type Props = {
  secret: UserSecret;
  isRevealed: boolean;
};

export const SecretDetailsView = ({ secret, isRevealed }: Props) => {
  return (
    <div className="flex flex-col gap-4">
      {secret.type === UserSecretType.WEB_LOGIN && (
        <WebLoginDetails data={secret.data} isRevealed={isRevealed} />
      )}
      {secret.type === UserSecretType.CREDIT_CARD && (
        <CreditCardDetails data={secret.data} isRevealed={isRevealed} />
      )}
      {secret.type === UserSecretType.SECURE_NOTE && (
        <SecureNoteDetails data={secret.data} isRevealed={isRevealed} />
      )}
    </div>
  );
}; 