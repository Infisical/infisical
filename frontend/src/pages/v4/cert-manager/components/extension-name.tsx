import { Stack } from "@infisical/cipher/ui/layout";
import { SmallText } from "@infisical/cipher/ui/text";

import { extensionLabel } from "./policy-model";

export const ExtensionName = ({ oid, label }: { oid: string; label?: string | null }) => {
  const name = extensionLabel(oid, label);
  if (name === oid) return <code>{oid}</code>;
  return (
    <Stack gap={2}>
      {name}
      <SmallText muted>
        <code>{oid}</code>
      </SmallText>
    </Stack>
  );
};
