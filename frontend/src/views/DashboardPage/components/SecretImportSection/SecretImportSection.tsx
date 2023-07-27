import { memo } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { useWorkspace } from "@app/context";
import { DecryptedSecret } from "@app/hooks/api/secrets/types";

import { SecretImportItem } from "./SecretImportItem";

type TImportedSecrets = Array<{
  environment: string;
  secretPath: string;
  folderId: string;
  secrets: DecryptedSecret[];
}>;

const SECRET_IN_DASHBOARD = "Present In Dashboard";

export const computeImportedSecretRows = (
  importedSecEnv: string,
  importedSecPath: string,
  importSecrets: TImportedSecrets = [],
  secrets: DecryptedSecret[] = [],
  environments: { name: string; slug: string }[] = []
) => {
  const importedSecIndex = importSecrets.findIndex(
    ({ secretPath, environment }) =>
      secretPath === importedSecPath && importedSecEnv === environment
  );
  if (importedSecIndex === -1) return [];

  const importedSec = importSecrets[importedSecIndex];

  const overridenSec: Record<string, { env: string; secretPath: string }> = {};
  const envSlug2Name: Record<string, string> = {};
  environments.forEach((el) => {
    envSlug2Name[el.slug] = el.name;
  });

  for (let i = importedSecIndex + 1; i < importSecrets.length; i += 1) {
    importSecrets[i].secrets.forEach((el) => {
      overridenSec[el.key] = {
        env: envSlug2Name?.[importSecrets[i].environment] || "unknown",
        secretPath: importSecrets[i].secretPath
      };
    });
  }

  secrets.forEach((el) => {
    overridenSec[el.key] = { env: SECRET_IN_DASHBOARD, secretPath: "" };
  });

  return importedSec.secrets.map(({ key, value }) => ({
    key,
    value,
    overriden: overridenSec?.[key]
  }));
};

type Props = {
  secrets?: DecryptedSecret[];
  importedSecrets?: TImportedSecrets;
  onSecretImportDelete: (env: string, secPath: string) => void;
  items: { id: string; environment: string; secretPath: string }[];
};

export const SecretImportSection = memo(
  ({ secrets = [], importedSecrets = [], onSecretImportDelete, items = [] }: Props) => {
    const { currentWorkspace } = useWorkspace();
    const environments = currentWorkspace?.environments || [];

    return (
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {items.map(({ secretPath: impSecPath, environment: importSecEnv, id }) => (
          <SecretImportItem
            key={id}
            importedEnv={importSecEnv}
            importedSecrets={computeImportedSecretRows(
              importSecEnv,
              impSecPath,
              importedSecrets,
              secrets,
              environments
            )}
            onDelete={onSecretImportDelete}
            importedSecPath={impSecPath}
          />
        ))}
      </SortableContext>
    );
  }
);

SecretImportSection.displayName = "SecretImportSection";
