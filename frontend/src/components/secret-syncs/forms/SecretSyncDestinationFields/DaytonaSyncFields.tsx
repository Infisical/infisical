import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FieldGroup } from "@app/components/v3";

export const DaytonaSyncFields = () => {
  return (
    <FieldGroup>
      <SecretSyncConnectionField />
    </FieldGroup>
  );
};
