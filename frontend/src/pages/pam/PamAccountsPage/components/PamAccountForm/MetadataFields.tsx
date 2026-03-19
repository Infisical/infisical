import { useFormContext } from "react-hook-form";

import { MetadataForm } from "@app/pages/secret-manager/SecretDashboardPage/components/DynamicSecretListView/MetadataForm";

export const MetadataFields = () => {
  const { control } = useFormContext();
  return <MetadataForm control={control} title={undefined} />;
};
