import { Controller, useFormContext } from "react-hook-form";

import { FilterableSelect, FormControl } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useListWorkspacePkiSubscribers } from "@app/hooks/api/workspace";

import { TPkiSyncForm } from "./schemas";

export const PkiSyncSourceFields = () => {
  const { control } = useFormContext<TPkiSyncForm>();
  const { currentWorkspace } = useWorkspace();

  const { data: pkiSubscribers = [], isLoading } = useListWorkspacePkiSubscribers(
    currentWorkspace?.id || ""
  );

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Specify the PKI subscriber where you would like to sync certificates from.
      </p>

      <Controller
        control={control}
        name="subscriberId"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl label="PKI Subscriber" isError={Boolean(error)} errorText={error?.message}>
            <FilterableSelect
              value={pkiSubscribers.find((sub) => sub.id === value)}
              onChange={(selectedSubscriber) => {
                if (Array.isArray(selectedSubscriber)) return;
                if (
                  selectedSubscriber &&
                  !Array.isArray(selectedSubscriber) &&
                  "id" in selectedSubscriber
                ) {
                  onChange(selectedSubscriber.id);
                } else {
                  onChange(undefined);
                }
              }}
              options={pkiSubscribers}
              isLoading={isLoading}
              placeholder="Select PKI subscriber..."
              getOptionLabel={(option) => option?.name || ""}
              getOptionValue={(option) => option?.id || ""}
            />
          </FormControl>
        )}
      />
    </>
  );
};
