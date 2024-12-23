import { SecureNoteData } from "@app/hooks/api/userSecrets";

import { CopyableField } from "./CopyableField";

type Props = {
  data: SecureNoteData;
  isRevealed: boolean;
};

export const SecureNoteDetails = ({ data, isRevealed }: Props) => (
  <CopyableField
    label="Content"
    value={data.content}
    isRevealed={isRevealed}
  />
); 