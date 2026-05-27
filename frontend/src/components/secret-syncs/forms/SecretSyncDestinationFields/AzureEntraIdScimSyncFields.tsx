import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  TAzureScimServicePrincipal,
  useAzureEntraIdConnectionListScimServicePrincipals
} from "@app/hooks/api/appConnections/azure";
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
  const [selectedSp, setSelectedSp] = useState<TAzureScimServicePrincipal | null>(null);

  const { data: servicePrincipals, isLoading: isLoadingServicePrincipals } =
    useAzureEntraIdConnectionListScimServicePrincipals(connectionId, debouncedSearch || undefined, {
      enabled: Boolean(connectionId)
    });

  const options = useMemo(() => {
    const results = servicePrincipals ?? [];
    if (selectedSp && !results.some((sp) => sp.id === selectedSp.id)) {
      return [selectedSp, ...results];
    }
    return results;
  }, [servicePrincipals, selectedSp]);

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.servicePrincipalId", "");
          setSelectedSp(null);
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
              <FilterableSelect
                value={options.find((sp) => sp.id === value) ?? null}
                onChange={(option) => {
                  const selected = option as TAzureScimServicePrincipal | null;
                  setSelectedSp(selected);
                  onChange(selected?.id ?? "");
                }}
                onInputChange={(newValue) => setSearchInput(newValue)}
                filterOption={null}
                isLoading={isLoadingServicePrincipals}
                options={options}
                placeholder="Search for a SCIM service principal..."
                getOptionLabel={(option) => option.displayName}
                getOptionValue={(option) => option.id}
                isClearable
                isDisabled={!connectionId}
                noOptionsMessage={() =>
                  debouncedSearch
                    ? "No matching service principals found"
                    : "Type to search for service principals"
                }
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
