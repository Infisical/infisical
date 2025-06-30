import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { faExclamationTriangle, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, SecretInput, Tooltip } from "@app/components/v2";
import { useGetEnvOverrides, useUpdateServerConfig } from "@app/hooks/api";

type TForm = Record<string, string>;

export const EnvironmentPageForm = () => {
  const { data: envOverrides } = useGetEnvOverrides();
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();
  const [search, setSearch] = useState("");

  const allFields = useMemo(() => {
    if (!envOverrides) return [];
    return Object.values(envOverrides).flatMap((group) => group.fields);
  }, [envOverrides]);

  const formSchema = useMemo(() => {
    return z.object(Object.fromEntries(allFields.map((field) => [field.key, z.string()])));
  }, [allFields]);

  const defaultValues = useMemo(() => {
    const values: Record<string, string> = {};
    allFields.forEach((field) => {
      values[field.key] = field.value ?? "";
    });
    return values;
  }, [allFields]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues
  });

  const formValues = useWatch({ control });

  const filteredData = useMemo(() => {
    if (!envOverrides) return [];

    const searchTerm = search.toLowerCase().trim();
    if (!searchTerm) {
      return Object.values(envOverrides);
    }

    return Object.values(envOverrides)
      .map((group) => {
        const filteredFields = group.fields.filter(
          (field) =>
            field.key.toLowerCase().includes(searchTerm) ||
            (field.description ?? "").toLowerCase().includes(searchTerm)
        );

        if (filteredFields.length > 0) {
          return { ...group, fields: filteredFields };
        }
        return null;
      })
      .filter(Boolean);
  }, [search, formValues, envOverrides]);

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const onSubmit = useCallback(
    async (formData: TForm) => {
      try {
        const filteredFormData = Object.fromEntries(
          Object.entries(formData).filter(([, value]) => value !== "")
        );
        await updateServerConfig({
          envOverrides: filteredFormData
        });

        createNotification({
          type: "success",
          text: "Environment overrides updated successfully"
        });

        reset(formData);
      } catch {
        createNotification({
          type: "error",
          text: "Failed to update environment overrides"
        });
      }
    },
    [reset, updateServerConfig]
  );

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="flex w-full flex-row items-center justify-between">
        <div>
          <div className="flex items-start gap-1">
            <p className="text-xl font-semibold text-mineshaft-100">Overrides</p>
          </div>
          <p className="text-sm text-bunker-300">Override specific environment variables.</p>
        </div>

        <div className="flex flex-row gap-2">
          <Button
            type="submit"
            variant="outline_bg"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            Save Overrides
          </Button>
        </div>
      </div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search for keys, descriptions, and values..."
        className="flex-1"
      />
      <div className="flex flex-col gap-4">
        {filteredData.map((group) => (
          <div key={group!.name}>
            <span className="mb-2 text-sm text-mineshaft-300">{group!.name}</span>
            <div className="rounded-lg border border-mineshaft-700 bg-mineshaft-800">
              <div className="flex flex-col">
                {group!.fields.map((field, i) => (
                  <div
                    key={field.key}
                    className={`flex items-center justify-between gap-4 border-mineshaft-500 p-4 ${
                      i === 0 ? "" : "border-t"
                    }`}
                  >
                    <div className="flex max-w-lg flex-col">
                      <span className="text-sm">{field.key}</span>
                      <span className="text-sm text-mineshaft-400">{field.description}</span>
                    </div>

                    <div className="flex grow items-center justify-end gap-2">
                      {field.hasEnvEntry && (
                        <Tooltip
                          content="Setting this value will override an existing environment variable"
                          className="text-center"
                        >
                          <FontAwesomeIcon icon={faExclamationTriangle} className="text-red" />
                        </Tooltip>
                      )}

                      <Controller
                        control={control}
                        name={field.key}
                        render={({ field: formGenField, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error)}
                            errorText={error?.message}
                            className="mb-0 w-full max-w-sm"
                          >
                            <SecretInput
                              {...formGenField}
                              autoComplete="off"
                              containerClassName="text-bunker-300 hover:border-mineshaft-400 border border-mineshaft-600 bg-bunker-600 px-2 py-1.5"
                            />
                          </FormControl>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
};
