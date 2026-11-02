import { useCallback, useEffect, useMemo, useState } from "react";
import { Control, Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useBlocker } from "@tanstack/react-router";
import { PencilIcon, SaveIcon, Search, TriangleAlert } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { HighlightText } from "@app/components/utilities/HighlightText";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Field,
  FieldError,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  SecretInput,
  SelectedActionBar,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDiscardChangesGuard } from "@app/hooks";
import { useGetEnvOverrides, useUpdateServerConfig } from "@app/hooks/api";

type TForm = Record<string, string>;

const FORM_ID = "env-overrides-form";

export const GroupContainer = ({
  group,
  control,
  search,
  unsavedCount
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
  unsavedCount: number;
}) => {
  return (
    <AccordionItem value={group.name}>
      <AccordionTrigger>
        {group.name}
        {unsavedCount > 0 && (
          <Badge variant="warning" className="ml-auto">
            <PencilIcon />
            {unsavedCount} Unsaved Change{unsavedCount !== 1 ? "s" : ""}
          </Badge>
        )}
      </AccordionTrigger>
      <AccordionContent className="p-6">
        <div className="flex flex-col divide-y divide-border">
          {group.fields.map((field) => (
            <div
              key={field.key}
              className="flex flex-col justify-between gap-4 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center"
            >
              <div className="flex max-w-lg flex-col">
                <span className="text-sm font-medium text-foreground">
                  <HighlightText text={field.key} highlight={search} />
                </span>
                <span className="text-sm text-label">
                  <HighlightText text={field.description} highlight={search} />
                </span>
              </div>

              <div className="flex grow items-center justify-end gap-3">
                {field.hasEnvEntry && (
                  <Tooltip>
                    <TooltipTrigger aria-label="Environment variable override warning">
                      <TriangleAlert className="size-4 text-warning" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Setting this value overrides an existing environment variable.
                    </TooltipContent>
                  </Tooltip>
                )}

                <Controller
                  control={control}
                  name={field.key}
                  render={({ field: formGenField, fieldState: { error } }) => (
                    <Field className="w-full max-w-sm">
                      <SecretInput {...formGenField} autoComplete="off" aria-label={field.key} />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
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
    formState: { isSubmitting, isDirty, dirtyFields }
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
    },
    [reset, updateServerConfig]
  );

  const dirtyCount = isDirty ? Object.keys(dirtyFields).length : 0;

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => reset() });

  const navigationBlocker = useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: isDirty,
    withResolver: true
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Overrides
          <DocumentationLinkBadge href="https://infisical.com/docs/self-hosting/configuration/envars#environment-variable-overrides" />
        </CardTitle>
        <CardDescription>
          Override specific environment variables. Saved values may take up to five minutes to
          propagate to every container.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id={FORM_ID} className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <SelectedActionBar
            selectedCount={dirtyCount}
            onClearSelection={() => {
              if (!isSubmitting) requestDiscard();
            }}
            selectionLabel={`${dirtyCount} unsaved change${dirtyCount !== 1 ? "s" : ""}`}
            clearLabel="Discard"
            iconOnlyClear={false}
            aria-label="Unsaved change actions"
          >
            <Button
              variant="neutral"
              size="xs"
              type="submit"
              form={FORM_ID}
              isPending={isSubmitting}
              isDisabled={isSubmitting || !isDirty}
            >
              <SaveIcon />
              Save
            </Button>
          </SelectedActionBar>
          <DiscardChangesAlertDialog
            open={isDiscardDialogOpen}
            onOpenChange={setIsDiscardDialogOpen}
            onDiscard={confirmDiscard}
            title="Discard Changes?"
            description="Your unsaved changes to these environment overrides will be lost."
          />
          <DiscardChangesAlertDialog
            open={navigationBlocker.status === "blocked"}
            onOpenChange={(open) => {
              if (!open) navigationBlocker.reset?.();
            }}
            onDiscard={() => navigationBlocker.proceed?.()}
            title="Discard Changes?"
            description="You have unsaved changes to these environment overrides. Leaving this page will discard them."
          />
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search environment variables"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search keys and descriptions"
            />
          </InputGroup>
          <Accordion
            type="multiple"
            value={search ? filteredData.map((group) => group!.name) : undefined}
          >
            {filteredData.map((group) => (
              <GroupContainer
                key={group!.name}
                group={group!}
                control={control}
                search={search}
                unsavedCount={
                  Object.values(envOverrides ?? {})
                    .find(({ name }) => name === group!.name)
                    ?.fields.filter((field) => dirtyFields[field.key]).length ?? 0
                }
              />
            ))}
          </Accordion>
        </form>
      </CardContent>
    </Card>
  );
};
