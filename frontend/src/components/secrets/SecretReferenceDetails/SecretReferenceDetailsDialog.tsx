import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subject } from "@casl/ability";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AlertTriangleIcon, EyeIcon, EyeOffIcon, SaveIcon, WorkflowIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
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
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { InfisicalSecretInput } from "@app/components/v3/platform/SecretInput";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  useGetSecretReferences,
  useGetSecretReferenceTree,
  useUpdateSecretV3
} from "@app/hooks/api";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { ProjectEnv, SecretType } from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import {
  formatReferenceEnvironmentList,
  getDraftIngestedSecretReferences,
  getIngestedSecretReferences,
  getUsedBySecretReferences,
  parseSecretReferenceValue,
  SecretReferenceListEntry
} from "./SecretReferenceDetails.utils";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretKey: string;
  secretPath: string;
  environment: string;
  environmentName?: string;
  defaultValue?: string | null;
  isOverride?: boolean;
  isReadOnly?: boolean;
  secretValueHidden?: boolean;
  onNavigateAway?: () => void;
};

const getEnvironmentName = (environments: ProjectEnv[], slug: string, fallback?: string) =>
  environments.find((env) => env.slug === slug)?.name || fallback || slug;

const getReferencePathLabel = (secretPath: string) => (secretPath === "/" ? "" : secretPath);

const SecretReferenceBlockContent = ({
  title,
  entries,
  onSelectReference
}: {
  title: string;
  entries: SecretReferenceListEntry[];
  onSelectReference: (entry: SecretReferenceListEntry) => void;
}) => {
  return entries.map((entry) => (
    <button
      type="button"
      key={`${title}-${entry.secretPath}-${entry.key}`}
      className="group flex h-9 min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-container px-3 text-left text-sm transition-colors hover:bg-container-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => onSelectReference(entry)}
    >
      <span className="min-w-0 truncate font-mono text-foreground">
        {entry.key}
        {getReferencePathLabel(entry.secretPath) && (
          <span className="ml-1 text-xs text-muted">{getReferencePathLabel(entry.secretPath)}</span>
        )}
        {entry.isDraft && (
          <Badge variant="warning" className="ml-1 font-sans">
            Draft
          </Badge>
        )}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
        {formatReferenceEnvironmentList(entry.environments)}
      </span>
    </button>
  ));
};

const SecretReferenceBlocks = ({
  title,
  entries,
  onSelectReference,
  value
}: {
  title: string;
  entries: SecretReferenceListEntry[];
  onSelectReference: (entry: SecretReferenceListEntry) => void;
  value: string;
}) => {
  if (!entries.length) return null;

  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="text-xs font-medium tracking-normal text-accent uppercase">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span>{title}</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded border border-border bg-card px-1.5 text-xs text-foreground tabular-nums">
            {entries.length}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-1.5 pt-0">
        <SecretReferenceBlockContent
          title={title}
          entries={entries}
          onSelectReference={onSelectReference}
        />
      </AccordionContent>
    </AccordionItem>
  );
};

const ParsedSecretValue = ({
  value,
  resolvedReferenceValues,
  isHidden,
  isLoading,
  canToggleVisibility,
  onToggleVisibility,
  onEdit
}: {
  value: string;
  resolvedReferenceValues: Map<string, string | undefined>;
  isHidden: boolean;
  isLoading?: boolean;
  canToggleVisibility: boolean;
  onToggleVisibility: () => void;
  onEdit: () => void;
}) => {
  if (isLoading) return <Skeleton className="h-10 w-full" />;

  const parts = parseSecretReferenceValue(value || "");

  return (
    <div className="relative">
      <button
        type="button"
        className="min-h-10 w-full rounded-md border border-border bg-container py-2 pr-11 pl-3 text-left text-sm transition-colors hover:bg-container-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onEdit}
      >
        <span className="font-mono break-all whitespace-pre-wrap">
          {isHidden ? (
            <span className="text-muted">{HIDDEN_SECRET_VALUE}</span>
          ) : (
            <>
              {/* eslint-disable react/no-array-index-key */}
              {parts.map((part, index) =>
                part.type === "reference" ? (
                  <Tooltip key={`${part.value}-${index}`}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="project"
                        className="mx-0.5 h-auto min-h-6 max-w-full font-mono break-all whitespace-normal"
                      >
                        {resolvedReferenceValues.get(
                          part.value.split(".").filter(Boolean).at(-1) || ""
                        ) ?? `\${${part.value}}`}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="font-mono">{`\${${part.value}}`}</span>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span key={`${part.value}-${index}`} className="text-foreground">
                    {part.value}
                  </span>
                )
              )}
              {/* eslint-enable react/no-array-index-key */}
            </>
          )}
        </span>
      </button>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-1 right-1 size-8"
        onClick={onToggleVisibility}
        isDisabled={!canToggleVisibility}
        aria-label={isHidden ? "Show secret value" : "Hide secret value"}
      >
        {isHidden ? <EyeIcon /> : <EyeOffIcon />}
      </Button>
    </div>
  );
};

export const SecretReferenceDetailsDialog = ({
  isOpen,
  onOpenChange,
  secretKey,
  secretPath,
  environment,
  environmentName,
  defaultValue,
  isOverride,
  isReadOnly,
  secretValueHidden,
  onNavigateAway
}: Props) => {
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false });
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { mutateAsync: updateSecret, isPending: isSaving } = useUpdateSecretV3();

  const projectId = currentProject?.id || "";
  const environments = currentProject?.environments || [];
  const environmentOptions = environments.length
    ? environments
    : [{ id: environment, name: environmentName || environment, slug: environment }];

  const [selectedEnvironment, setSelectedEnvironment] = useState(environment);
  const [formKey, setFormKey] = useState(secretKey);
  const [formValue, setFormValue] = useState("");
  const [baselineValue, setBaselineValue] = useState("");
  const [isValueVisible, setIsValueVisible] = useState(false);
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const valueInputRef = useRef<HTMLTextAreaElement>(null);

  const secretSubject = useMemo(
    () =>
      subject(ProjectPermissionSub.Secrets, {
        environment: selectedEnvironment,
        secretPath,
        secretName: secretKey,
        secretTags: ["*"]
      }),
    [secretKey, secretPath, selectedEnvironment]
  );

  const canReadCurrentValue = hasSecretReadValueOrDescribePermission(
    permission,
    ProjectPermissionSecretActions.ReadValue,
    {
      environment: selectedEnvironment,
      secretPath,
      secretName: secretKey,
      secretTags: ["*"]
    }
  );
  const canEditSecret =
    !isReadOnly && permission.can(ProjectPermissionSecretActions.Edit, secretSubject);
  const canFetchValue =
    isOpen && canReadCurrentValue && !(secretValueHidden && selectedEnvironment === environment);

  const {
    data: secretValueData,
    isPending: isValuePending,
    isError: isValueError
  } = useGetSecretValue(
    {
      projectId,
      environment: selectedEnvironment,
      secretPath,
      secretKey,
      isOverride
    },
    { enabled: Boolean(projectId && selectedEnvironment && secretKey && canFetchValue) }
  );

  const {
    data: referenceTreeData,
    isPending: isReferenceTreePending,
    isError: isReferenceTreeError
  } = useGetSecretReferenceTree({
    secretPath,
    environmentSlug: selectedEnvironment,
    projectId,
    secretKey
  });

  const { data: dependencyTreeData, isError: isDependencyTreeError } = useGetSecretReferences(
    {
      secretPath,
      environment: selectedEnvironment,
      projectId,
      secretKey
    },
    { enabled: Boolean(projectId && selectedEnvironment && secretKey) }
  );

  const fetchedValue = secretValueData?.valueOverride ?? secretValueData?.value;
  const currentRawValue = fetchedValue ?? (secretValueHidden ? "" : (defaultValue ?? ""));
  const isValueDirty = formValue !== baselineValue;
  const isDirty = formKey !== secretKey || isValueDirty;
  const isValueHidden = !isValueVisible || !canReadCurrentValue;
  const resolvedReferenceValues = useMemo(
    () =>
      new Map(
        referenceTreeData?.tree.children.map((child) => [child.key, child.value] as const) ?? []
      ),
    [referenceTreeData?.tree.children]
  );
  const ingestedReferences = isValueDirty
    ? getDraftIngestedSecretReferences({
        value: formValue,
        environment: selectedEnvironment,
        secretPath
      })
    : getIngestedSecretReferences(referenceTreeData?.tree);
  const usedByReferences = getUsedBySecretReferences(dependencyTreeData?.tree);
  const hasReferenceSections = Boolean(ingestedReferences.length || usedByReferences.length);
  useEffect(() => {
    if (!isOpen) return;

    setSelectedEnvironment(environment);
    setFormKey(secretKey);
    setIsValueVisible(false);
    setIsEditingValue(false);
    setFormError(null);
  }, [environment, isOpen, secretKey]);

  useEffect(() => {
    if (!isOpen || isValueDirty) return;

    setFormValue(currentRawValue);
    setBaselineValue(currentRawValue);
  }, [currentRawValue, isOpen, isValueDirty]);

  useEffect(() => {
    if (!isEditingValue) return;

    valueInputRef.current?.focus();
  }, [isEditingValue]);

  const requestClose = useCallback(
    (closeAction?: () => void) => {
      if (isDirty) {
        setPendingCloseAction(() => closeAction || (() => onOpenChange(false)));
        setIsDiscardDialogOpen(true);
        return;
      }

      if (closeAction) {
        closeAction();
        return;
      }

      onOpenChange(false);
    },
    [isDirty, onOpenChange]
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    requestClose();
  };

  const handleDiscard = () => {
    setFormKey(secretKey);
    setFormValue(baselineValue);
    setSelectedEnvironment(environment);
    setIsEditingValue(false);
    setIsDiscardDialogOpen(false);
    pendingCloseAction?.();
    setPendingCloseAction(null);
  };

  const handleSelectReference = (entry: SecretReferenceListEntry) => {
    const targetEnvironment = entry.environments[0] || selectedEnvironment;

    requestClose(() => {
      onOpenChange(false);
      onNavigateAway?.();
      navigate({
        to: ROUTE_PATHS.SecretManager.OverviewPage.path,
        params: {
          orgId: routeParams.orgId as string,
          projectId
        },
        search: {
          secretPath: entry.secretPath || "/",
          search: entry.key,
          environments: [targetEnvironment]
        }
      });
    });
  };

  const handleSave = async () => {
    if (!canEditSecret || !isDirty || !formKey.trim()) return;

    setFormError(null);

    try {
      const result = await updateSecret({
        projectId,
        environment: selectedEnvironment,
        secretPath,
        secretKey,
        type: isOverride ? SecretType.Personal : SecretType.Shared,
        newSecretName: formKey !== secretKey ? formKey : undefined,
        secretValue: isValueDirty ? formValue : undefined
      });

      if ("approval" in result) {
        createNotification({
          type: "info",
          text: "Requested change has been sent for review"
        });
      } else {
        createNotification({ type: "success", text: `Secret "${formKey}" updated` });
      }

      onOpenChange(false);
    } catch (error) {
      console.error(error);
      setFormError("Could not save secret reference details. Check your access and try again.");
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] max-w-4xl gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="gap-1.5 p-6 pb-4">
            <DialogTitle className="text-xl text-balance">Secret Reference Details</DialogTitle>
            <DialogDescription className="text-pretty">
              View and update the secret alongside its references and dependents.
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="flex max-h-[calc(100dvh-14rem)] thin-scrollbar flex-col gap-5 overflow-y-auto p-6">
            <div className="grid grid-cols-[minmax(0,1fr)_11rem] gap-3">
              <Field>
                <FieldLabel htmlFor="secret-reference-key">Key</FieldLabel>
                <FieldContent>
                  <Input
                    id="secret-reference-key"
                    value={formKey}
                    onChange={(e) => setFormKey(e.target.value)}
                    isError={!formKey.trim()}
                    disabled={!canEditSecret || isSaving}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <FieldError>{!formKey.trim() ? "Secret key is required." : null}</FieldError>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="secret-reference-environment">Environment</FieldLabel>
                <Select
                  value={selectedEnvironment}
                  onValueChange={(value) => {
                    setSelectedEnvironment(value);
                    setIsEditingValue(false);
                  }}
                  disabled={isSaving || isDirty}
                >
                  <SelectTrigger id="secret-reference-environment" className="w-full">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {environmentOptions.map((env) => (
                      <SelectItem key={env.slug} value={env.slug}>
                        {env.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="secret-reference-value">Value</FieldLabel>
              <FieldContent>
                {isEditingValue ? (
                  <InfisicalSecretInput
                    id="secret-reference-value"
                    ref={valueInputRef}
                    value={formValue}
                    onChange={(value) => {
                      setFormValue(value);
                    }}
                    isVisible={isValueVisible && canReadCurrentValue}
                    isReadOnly={!canEditSecret || isSaving || isValuePending || isValueError}
                    isLoadingValue={isValuePending}
                    isErrorLoadingValue={isValueError}
                    secretPath={secretPath}
                    environment={selectedEnvironment}
                    canEditButNotView={!canReadCurrentValue && canEditSecret}
                    containerClassName="bg-container"
                    onBlur={() => setIsEditingValue(false)}
                  />
                ) : (
                  <ParsedSecretValue
                    value={formValue}
                    resolvedReferenceValues={resolvedReferenceValues}
                    isHidden={isValueHidden}
                    isLoading={isValuePending || (isValueVisible && isReferenceTreePending)}
                    canToggleVisibility={canReadCurrentValue}
                    onToggleVisibility={() => setIsValueVisible((isVisible) => !isVisible)}
                    onEdit={() => {
                      if (canEditSecret) setIsEditingValue(true);
                    }}
                  />
                )}
                <FieldDescription className="text-center">
                  Type <span className="font-mono text-foreground">{"${"}</span> to insert a
                  reference to an existing secret.
                </FieldDescription>
                {isValueError && <FieldError>Could not load this secret value.</FieldError>}
                {isReferenceTreeError && isValueVisible && (
                  <FieldError>Could not load referenced secret values.</FieldError>
                )}
              </FieldContent>
            </Field>

            {hasReferenceSections && (
              <Accordion
                variant="ghost"
                type="multiple"
                defaultValue={["variables"]}
                className="flex flex-col gap-2"
              >
                <SecretReferenceBlocks
                  title="Variables"
                  entries={ingestedReferences}
                  onSelectReference={handleSelectReference}
                  value="variables"
                />
                <SecretReferenceBlocks
                  title="Used By"
                  entries={usedByReferences}
                  onSelectReference={handleSelectReference}
                  value="used-by"
                />
              </Accordion>
            )}

            {(isReferenceTreeError || isDependencyTreeError) && (
              <div className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  Some reference details could not be loaded for{" "}
                  {getEnvironmentName(environments, selectedEnvironment, environmentName)}.
                </span>
              </div>
            )}
            {formError && <FieldError>{formError}</FieldError>}
          </div>
          <Separator />
          <DialogFooter className="p-4">
            <Button variant="ghost" onClick={() => requestClose()} isDisabled={isSaving}>
              Cancel
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant={isDirty ? "project" : "outline"}
                    onClick={handleSave}
                    isDisabled={!isDirty || !canEditSecret || !formKey.trim()}
                    isPending={isSaving}
                  >
                    <SaveIcon />
                    Save
                  </Button>
                </span>
              </TooltipTrigger>
              {!canEditSecret && <TooltipContent>Access Denied</TooltipContent>}
            </Tooltip>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <WorkflowIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits to this secret reference view. Discard them to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="project" onClick={handleDiscard}>
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
