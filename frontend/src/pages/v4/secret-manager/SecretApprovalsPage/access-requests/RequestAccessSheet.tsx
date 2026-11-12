import { useId, useState } from "react";
import ms from "ms";

import { useDiscardChangesGuard } from "@app/components/v4/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { DurationInput } from "@app/components/v4/ui/duration-input";
import { Field } from "@app/components/v4/ui/field";
import { Stack } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Textarea } from "@app/components/v4/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TAccessApprovalPolicy } from "@app/hooks/api/accessApproval/types";
import type { Project } from "@app/hooks/api/projects/types";
import {
  getAccessDurationLabel,
  parseAccessDurationMs
} from "@app/pages/secret-manager/SecretApprovalsPage/components/AccessApprovalRequest/AccessApprovalRequest.utils";

import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";

type ResourceAction = { value: string; label: string; description: string };

const RESOURCES: { subject: ProjectPermissionSub; label: string; actions: ResourceAction[] }[] = [
  {
    subject: ProjectPermissionSub.Secrets,
    label: "Secrets",
    actions: [
      { value: ProjectPermissionActions.Read, label: "View", description: "Read secret values" },
      {
        value: ProjectPermissionActions.Create,
        label: "Create",
        description: "Create new secrets"
      },
      {
        value: ProjectPermissionActions.Edit,
        label: "Modify",
        description: "Update existing secrets"
      },
      {
        value: ProjectPermissionActions.Delete,
        label: "Delete",
        description: "Delete existing secrets"
      }
    ]
  },
  {
    subject: ProjectPermissionSub.SecretFolders,
    label: "Folders",
    actions: [
      {
        value: ProjectPermissionActions.Create,
        label: "Create",
        description: "Create new folders to organize secrets"
      },
      {
        value: ProjectPermissionActions.Edit,
        label: "Modify",
        description: "Rename or modify folder properties"
      },
      {
        value: ProjectPermissionActions.Delete,
        label: "Delete",
        description: "Delete folders and their contents"
      }
    ]
  },
  {
    subject: ProjectPermissionSub.DynamicSecrets,
    label: "Dynamic secrets",
    actions: [
      {
        value: ProjectPermissionDynamicSecretActions.ReadRootCredential,
        label: "View",
        description: "View the root credentials used for dynamic secret generation"
      },
      {
        value: ProjectPermissionDynamicSecretActions.CreateRootCredential,
        label: "Create",
        description: "Configure new root credentials for dynamic secrets"
      },
      {
        value: ProjectPermissionDynamicSecretActions.EditRootCredential,
        label: "Modify",
        description: "Update existing root credentials configuration"
      },
      {
        value: ProjectPermissionDynamicSecretActions.DeleteRootCredential,
        label: "Delete",
        description: "Delete root credentials configuration"
      },
      {
        value: ProjectPermissionDynamicSecretActions.Lease,
        label: "Lease",
        description: "Create and revoke dynamic secret leases"
      }
    ]
  },
  {
    subject: ProjectPermissionSub.SecretRotation,
    label: "Secret rotation",
    actions: [
      {
        value: ProjectPermissionSecretRotationActions.Read,
        label: "View",
        description: "View secret rotation configurations"
      },
      {
        value: ProjectPermissionSecretRotationActions.ReadGeneratedCredentials,
        label: "Read credentials",
        description: "Access rotated credential values"
      },
      {
        value: ProjectPermissionSecretRotationActions.Create,
        label: "Create",
        description: "Create new secret rotation configuration"
      },
      {
        value: ProjectPermissionSecretRotationActions.Edit,
        label: "Modify",
        description: "Update rotation configuration"
      },
      {
        value: ProjectPermissionSecretRotationActions.Delete,
        label: "Delete",
        description: "Delete rotation configurations"
      },
      {
        value: ProjectPermissionSecretRotationActions.RotateSecrets,
        label: "Rotate",
        description: "Manually trigger secret rotation"
      }
    ]
  },
  {
    subject: ProjectPermissionSub.SecretImports,
    label: "Secret imports",
    actions: [
      {
        value: ProjectPermissionActions.Read,
        label: "View",
        description: "View imported secrets from other projects"
      },
      {
        value: ProjectPermissionActions.Create,
        label: "Create",
        description: "Set up new secret imports"
      },
      {
        value: ProjectPermissionActions.Edit,
        label: "Modify",
        description: "Change import configuration"
      },
      {
        value: ProjectPermissionActions.Delete,
        label: "Delete",
        description: "Remove secret imports"
      }
    ]
  },
  {
    subject: ProjectPermissionSub.HoneyTokens,
    label: "Honey tokens",
    actions: [
      {
        value: ProjectPermissionHoneyTokenActions.Read,
        label: "View",
        description: "View honey tokens and events"
      },
      {
        value: ProjectPermissionHoneyTokenActions.ReadCredentials,
        label: "Read credentials",
        description: "Reveal honey token credentials"
      },
      {
        value: ProjectPermissionHoneyTokenActions.Create,
        label: "Create",
        description: "Create honey tokens"
      },
      {
        value: ProjectPermissionHoneyTokenActions.Edit,
        label: "Modify",
        description: "Update honey token metadata and mappings"
      },
      {
        value: ProjectPermissionHoneyTokenActions.Reset,
        label: "Reset",
        description: "Reset triggered honey tokens"
      },
      {
        value: ProjectPermissionHoneyTokenActions.Revoke,
        label: "Revoke",
        description: "Revoke honey tokens and credentials"
      }
    ]
  }
];

const INVALID_DURATION = "Enter a duration greater than 0.";
const maxDurationMessage = (maxTimePeriod: string) =>
  `Requested access duration is limited to ${maxTimePeriod} by policy`;

type Resource = { subject: ProjectPermissionSub; actions: string[] };
type Draft = {
  environment: string;
  secretPath: string;
  resources: Resource[];
  isTemporary: boolean;
  temporaryRange: string;
  note: string;
};
type Errors = Partial<Record<"secretPath" | "resources" | "temporaryRange", string>>;

export const RequestAccessSheet = ({
  project,
  policies,
  honeyTokens,
  onClose
}: {
  project: Project;
  policies: TAccessApprovalPolicy[];
  honeyTokens: boolean;
  onClose: () => void;
}) => {
  const createRequest = useV4Adapter("accessApprovals").useCreateRequest();
  const formId = useId();
  const initial: Draft = {
    environment: project.environments[0]?.slug ?? "",
    secretPath: "",
    resources: [{ subject: ProjectPermissionSub.Secrets, actions: [] }],
    isTemporary: false,
    temporaryRange: "1h",
    note: ""
  };
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });

  const selectablePaths = policies
    .filter((policy) => policy.environments.some((env) => env.slug === draft.environment))
    .map((policy) => policy.secretPath);
  const matchedPolicy = policies.find(
    (policy) =>
      policy.environments.some((env) => env.slug === draft.environment) &&
      policy.secretPath === draft.secretPath
  );
  const maxDurationMs = matchedPolicy?.maxTimePeriod ? ms(matchedPolicy.maxTimePeriod) : null;
  const addedSubjects = new Set(draft.resources.map((resource) => resource.subject));
  const available = RESOURCES.filter(
    (config) =>
      !addedSubjects.has(config.subject) &&
      (config.subject !== ProjectPermissionSub.HoneyTokens || honeyTokens)
  );

  const update = (patch: Partial<Draft>, cleared: (keyof Errors)[] = []) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (cleared.length)
      setErrors((current) => {
        const next = { ...current };
        cleared.forEach((key) => delete next[key]);
        return next;
      });
  };

  const choosePath = (secretPath: string) => {
    const policy = policies.find(
      (entry) =>
        entry.environments.some((env) => env.slug === draft.environment) &&
        entry.secretPath === secretPath
    );
    const policyMax = policy?.maxTimePeriod ? ms(policy.maxTimePeriod) : null;
    const rangeMs = parseAccessDurationMs(draft.temporaryRange);
    const withinPolicy = draft.isTemporary && rangeMs && policyMax && rangeMs <= policyMax;
    update(
      policy?.maxTimePeriod && !withinPolicy
        ? { secretPath, isTemporary: true, temporaryRange: policy.maxTimePeriod }
        : { secretPath },
      ["secretPath", "temporaryRange"]
    );
  };

  const setResourceActions = (index: number, actions: string[]) =>
    update(
      {
        resources: draft.resources.map((resource, position) =>
          position === index ? { ...resource, actions } : resource
        )
      },
      ["resources"]
    );

  const submit = async () => {
    const rangeMs = parseAccessDurationMs(draft.temporaryRange);
    let rangeError: string | undefined;
    if (draft.isTemporary && !rangeMs) rangeError = INVALID_DURATION;
    else if (
      matchedPolicy?.maxTimePeriod &&
      maxDurationMs &&
      (!draft.isTemporary || (rangeMs ?? 0) > maxDurationMs)
    )
      rangeError = maxDurationMessage(matchedPolicy.maxTimePeriod);
    const next: Errors = {
      secretPath: draft.secretPath ? undefined : "Select a secret path",
      resources: draft.resources.some((resource) => resource.actions.length)
        ? undefined
        : "Select at least one permission",
      temporaryRange: rangeError
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const conditions = {
      environment: draft.environment,
      secretPath: { $glob: draft.secretPath }
    };
    setPending(true);
    try {
      await createRequest.mutateAsync({
        projectSlug: project.slug,
        isTemporary: draft.isTemporary,
        ...(draft.isTemporary && { temporaryRange: draft.temporaryRange }),
        permissions: draft.resources.flatMap(({ subject, actions }) =>
          actions.map((action) => ({ action, subject: [subject], conditions }))
        ),
        note: draft.note.trim() || undefined
      } as Parameters<typeof createRequest.mutateAsync>[0]);
      saved("Access requested");
      onClose();
    } catch (error) {
      failed("Failed to request access", error);
      setPending(false);
    }
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && requestDiscard()}>
        <SheetContent size="md" pending={pending}>
          <SheetHeader>
            <SheetTitle>Request access</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <form
              id={formId}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Stack gap={16}>
                <Field label="Environment">
                  <Combobox
                    label="Environment"
                    options={project.environments.map((environment) => ({
                      value: environment.slug,
                      label: environment.name
                    }))}
                    value={draft.environment}
                    placeholder="Select an environment"
                    onValueChange={(environment) => {
                      if (environment === draft.environment) return;
                      update({ environment, secretPath: "" }, ["secretPath"]);
                    }}
                  />
                </Field>
                <Field
                  label="Secret path"
                  error={errors.secretPath}
                  description={
                    selectablePaths.length
                      ? undefined
                      : "The selected environment doesn't have any policies."
                  }
                >
                  <Combobox
                    label="Secret path"
                    mono
                    options={selectablePaths.map((path) => ({ value: path, label: path }))}
                    value={draft.secretPath}
                    disabled={!selectablePaths.length}
                    invalid={Boolean(errors.secretPath)}
                    placeholder="Select a secret path"
                    onValueChange={choosePath}
                  />
                </Field>
                <Field label="Resources and permissions" group error={errors.resources}>
                  <Stack gap={8}>
                    {draft.resources.map((resource, index) => {
                      const config = RESOURCES.find((entry) => entry.subject === resource.subject)!;
                      return (
                        <Card
                          key={resource.subject}
                          variant="framed"
                          size="sm"
                          title={config.label}
                          action={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              icon="x"
                              iconOnly
                              aria-label={`Remove ${config.label}`}
                              onClick={() =>
                                update({
                                  resources: draft.resources.filter(
                                    (_, position) => position !== index
                                  )
                                })
                              }
                            />
                          }
                        >
                          <ToggleGroup
                            type="multiple"
                            aria-label={`${config.label} permissions`}
                            spacing={8}
                            value={resource.actions}
                            onValueChange={(actions: string[]) =>
                              setResourceActions(index, actions)
                            }
                          >
                            {config.actions.map((action) => (
                              <Tooltip key={action.value} content={action.description}>
                                <ToggleGroupItem value={action.value}>
                                  {action.label}
                                </ToggleGroupItem>
                              </Tooltip>
                            ))}
                          </ToggleGroup>
                        </Card>
                      );
                    })}
                    {available.length > 0 && (
                      <div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" icon="plus">
                              Add resource type
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {available.map((config) => (
                              <DropdownMenuItem
                                key={config.subject}
                                onSelect={() =>
                                  update({
                                    resources: [
                                      ...draft.resources,
                                      { subject: config.subject, actions: [] }
                                    ]
                                  })
                                }
                              >
                                {config.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </Stack>
                </Field>
                <Stack gap={8}>
                  <Checkbox
                    label="Expire access"
                    checked={draft.isTemporary}
                    disabled={Boolean(maxDurationMs)}
                    description={
                      matchedPolicy?.maxTimePeriod
                        ? `Maximum duration allowed by policy: ${matchedPolicy.maxTimePeriod}`
                        : undefined
                    }
                    onChange={(isTemporary) => update({ isTemporary }, ["temporaryRange"])}
                  />
                  {draft.isTemporary && (
                    <Field
                      label="Duration"
                      error={errors.temporaryRange}
                      description={
                        errors.temporaryRange
                          ? undefined
                          : getAccessDurationLabel(true, draft.temporaryRange)
                      }
                    >
                      <DurationInput
                        value={draft.temporaryRange}
                        invalid={Boolean(errors.temporaryRange)}
                        placeholder="1"
                        onChange={(temporaryRange) =>
                          update({ temporaryRange }, ["temporaryRange"])
                        }
                      />
                    </Field>
                  )}
                </Stack>
                <Field label="Note" optional>
                  <Textarea
                    rows={3}
                    maxLength={255}
                    value={draft.note}
                    placeholder="Add the reason for this access request..."
                    onChange={(event) => update({ note: event.target.value })}
                  />
                </Field>
              </Stack>
            </form>
          </SheetBody>
          <SheetFooter>
            <Button variant="primary" type="submit" form={formId} loading={pending}>
              Request access
            </Button>
            <Button variant="outline" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard access request?"
        description="Your unsaved changes to this access request will be lost."
      />
    </>
  );
};
