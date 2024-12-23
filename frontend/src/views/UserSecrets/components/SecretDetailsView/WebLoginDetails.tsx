import { WebLoginData } from "@app/hooks/api/userSecrets";

import { CopyableField } from "./CopyableField";

type Props = {
  data: WebLoginData;
  isRevealed: boolean;
};

export const WebLoginDetails = ({ data, isRevealed }: Props) => (
  <>
    {data.url && (
      <CopyableField
        label="URL"
        value={data.url}
        isRevealed={isRevealed}
      />
    )}
    <CopyableField
      label="Username"
      value={data.username}
      isRevealed={isRevealed}
    />
    <CopyableField
      label="Password"
      value={data.password}
      isRevealed={isRevealed}
    />
  </>
); 