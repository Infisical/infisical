import { useEffect, useMemo, useRef } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistance } from "date-fns";
import {
  BanIcon,
  ChevronDownIcon,
  ClockIcon,
  EyeIcon,
  FingerprintIcon,
  FolderIcon,
  HexagonIcon,
  ImportIcon,
  KeyIcon,
  KeyRoundIcon,
  type LucideIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  TimerIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldError,
  FieldLabel,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
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
import { cn } from "@app/components/v3/utils";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import {
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSecretRotationActions
} from "@app/context/ProjectPermissionContext/types";
import { useCreateAccessRequest } from "@app/hooks/api";
import { TAccessApprovalPolicy } from "@app/hooks/api/types";

type TResourceAction = {
  value: string;
  label: string;
  description: string;
  Icon: LucideIcon;
};

type TResourceConfig = {
  subject: ProjectPermissionSub;
  label: string;
  Icon: LucideIcon;
  // Tailwind extracts classes statically, so every tint must be a full literal string
  iconTileClassName: string;
  chipSelectedClassName: string;
  countBadgeClassName: string;
  summaryIconClassName: string;
  actions: TResourceAction[];
};

const RESOURCE_CONFIGS: TResourceConfig[] = [
  {
    subject: ProjectPermissionSub.Secrets,
    label: "Secrets",
    Icon: KeyIcon,
    iconTileClassName: "border-accent/10 bg-accent/15 text-accent",
    chipSelectedClassName:
      "border-accent/50 bg-accent/15 text-accent hover:border-accent/50 hover:bg-accent/25",
    countBadgeClassName: "border-accent/10 bg-accent/15 text-accent",
    summaryIconClassName: "text-accent",
    actions: [
      {
        value: ProjectPermissionActions.Read,
        label: "View",
        description: "Read secret values",
        Icon: EyeIcon
      },
      {
        value: ProjectPermissionActions.Create,
        label: "Create",
        description: "Create new secrets",
        Icon: PlusIcon
      },
      {
        value: ProjectPermissionActions.Edit,
        label: "Modify",
        description: "Update existing secrets",
        Icon: PencilIcon
      },
      {
        value: ProjectPermissionActions.Delete,
        label: "Delete",
        description: "Delete existing secrets",
        Icon: Trash2Icon
      }
    ]
  },
  {
    subject: ProjectPermissionSub.SecretFolders,
    label: "Folders",
    Icon: FolderIcon,
    iconTileClassName: "border-folder/10 bg-folder/15 text-folder",
    chipSelectedClassName:
      "border-folder/50 bg-folder/15 text-folder hover:border-folder/50 hover:bg-folder/25",
    countBadgeClassName: "border-folder/10 bg-folder/15 text-folder",
    summaryIconClassName: "text-folder",
    actions: [
      {
        value: ProjectPermissionActions.Create,
        label: "Create",
        description: "Create new folders to organize secrets",
        Icon: PlusIcon
      },
      {
        value: ProjectPermissionActions.Edit,
        label: "Modify",
        description: "Rename or modify folder properties",
        Icon: PencilIcon
      },
      {
        value: ProjectPermissionActions.Delete,
        label: "Delete",
        description: "Delete folders and their contents",
        Icon: Trash2Icon
      }
    ]
  },
  {
    subject: ProjectPermissionSub.DynamicSecrets,
    label: "Dynamic Secrets",
    Icon: FingerprintIcon,
    iconTileClassName: "border-dynamic-secret/10 bg-dynamic-secret/15 text-dynamic-secret",
    chipSelectedClassName:
      "border-dynamic-secret/50 bg-dynamic-secret/15 text-dynamic-secret hover:border-dynamic-secret/50 hover:bg-dynamic-secret/25",
    countBadgeClassName: "border-dynamic-secret/10 bg-dynamic-secret/15 text-dynamic-secret",
    summaryIconClassName: "text-dynamic-secret",
    actions: [
      {
        value: ProjectPermissionDynamicSecretActions.ReadRootCredential,
        label: "View",
        description: "View the root credentials used for dynamic secret generation",
        Icon: EyeIcon
      },
      {
        value: ProjectPermissionDynamicSecretActions.CreateRootCredential,
        label: "Create",
        description: "Configure new root credentials for dynamic secrets",
        Icon: PlusIcon
      },
      {
        value: ProjectPermissionDynamicSecretActions.EditRootCredential,
        label: "Modify",
        description: "Update existing root credentials configuration",
        Icon: PencilIcon
      },
      {
        value: ProjectPermissionDynamicSecretActions.DeleteRootCredential,
        label: "Delete",
        description: "Delete root credentials configuration",
        Icon: Trash2Icon
      },
      {
        value: ProjectPermissionDynamicSecretActions.Lease,
        label: "Lease",
        description: "Create and revoke dynamic secret leases",
        Icon: TimerIcon
      }
    ]
  },
  {
    subject: ProjectPermissionSub.SecretRotation,
    label: "Secret Rotation",
    Icon: RefreshCwIcon,
    iconTileClassName: "border-secret-rotation/10 bg-secret-rotation/15 text-secret-rotation",
    chipSelectedClassName:
      "border-secret-rotation/50 bg-secret-rotation/15 text-secret-rotation hover:border-secret-rotation/50 hover:bg-secret-rotation/25",
    countBadgeClassName: "border-secret-rotation/10 bg-secret-rotation/15 text-secret-rotation",
    summaryIconClassName: "text-secret-rotation",
    actions: [
      {
        value: ProjectPermissionSecretRotationActions.Read,
        label: "View",
        description: "View secret rotation configurations",
        Icon: EyeIcon
      },
      {
        value: ProjectPermissionSecretRotationActions.ReadGeneratedCredentials,
        label: "Read Credentials",
        description: "Access rotated credential values",
        Icon: KeyRoundIcon
      },
      {
        value: ProjectPermissionSecretRotationActions.Create,
        label: "Create",
        description: "Create new secret rotation configuration",
        Icon: PlusIcon
      },
      {
        value: ProjectPermissionSecretRotationActions.Edit,
        label: "Modify",
        description: "Update rotation configuration",
        Icon: PencilIcon
      },
      {
        value: ProjectPermissionSecretRotationActions.Delete,
        label: "Delete",
        description: "Delete rotation configurations",
        Icon: Trash2Icon
      },
      {
        value: ProjectPermissionSecretRotationActions.RotateSecrets,
        label: "Rotate",
        description: "Manually trigger secret rotation",
        Icon: RefreshCwIcon
      }
    ]
  },
  {
    subject: ProjectPermissionSub.SecretImports,
    label: "Secret Imports",
    Icon: ImportIcon,
    iconTileClassName: "border-import/10 bg-import/15 text-import",
    chipSelectedClassName:
      "border-import/50 bg-import/15 text-import hover:border-import/50 hover:bg-import/25",
    countBadgeClassName: "border-import/10 bg-import/15 text-import",
    summaryIconClassName: "text-import",
    actions: [
      {
        value: ProjectPermissionActions.Read,
        label: "View",
        description: "View imported secrets from other projects",
        Icon: EyeIcon
      },
      {
        value: ProjectPermissionActions.Create,
        label: "Create",
        description: "Set up new secret imports",
        Icon: PlusIcon
      },
      {
        value: ProjectPermissionActions.Edit,
        label: "Modify",
        description: "Change import configuration",
        Icon: PencilIcon
      },
      {
        value: ProjectPermissionActions.Delete,
        label: "Delete",
        description: "Remove secret imports",
        Icon: Trash2Icon
      }
    ]
  },
  {
    subject: ProjectPermissionSub.HoneyTokens,
    label: "Honey Tokens",
    Icon: HexagonIcon,
    iconTileClassName: "border-yellow-700/10 bg-yellow-700/15 text-yellow-700",
    chipSelectedClassName:
      "border-yellow-700/50 bg-yellow-700/15 text-yellow-700 hover:border-yellow-700/50 hover:bg-yellow-700/25",
    countBadgeClassName: "border-yellow-700/10 bg-yellow-700/15 text-yellow-700",
    summaryIconClassName: "text-yellow-700",
    actions: [
      {
        value: ProjectPermissionHoneyTokenActions.Read,
        label: "View",
        description: "View honey tokens and events",
        Icon: EyeIcon
      },
      {
        value: ProjectPermissionHoneyTokenActions.ReadCredentials,
        label: "Read Credentials",
        description: "Reveal honey token credentials",
        Icon: KeyRoundIcon
      },
      {
        value: ProjectPermissionHoneyTokenActions.Create,
        label: "Create",
        description: "Create honey tokens",
        Icon: PlusIcon
      },
      {
        value: ProjectPermissionHoneyTokenActions.Edit,
        label: "Modify",
        description: "Update honey token metadata and mappings",
        Icon: PencilIcon
      },
      {
        value: ProjectPermissionHoneyTokenActions.Reset,
        label: "Reset",
        description: "Reset triggered honey tokens",
        Icon: RotateCcwIcon
      },
      {
        value: ProjectPermissionHoneyTokenActions.Revoke,
        label: "Revoke",
        description: "Revoke honey tokens and credentials",
        Icon: BanIcon
      }
    ]
  }
];

const requestAccessSchema = z.object({
  environmentSlug: z.string().min(1),
  secretPath: z.string().min(1, "Please select a secret path"),
  resources: z
    .object({
      subject: z.nativeEnum(ProjectPermissionSub),
      actions: z.string().array()
    })
    .array()
    .refine((resources) => resources.some((resource) => resource.actions.length > 0), {
      message: "Select at least one permission"
    }),
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
  note: z.string().max(255).optional()
});

type TRequestAccessForm = z.infer<typeof requestAccessSchema>;

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
  const { subscription } = useSubscription();
  const requestAccess = useCreateAccessRequest();

  const form = useForm<TRequestAccessForm>({
    resolver: zodResolver(requestAccessSchema),
    defaultValues: {
      environmentSlug: currentProject.environments?.[0]?.slug,
      secretPath: initialSecretPath ?? "",
      resources: [{ subject: ProjectPermissionSub.Secrets, actions: selectedActions }],
      temporaryAccess: { isTemporary: false, temporaryRange: "1h" },
      note: ""
    }
  });

  const {
    fields: resourceFields,
    append: appendResource,
    remove: removeResource
  } = useFieldArray({ control: form.control, name: "resources" });

  const selectedEnvironment = form.watch("environmentSlug");
  const secretPath = form.watch("secretPath");
  const resources = form.watch("resources");
  const temporaryAccessField = form.watch("temporaryAccess");

  const selectablePaths = useMemo(
    () =>
      policies
        .filter((policy) => policy.environments.some((env) => env.slug === selectedEnvironment))
        .map((policy) => policy.secretPath),
    [policies, selectedEnvironment]
  );

  const matchedPolicy = useMemo(
    () =>
      policies.find(
        (policy) =>
          policy.environments.some((env) => env.slug === selectedEnvironment) &&
          policy.secretPath === secretPath
      ),
    [policies, selectedEnvironment, secretPath]
  );

  const isTemporary = temporaryAccessField?.isTemporary;
  const isExpired =
    temporaryAccessField.isTemporary &&
    new Date() > new Date(temporaryAccessField.temporaryAccessEndTime || "");

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    form.setValue("secretPath", "", { shouldValidate: true });
  }, [selectedEnvironment]);

  const addedSubjects = new Set(resources.map((resource) => resource.subject));
  const availableResources = RESOURCE_CONFIGS.filter(
    (config) =>
      !addedSubjects.has(config.subject) &&
      (config.subject !== ProjectPermissionSub.HoneyTokens || subscription?.honeyTokens)
  );

  const summaryRows = resources.flatMap((resource) => {
    const config = RESOURCE_CONFIGS.find((c) => c.subject === resource.subject);
    if (!config) return [];
    const selected = config.actions.filter((action) => resource.actions.includes(action.value));
    return selected.length ? [{ config, selected }] : [];
  });

  const totalSelectedActions = resources.reduce(
    (count, resource) => count + resource.actions.length,
    0
  );

  const toggleAction = (index: number, actionValue: string) => {
    const current = form.getValues(`resources.${index}.actions`);
    const next = current.includes(actionValue)
      ? current.filter((value) => value !== actionValue)
      : [...current, actionValue];
    form.setValue(`resources.${index}.actions`, next, { shouldDirty: true });
  };

  const handleRequestAccess = async (data: TRequestAccessForm) => {
    if (!currentProject) {
      createNotification({
        type: "error",
        text: "No workspace found.",
        title: "Error"
      });
      return;
    }

    const { isTemporary: isTemporaryRequest, temporaryRange } = data.temporaryAccess;

    if (
      matchedPolicy?.maxTimePeriod &&
      (!isTemporaryRequest ||
        !temporaryRange ||
        ms(temporaryRange) > ms(matchedPolicy.maxTimePeriod))
    ) {
      createNotification({
        type: "error",
        text: `Requested access time range is limited to ${matchedPolicy.maxTimePeriod} by policy`,
        title: "Error"
      });
      return;
    }

    const conditions = {
      environment: data.environmentSlug,
      secretPath: { $glob: data.secretPath }
    };
    const permissions = data.resources.flatMap(({ subject, actions }) =>
      actions.map((action) => ({ action, subject: [subject], conditions }))
    );

    await requestAccess.mutateAsync({
      projectSlug: currentProject.slug,
      isTemporary: isTemporaryRequest,
      ...(isTemporaryRequest && temporaryRange && { temporaryRange }),
      permissions,
      note: data.note || undefined
    });

    createNotification({
      type: "success",
      text: "Successfully requested access"
    });
    form.reset();
    if (onClose) onClose();
  };

  const handleGrant = () => {
    const temporaryRange = form.getValues("temporaryAccess.temporaryRange");
    if (!temporaryRange) {
      form.setError(
        "temporaryAccess.temporaryRange",
        { type: "required", message: "Required" },
        { shouldFocus: true }
      );
      return;
    }
    form.clearErrors("temporaryAccess.temporaryRange");
    form.setValue(
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
    form.setValue("temporaryAccess", {
      isTemporary: false,
      temporaryRange: form.getValues("temporaryAccess.temporaryRange")
    });
  };

  const getAccessLabel = () => {
    if (isExpired) return "Access expired";
    if (!temporaryAccessField?.isTemporary) return "Permanent";
    return formatDistance(new Date(temporaryAccessField.temporaryAccessEndTime || ""), new Date());
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleRequestAccess)}
      className="flex flex-1 flex-col gap-4 overflow-hidden"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <Controller
            control={form.control}
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
            control={form.control}
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
        </div>
        <Field>
          <FieldLabel>Resources & Permissions</FieldLabel>
          <div className="rounded-lg border border-border bg-black/20 p-3">
            <div className="flex flex-col gap-3">
              {resourceFields.map((resourceField, index) => {
                const config = RESOURCE_CONFIGS.find((c) => c.subject === resourceField.subject);
                if (!config) return null;
                const selectedValues = resources[index]?.actions ?? [];

                return (
                  <div
                    key={resourceField.id}
                    className="overflow-hidden rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
                      <div
                        className={cn(
                          "flex size-7 items-center justify-center rounded-md border",
                          config.iconTileClassName
                        )}
                      >
                        <config.Icon className="size-4" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{config.label}</span>
                      <IconButton
                        size="xs"
                        variant="ghost-muted"
                        className="ml-auto"
                        aria-label={`Remove ${config.label}`}
                        onClick={() => removeResource(index)}
                      >
                        <XIcon />
                      </IconButton>
                    </div>
                    <div className="flex flex-wrap gap-2 p-3">
                      {config.actions.map((action) => {
                        const isSelected = selectedValues.includes(action.value);

                        return (
                          <Tooltip key={action.value}>
                            <TooltipTrigger asChild>
                              <Button
                                size="xs"
                                variant="outline"
                                aria-pressed={isSelected}
                                onClick={() => toggleAction(index, action.value)}
                                className={cn(
                                  "rounded-md",
                                  isSelected
                                    ? config.chipSelectedClassName
                                    : "text-muted hover:text-foreground"
                                )}
                              >
                                <action.Icon />
                                {action.label}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{action.description}</TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {availableResources.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      isFullWidth
                      className="border-dashed text-label hover:text-foreground"
                    >
                      <PlusIcon />
                      Add resource type
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-(--radix-dropdown-menu-trigger-width)"
                  >
                    {availableResources.map((config) => (
                      <DropdownMenuItem
                        key={config.subject}
                        onSelect={() => appendResource({ subject: config.subject, actions: [] })}
                      >
                        <div
                          className={cn(
                            "flex size-6 items-center justify-center rounded-sm border",
                            config.iconTileClassName
                          )}
                        >
                          <config.Icon className="size-3.5" />
                        </div>
                        {config.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
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
                control={form.control}
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
          control={form.control}
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
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-black/20 p-3">
          <span className="text-xs font-medium tracking-wider text-muted uppercase">
            Request Summary
          </span>
          {summaryRows.length ? (
            <div className="flex flex-col gap-2">
              {summaryRows.map(({ config, selected }) => (
                <HoverCard key={config.subject} openDelay={150}>
                  <HoverCardTrigger asChild>
                    <div className="flex items-center gap-2">
                      <config.Icon className={cn("size-3.5", config.summaryIconClassName)} />
                      <span className="text-sm text-foreground">{config.label}</span>
                      <Badge className={cn("ml-auto rounded-full", config.countBadgeClassName)}>
                        {selected.length} {selected.length === 1 ? "permission" : "permissions"}
                      </Badge>
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent align="end" className="flex w-56 flex-col gap-1.5">
                    {selected.map((action) => (
                      <div
                        key={action.value}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <action.Icon className={cn("size-3.5", config.summaryIconClassName)} />
                        {action.label}
                      </div>
                    ))}
                  </HoverCardContent>
                </HoverCard>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted">
              No resources added yet. Add a resource type to begin.
            </span>
          )}
        </div>
      </div>
      <SheetFooter className="border-t">
        <Button
          type="submit"
          variant="project"
          isPending={form.formState.isSubmitting || requestAccess.isPending}
          isDisabled={!policies.length || !secretPath || totalSelectedActions === 0}
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
