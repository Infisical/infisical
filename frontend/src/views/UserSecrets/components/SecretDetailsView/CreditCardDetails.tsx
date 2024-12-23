import { CreditCardData } from "@app/hooks/api/userSecrets";

import { CopyableField } from "./CopyableField";

type Props = {
  data: CreditCardData;
  isRevealed: boolean;
};

export const CreditCardDetails = ({ data, isRevealed }: Props) => (
  <>
    <CopyableField
      label="Card Number"
      value={data.cardNumber}
      isRevealed={isRevealed}
    />
    <CopyableField
      label="Expiry Date"
      value={data.expiryDate}
      isRevealed={isRevealed}
      hiddenDisplay="••/••"
    />
    <CopyableField
      label="CVV"
      value={data.cvv}
      isRevealed={isRevealed}
      hiddenDisplay="•••"
    />
  </>
); 