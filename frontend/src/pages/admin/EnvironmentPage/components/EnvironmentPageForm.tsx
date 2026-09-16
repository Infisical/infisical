import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Control, Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, TriangleAlert } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldError,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  SecretInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useGetEnvOverrides, useUpdateServerConfig } from "@app/hooks/api";

type TForm = Record<string, string>;

export const GroupContainer = ({
  group,
  control,
  search,
  isSaving,
  isSaveDisabled,
  onSave
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
  isSaving: boolean;
  isSaveDisabled: boolean;
  onSave: () => void;
}) => {
  return (
    <AccordionItem value={group.name}>
      <AccordionTrigger>{group.name}</AccordionTrigger>
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
        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button
            variant="neutral"
            onClick={onSave}
            isPending={isSaving}
            isDisabled={isSaveDisabled}
          >
            Save
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export const EnvironmentPageForm = () => {
  const { data: envOverrides } = useGetEnvOverrides();
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig();
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [pendingCollapse, setPendingCollapse] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const savedValues = useRef<TForm>({});

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
    getValues,
    reset,
    resetField,
    formState: { dirtyFields }
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
    savedValues.current = defaultValues;
    reset(defaultValues);
  }, [defaultValues, reset]);

  const saveGroup = useCallback(
    async (groupName: string) => {
      const group = Object.values(envOverrides ?? {}).find(({ name }) => name === groupName);
      if (!group) return false;

      const formData = getValues();
      const nextSavedValues = { ...savedValues.current };
      group.fields.forEach(({ key }) => {
        nextSavedValues[key] = formData[key];
      });
      const filteredFormData = Object.fromEntries(
        Object.entries(nextSavedValues).filter(([, value]) => value !== "")
      );

      setSavingGroup(groupName);
      try {
        await updateServerConfig({
          envOverrides: filteredFormData
        });

        savedValues.current = nextSavedValues;
        group.fields.forEach(({ key }) => {
          resetField(key, { defaultValue: formData[key] });
        });

        createNotification({
          type: "success",
          text: "Environment overrides updated successfully. It can take up to 5 minutes to take effect."
        });
        return true;
      } catch {
        return false;
      } finally {
        setSavingGroup(null);
      }
    },
    [envOverrides, getValues, resetField, updateServerConfig]
  );

  const isGroupDirty = useCallback(
    (groupName: string) => {
      const group = Object.values(envOverrides ?? {}).find(({ name }) => name === groupName);
      return Boolean(group?.fields.some(({ key }) => dirtyFields[key]));
    },
    [dirtyFields, envOverrides]
  );

  const handleOpenGroupsChange = (nextOpenGroups: string[]) => {
    if (search) return;

    const closingGroup = openGroups.find((groupName) => !nextOpenGroups.includes(groupName));
    if (closingGroup && isGroupDirty(closingGroup)) {
      setPendingCollapse(closingGroup);
      return;
    }

    setOpenGroups(nextOpenGroups);
  };

  const handleDiscardAndCollapse = () => {
    if (!pendingCollapse) return;

    const group = Object.values(envOverrides ?? {}).find(({ name }) => name === pendingCollapse);
    group?.fields.forEach(({ key }) => {
      resetField(key, { defaultValue: savedValues.current[key] ?? "" });
    });
    setOpenGroups((current) => current.filter((groupName) => groupName !== pendingCollapse));
    setPendingCollapse(null);
  };

  const handleSaveAndCollapse = async () => {
    if (!pendingCollapse) return;

    const groupName = pendingCollapse;
    if (await saveGroup(groupName)) {
      setOpenGroups((current) => current.filter((name) => name !== groupName));
      setPendingCollapse(null);
    }
  };

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
        <div className="flex flex-col gap-4">
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search environment variables"
              value={search}
              onChange={(event) => {
                const nextSearch = event.target.value;
                if (search && !nextSearch) {
                  setOpenGroups((current) => [
                    ...new Set([
                      ...current,
                      ...Object.values(envOverrides ?? {})
                        .filter(({ name }) => isGroupDirty(name))
                        .map(({ name }) => name)
                    ])
                  ]);
                }
                setSearch(nextSearch);
              }}
              placeholder="Search keys and descriptions"
            />
          </InputGroup>
          <Accordion
            type="multiple"
            value={search ? filteredData.map((group) => group!.name) : openGroups}
            onValueChange={handleOpenGroupsChange}
          >
            {filteredData.map((group) => (
              <GroupContainer
                key={group!.name}
                group={group!}
                control={control}
                search={search}
                isSaving={savingGroup === group!.name}
                isSaveDisabled={!isGroupDirty(group!.name) || Boolean(savingGroup)}
                onSave={() => saveGroup(group!.name)}
              />
            ))}
          </Accordion>
        </div>
      </CardContent>
      <AlertDialog
        open={Boolean(pendingCollapse)}
        onOpenChange={(open) => {
          if (!open) setPendingCollapse(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Save or discard your changes before closing this section.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={Boolean(savingGroup)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isDisabled={Boolean(savingGroup)}
              onClick={handleDiscardAndCollapse}
            >
              Discard
            </AlertDialogAction>
            <Button
              size="sm"
              variant="neutral"
              isPending={savingGroup === pendingCollapse}
              onClick={handleSaveAndCollapse}
            >
              Save Changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
