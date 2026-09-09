import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useAzureEntraIdConnectionListScimServicePrincipals } from "@app/hooks/api/appConnections/azure";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { useDebounce } from "@app/hooks/useDebounce";

import { TSecretSyncForm } from "../schemas";

export const AzureEntraIdScimSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureEntraIdScim }
  >();

  const connectionId = useWatch({ control, name: "connection.id" });

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch] = useDebounce(searchInput, 300);

  const { data: servicePrincipals, isLoading: isLoadingServicePrincipals } =
    useAzureEntraIdConnectionListScimServicePrincipals(connectionId, debouncedSearch || undefined, {
      enabled: Boolean(connectionId)
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.servicePrincipalId", "");
        }}
      />

      <Controller
        name="destinationConfig.servicePrincipalId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              SCIM Service Principal
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>
                  Select the Enterprise Application with SCIM provisioning configured. Type to
                  search by name.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Combobox
                isError={Boolean(error)}
                value={value || null}
                onValueChange={(option) => {
                  onChange(option);
                }}
                onClear={() => {
                  onChange("");
                }}
                onInputValueChange={(newValue) => setSearchInput(newValue)}
                shouldFilter={false}
                includeMissingSelectedOptions={!searchInput}
                isLoading={isLoadingServicePrincipals}
                options={(servicePrincipals ?? []).map((sp) => sp.id)}
                placeholder="Search for a SCIM service principal..."
                getOptionLabel={(option) =>
                  servicePrincipals?.find((sp) => sp.id === option)?.displayName ?? option
                }
                getOptionValue={(option) => option}
                isDisabled={!connectionId}
                emptyMessage={() =>
                  debouncedSearch
                    ? "No matching service principals found"
                    : "Type to search for service principals"
                }
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
