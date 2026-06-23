import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistance } from "date-fns";
import {
  ChevronDownIcon,
  ClockIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon
} from "lucide-react";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useCreateAccessRequest } from "@app/hooks/api";
import { TAccessApprovalPolicy } from "@app/hooks/api/types";

const secretPermissionSchema = z.object({
  secretPath: z.string().optional(),
  environmentSlug: z.string(),
  [ProjectPermissionActions.Edit]: z.boolean().optional(),
  [ProjectPermissionActions.Read]: z.boolean().optional(),
  [ProjectPermissionActions.Create]: z.boolean().optional(),
  [ProjectPermissionActions.Delete]: z.boolean().optional(),
  temporaryAccess: z.discriminatedUnion("isTemporary", [
    z.object({
      isTemporary: z.literal(true),
      temporaryRange: z.string().min(1),
      temporaryAccessStartTime: z.string().datetime(),
      temporaryAccessEndTime: z.string().datetime().nullable().optional()
    }),
    z.object({
      isTemporary: z.literal(false),
      temporaryRange: z.string().optional()
    })
  ]),
  note: z.string().optional()
});

type TSecretPermissionForm = z.infer<typeof secretPermissionSchema>;

const PERMISSIONS = [
  { name: "read", label: "View", description: "Read secret values", Icon: EyeIcon },
  { name: "create", label: "Create", description: "Create new secrets", Icon: PlusIcon },
  { name: "edit", label: "Modify", description: "Update existing secrets", Icon: PencilIcon },
  { name: "delete", label: "Delete", description: "Delete existing secrets", Icon: Trash2Icon }
] as const;

export const RequestAccessForm = ({
  policies,
  onClose,
  selectedActions = [],
  secretPath: initialSecretPath
}: {
  policies: TAccessApprovalPolicy[];
  selectedActions?: ProjectPermissionActions[];
  secretPath?: string;
  onClose?: () => void;
}) => {
  const { currentProject } = useProject();
  const requestAccess = useCreateAccessRequest();

  const privilegeForm = useForm<TSecretPermissionForm>({
    resolver: zodResolver(secretPermissionSchema),
    defaultValues: {
      environmentSlug: currentProject.environments?.[0]?.slug,
      secretPath: initialSecretPath,
      read: selectedActions.includes(ProjectPermissionActions.Read),
      edit: selectedActions.includes(ProjectPermissionActions.Edit),
      create: selectedActions.includes(ProjectPermissionActions.Create),
      delete: selectedActions.includes(ProjectPermissionActions.Delete),
      temporaryAccess: {
        isTemporary: false,
        temporaryRange: "1h"
      }
    }
  });

  const temporaryAccessField = privilegeForm.watch("temporaryAccess");
  const selectedEnvironment = privilegeForm.watch("environmentSlug");
  const secretPath = privilegeForm.watch("secretPath");

  const readAccess = privilegeForm.watch("read");
  const createAccess = privilegeForm.watch("create");
  const editAccess = privilegeForm.watch("edit");
  const deleteAccess = privilegeForm.watch("delete");

  const accessSelected = readAccess || createAccess || editAccess || deleteAccess;

  const selectablePaths = useMemo(
    () =>
      policies
        .filter((policy) => policy.environments.some((env) => env.slug === selectedEnvironment))
        .map((policy) => policy.secretPath),
    [policies, selectedEnvironment]
  );

  useEffect(() => {
    privilegeForm.setValue("secretPath", "", {
      shouldValidate: true
    });
  }, [selectedEnvironment]);

  const isTemporary = temporaryAccessField?.isTemporary;
  const isExpired =
    temporaryAccessField.isTemporary &&
    new Date() > new Date(temporaryAccessField.temporaryAccessEndTime || "");

  const handleRequestAccess = async (data: TSecretPermissionForm) => {
    if (!currentProject) {
      createNotification({
        type: "error",
        text: "No workspace found.",
        title: "Error"
      });
      return;
    }

    if (!data.secretPath) {
      createNotification({
        type: "error",
        text: "Please select a secret path...",
        title: "Error"
      });
      return;
    }

    const policy = policies.find(
      (p) =>
        p.environments.find((e) => e.slug === selectedEnvironment) && p.secretPath === secretPath
    );

    if (
      policy?.maxTimePeriod &&
      (!data.temporaryAccess.isTemporary ||
        ms(data.temporaryAccess.temporaryRange) > ms(policy.maxTimePeriod))
    ) {
      createNotification({
        type: "error",
        text: `Requested access time range is limited to ${policy.maxTimePeriod} by policy`,
        title: "Error"
      });
      return;
    }

    const actions = [
      { action: ProjectPermissionActions.Read, allowed: data.read },
      { action: ProjectPermissionActions.Create, allowed: data.create },
      { action: ProjectPermissionActions.Delete, allowed: data.delete },
      { action: ProjectPermissionActions.Edit, allowed: data.edit }
    ];
    const conditions: Record<string, any> = { environment: data.environmentSlug };
    if (data.secretPath) {
      conditions.secretPath = { $glob: data.secretPath };
    }
    await requestAccess.mutateAsync({
      ...data,
      ...(data.temporaryAccess.isTemporary && {
        temporaryRange: data.temporaryAccess.temporaryRange
      }),
      projectSlug: currentProject.slug,
      isTemporary: data.temporaryAccess.isTemporary,
      permissions: actions
        .filter(({ allowed }) => allowed)
        .map(({ action }) => ({
          action,
          subject: [ProjectPermissionSub.Secrets],
          conditions
        })),
      note: data.note
    });

    createNotification({
      type: "success",
      text: "Successfully requested access"
    });
    privilegeForm.reset();
    if (onClose) onClose();
  };

  const handleGrant = () => {
    const temporaryRange = privilegeForm.getValues("temporaryAccess.temporaryRange");
    if (!temporaryRange) {
      privilegeForm.setError(
        "temporaryAccess.temporaryRange",
        { type: "required", message: "Required" },
        { shouldFocus: true }
      );
      return;
    }
    privilegeForm.clearErrors("temporaryAccess.temporaryRange");
    privilegeForm.setValue(
      "temporaryAccess",
      {
        isTemporary: true,
        temporaryAccessStartTime: new Date().toISOString(),
        temporaryRange,
        temporaryAccessEndTime: new Date(new Date().getTime() + ms(temporaryRange)).toISOString()
      },
      { shouldDirty: true }
    );
  };

  const handleCancelTemporary = () => {
    privilegeForm.setValue("temporaryAccess", {
      isTemporary: false,
      temporaryRange: privilegeForm.getValues("temporaryAccess.temporaryRange")
    });
  };

  const getAccessLabel = () => {
    if (isExpired) return "Access expired";
    if (!temporaryAccessField?.isTemporary) return "Permanent";
    return formatDistance(new Date(temporaryAccessField.temporaryAccessEndTime || ""), new Date());
  };

  return (
    <form
      onSubmit={privilegeForm.handleSubmit(handleRequestAccess)}
      className="flex flex-1 flex-col gap-4 overflow-hidden"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Controller
          control={privilegeForm.control}
          name="environmentSlug"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="environmentSlug">Environment</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="environmentSlug" className="w-full">
                  <SelectValue placeholder="Select an environment" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {currentProject?.environments?.map(({ slug, id, name }) => (
                    <SelectItem value={slug} key={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <Controller
          control={privilegeForm.control}
          name="secretPath"
          render={({ field }) => {
            const secretPathField = (
              <Field>
                <FieldLabel htmlFor="secretPath">Secret Path</FieldLabel>
                <Select
                  value={field.value || ""}
                  onValueChange={field.onChange}
                  disabled={!selectablePaths.length}
                >
                  <SelectTrigger id="secretPath" className="w-full">
                    <SelectValue placeholder="Select a secret path" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {selectablePaths.map((path) => (
                      <SelectItem value={path} key={path}>
                        {path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            );

            if (selectablePaths.length) return secretPathField;

            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-full">{secretPathField}</div>
                </TooltipTrigger>
                <TooltipContent>
                  The selected environment doesn&apos;t have any policies.
                </TooltipContent>
              </Tooltip>
            );
          }}
        />
        <Field>
          <FieldLabel>Permissions</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {PERMISSIONS.map(({ name, label, description, Icon }) => (
              <Controller
                key={name}
                control={privilegeForm.control}
                name={name}
                render={({ field }) => (
                  <FieldLabel htmlFor={`secret-${name}`} variant="project">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>
                          <Icon />
                          {label}
                        </FieldTitle>
                        <FieldDescription>{description}</FieldDescription>
                      </FieldContent>
                      <Checkbox
                        id={`secret-${name}`}
                        variant="outline"
                        isChecked={field.value}
                        onCheckedChange={(isChecked) => field.onChange(isChecked)}
                      />
                    </Field>
                  </FieldLabel>
                )}
              />
            ))}
          </div>
        </Field>
        <Field>
          <FieldLabel>Duration</FieldLabel>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between capitalize">
                <span className="flex items-center gap-2">
                  {isTemporary && <ClockIcon className="size-3.5" />}
                  {getAccessLabel()}
                </span>
                <ChevronDownIcon className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="flex flex-col gap-4">
              <div className="text-sm text-foreground">Configure timed access</div>
              {isExpired && (
                <Badge variant="danger" className="w-fit">
                  Expired
                </Badge>
              )}
              <Controller
                control={privilegeForm.control}
                name="temporaryAccess.temporaryRange"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="temporaryRange">
                      <TtlFormLabel label="Validity" />
                    </FieldLabel>
                    <Input id="temporaryRange" {...field} isError={Boolean(error?.message)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <div className="flex items-center gap-2">
                <Button size="xs" variant="project" onClick={handleGrant}>
                  Grant
                </Button>
                {temporaryAccessField.isTemporary && (
                  <Button size="xs" variant="danger" onClick={handleCancelTemporary}>
                    Cancel
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </Field>
        <Controller
          control={privilegeForm.control}
          name="note"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="note">Note</FieldLabel>
              <TextArea
                id="note"
                {...field}
                maxLength={255}
                placeholder="Add the reason for this access request..."
              />
            </Field>
          )}
        />
      </div>
      <SheetFooter className="border-t">
        <Button
          type="submit"
          variant="project"
          isPending={privilegeForm.formState.isSubmitting || requestAccess.isPending}
          isDisabled={
            !policies.length || !privilegeForm.formState.isValid || !secretPath || !accessSelected
          }
        >
          Request Access
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </SheetFooter>
    </form>
  );
};
