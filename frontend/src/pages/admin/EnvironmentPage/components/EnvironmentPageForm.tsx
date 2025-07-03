import { useCallback, useEffect, useMemo, useState } from "react";
import { Control, Controller, useForm, useWatch } from "react-hook-form";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faChevronRight,
  faExclamationTriangle,
  faMagnifyingGlass
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, SecretInput, Tooltip } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import { useGetEnvOverrides, useUpdateServerConfig } from "@app/hooks/api";

type TForm = Record<string, string>;

export const GroupContainer = ({
  group,
  control,
  search
}: {
  group: {
    fields: {
      key: string;
      value: string;
      hasEnvEntry: boolean;
      description?: string;
    }[];
    name: string;
  };
  control: Control<TForm, any, TForm>;
  search: string;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      key={group.name}
      className="overflow-clip border border-b-0 border-mineshaft-600 bg-mineshaft-800 first:rounded-t-md last:rounded-b-md last:border-b"
    >
      <div
        className="flex h-14 cursor-pointer items-center px-5 py-4 text-sm text-gray-300"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setOpen((o) => !o);
          }
        }}
      >
        <FontAwesomeIcon
          className={`mr-8 transition-transform duration-100 ${open || search ? "rotate-90" : ""}`}
          icon={faChevronRight}
        />

        <div className="flex-grow select-none text-base">{group.name}</div>
      </div>

      {(open || search) && (
        <div className="flex flex-col">
          {group.fields.map((field) => (
            <div
              key={field.key}
              className="flex items-center justify-between gap-4 border-t border-mineshaft-500 bg-mineshaft-700/50 p-4"
            >
              <div className="flex max-w-lg flex-col">
                <span className="text-sm">
                  <HighlightText text={field.key} highlight={search} />
                </span>
                <span className="text-sm text-mineshaft-400">
                  <HighlightText text={field.description} highlight={search} />
                </span>
              </div>

              <div className="flex grow items-center justify-end gap-2">
                {field.hasEnvEntry && (
                  <Tooltip
                    content="Setting this value will override an existing environment variable"
                    className="text-center"
                  >
                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-yellow" />
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
      )}
    </div>
  );
};

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
          text: "Environment overrides updated successfully. It can take up to 5 minutes to take effect."
        });

        reset(formData);
      } catch (error) {
        const errorMessage =
          (error as any)?.response?.data?.message ||
          (error as any)?.message ||
          "An unknown error occurred";
        createNotification({
          type: "error",
          title: "Failed to update environment overrides",
          text: errorMessage
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
            <a
              href="https://infisical.com/docs/self-hosting/configuration/envars#environment-variable-overrides"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="ml-1 mt-[0.32rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                <span>Docs</span>
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.07rem] ml-1.5 text-[10px]"
                />
              </div>
            </a>
          </div>
          <p className="text-sm text-bunker-300">
            Override specific environment variables. After saving, it may take up to 5 minutes for
            variables to propagate throughout every container.
          </p>
        </div>

        <div className="flex flex-row gap-2">
          <Button
            type="submit"
            variant="outline_bg"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            Save
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
      <div className="flex flex-col">
        {filteredData.map((group) => (
          <GroupContainer group={group!} control={control} search={search} />
        ))}
      </div>
    </form>
  );
};
