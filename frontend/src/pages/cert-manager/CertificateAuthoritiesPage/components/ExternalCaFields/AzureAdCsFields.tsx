import { Control } from "react-hook-form";

import { TAvailableAppConnection } from "@app/hooks/api/appConnections";

import { AppConnectionSelectField } from "./AppConnectionSelectField";
import { FormData } from "./schema";

type Props = {
  control: Control<FormData>;
  availableConnections: TAvailableAppConnection[];
  isPending: boolean;
};

export const AzureAdCsFields = ({ control, availableConnections, isPending }: Props) => (
  <AppConnectionSelectField
    control={control}
    name="configuration.azureAdcsConnection"
    label="Azure ADCS Connection"
    menuPlacement="top"
    options={availableConnections}
    isLoading={isPending}
    tooltip="Azure ADCS App Connection contains the Windows domain credentials and ADCS server URL for certificate requests."
  />
);
