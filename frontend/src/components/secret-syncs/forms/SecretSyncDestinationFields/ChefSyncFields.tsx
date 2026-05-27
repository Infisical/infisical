import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import {
  TChefDataBag,
  TChefDataBagItem,
  useChefConnectionListDataBagItems,
  useChefConnectionListDataBags
} from "@app/hooks/api/appConnections/chef";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const ChefSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Chef }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const dataBagName = useWatch({ name: "destinationConfig.dataBagName", control });

  const { data: dataBags, isLoading: isDataBagsLoading } = useChefConnectionListDataBags(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: dataBagItems, isLoading: isDataBagItemsLoading } =
    useChefConnectionListDataBagItems(connectionId, dataBagName, {
      enabled: Boolean(connectionId && dataBagName)
    });

  const handleChangeConnection = () => {
    setValue("destinationConfig.dataBagName", "");
    setValue("destinationConfig.dataBagItemName", "");
  };

  return (
    <FieldGroup>
      <SecretSyncConnectionField onChange={handleChangeConnection} />

      <Controller
        name="destinationConfig.dataBagName"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Data Bag</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isDataBagsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={dataBags?.find((dataBag) => dataBag.name === value) ?? null}
                onChange={(option) => {
                  const selectedDataBag = option as SingleValue<TChefDataBag>;
                  onChange(selectedDataBag?.name ?? "");
                  setValue("destinationConfig.dataBagItemName", "");
                }}
                options={dataBags}
                placeholder="Select a data bag..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.dataBagItemName"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Data Bag Item</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isDataBagItemsLoading && Boolean(connectionId && dataBagName)}
                isDisabled={!connectionId || !dataBagName}
                value={dataBagItems?.find((dataBagItem) => dataBagItem.name === value) ?? null}
                onChange={(option) => {
                  const selectedDataBagItem = option as SingleValue<TChefDataBagItem>;
                  onChange(selectedDataBagItem?.name ?? "");
                }}
                options={dataBagItems}
                placeholder="Select a data bag item..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
