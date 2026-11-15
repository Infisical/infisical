import type { ReactNode } from "react";
import { FieldHelp } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";

import type { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { useWatchedValue } from "../fields";
import { usePkiSyncOption } from "../shared";

export function NameSchemaHelp({ children }: { children: ReactNode }) {
  const destination = useWatchedValue<PkiSync>("destination");
  const { syncOption } = usePkiSyncOption(destination);
  return (
    <FieldHelp label="Name schema placeholders">
      <Stack gap={8}>
        {children}
        {syncOption?.forbiddenCharacters && syncOption.forbiddenCharacters.length > 0 && (
          <span>
            Characters not allowed in {syncOption.name}:{" "}
            {syncOption.forbiddenCharacters.split("").join(" ")}
          </span>
        )}
      </Stack>
    </FieldHelp>
  );
}
