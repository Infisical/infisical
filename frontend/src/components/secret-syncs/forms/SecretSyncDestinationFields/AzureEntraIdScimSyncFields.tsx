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
  const servicePrincipalDisplayName = useWatch({
    control,
    name: "destinationConfig.servicePrincipalDisplayName"
  });

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
          setValue("destinationConfig.servicePrincipalDisplayName", undefined);
        }}
      />

      <Controller
        name="destinationConfig.servicePrincipalId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-azure-entra-id-scim-service-principal-id-label"
              htmlFor="secret-sync-azure-entra-id-scim-service-principal-id"
            >
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
                aria-labelledby="secret-sync-azure-entra-id-scim-service-principal-id-label"
                aria-describedby={
                  error ? "secret-sync-azure-entra-id-scim-service-principal-id-error" : undefined
                }
                id="secret-sync-azure-entra-id-scim-service-principal-id"
                isError={Boolean(error)}
                value={value || null}
                onValueChange={(option) => {
                  const selected = servicePrincipals?.find((sp) => sp.id === option);
                  if (!selected || option === value) return;
                  onChange(option);
                  setValue("destinationConfig.servicePrincipalDisplayName", selected.displayName);
                }}
                onClear={() => {
                  onChange("");
                  setValue("destinationConfig.servicePrincipalDisplayName", undefined);
                }}
                onInputValueChange={(newValue) => setSearchInput(newValue)}
                shouldFilter={false}
                includeMissingSelectedOptions={!searchInput}
                isLoading={isLoadingServicePrincipals}
                options={(servicePrincipals ?? []).map((sp) => sp.id)}
                placeholder="Search for a SCIM service principal..."
                getOptionLabel={(option) =>
                  servicePrincipals?.find((sp) => sp.id === option)?.displayName ??
                  (servicePrincipalDisplayName || option)
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
              <FieldError
                id="secret-sync-azure-entra-id-scim-service-principal-id-error"
                errors={[error]}
              />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
