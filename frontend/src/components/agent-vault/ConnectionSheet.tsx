import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep,
  TextArea
} from "@app/components/v3";
import { AgentVaultTemplate } from "@app/helpers/agentVaultTemplates";
import { useDiscardChangesGuard, useWizardSteps } from "@app/hooks";
import {
  AgentVaultCredentialType,
  useCreateAgentVaultConnection,
  useUpdateAgentVaultConnection
} from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";
import { onRequestError } from "@app/hooks/api/reactQuery";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

import { ConnectionTemplateSelect } from "./ConnectionTemplateSelect";

const credentialSettingsDiffer = (
  data: {
    credentialType: AgentVaultCredentialType;
    headerName?: string;
    headerPrefix?: string;
    username?: string;
  },
  connection: TAgentVaultConnection
) => {
  const stored = connection.credential;
  if (data.credentialType !== stored.type) return true;
  if (stored.type === AgentVaultCredentialType.Bearer) {
    return (
      (data.headerName || "Authorization") !== stored.headerName ||
      (data.headerPrefix ?? "") !== stored.headerPrefix
    );
  }
  if (stored.type === AgentVaultCredentialType.Basic) return data.username !== stored.username;
  return false;
};

// The secret rules depend on whether a connection already exists: required on create, and on edit
// required again whenever the settings that govern how it is sent change, because the API replaces
// the credential as a whole or not at all. Keeping them in the schema means Continue blocks on the
// step that owns the field and onFormInvalid jumps there, rather than Save failing silently.
const buildSchema = (connection?: TAgentVaultConnection | null) =>
  z
    .object({
      name: slugSchema({ max: 64, field: "Name" }),
      hostPattern: z
        .string()
        .trim()
        .min(1, "Required")
        .max(1024)
        .refine((value) => !value.includes("://"), "Remove the scheme, for example https://")
        .refine(
          (value) => !value.includes("/"),
          "A connection covers a whole host, so remove everything from the first /"
        )
        .refine(
          (value) => value.split(",").every((entry) => entry.trim().length > 0),
          "Remove the empty entry"
        )
        .refine(
          (value) =>
            value.split(",").every((entry) => entry.trim() !== "*" && entry.trim() !== "*."),
          "Name specific hosts. A bare wildcard is too broad."
        ),
      credentialType: z.nativeEnum(AgentVaultCredentialType),
      headerName: z.string().trim().max(128).optional(),
      headerPrefix: z.string().trim().max(64).optional(),
      username: z.string().trim().max(256).optional(),
      secret: z.string().max(8192).optional()
    })
    .superRefine((data, ctx) => {
      const needsSecret = data.credentialType !== AgentVaultCredentialType.Passthrough;

      if (data.credentialType === AgentVaultCredentialType.Basic && !data.username) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["username"], message: "Required" });
      }

      if (!needsSecret || data.secret) return;

      if (!connection) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secret"], message: "Required" });
      } else if (credentialSettingsDiffer(data, connection)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["secret"],
          message: "Enter the secret again to change how it is sent."
        });
      }
    });

type FormData = z.infer<ReturnType<typeof buildSchema>>;

const STEP_KEYS = ["template", "credential", "scope", "review"] as const;
type StepKey = (typeof STEP_KEYS)[number];

const STEP_FIELDS: Record<StepKey, string[]> = {
  template: [],
  credential: ["credentialType", "headerName", "headerPrefix", "username", "secret"],
  scope: ["hostPattern"],
  review: ["name"]
};

const CREDENTIAL_LABELS: Record<AgentVaultCredentialType, string> = {
  [AgentVaultCredentialType.Bearer]: "Bearer / header token",
  [AgentVaultCredentialType.Basic]: "Basic auth",
  [AgentVaultCredentialType.Passthrough]: "Pass-through"
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessBundleId: string;
  // Present in edit mode; absent when creating.
  connection?: TAgentVaultConnection | null;
};

export const ConnectionSheet = ({ isOpen, onOpenChange, accessBundleId, connection }: Props) => {
  const isUpdate = Boolean(connection);
  const createConnection = useCreateAgentVaultConnection();
  const updateConnection = useUpdateAgentVaultConnection();

  const [template, setTemplate] = useState<AgentVaultTemplate | null>(null);
  const [hasPickedTemplate, setHasPickedTemplate] = useState(false);

  const schema = useMemo(() => buildSchema(connection), [connection]);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    trigger,
    watch,
    formState: { isDirty, isSubmitting }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => onOpenChange(false) });

  // Editing an existing connection has nothing to pick, so the template step is dropped entirely.
  const stepKeys: readonly StepKey[] = useMemo(
    () => (isUpdate ? ["credential", "scope", "review"] : [...STEP_KEYS]),
    [isUpdate]
  );

  const { step, currentStepKey, isLastStep, goBack, goNext, onFormInvalid, setStep } =
    useWizardSteps<StepKey>({
      stepKeys,
      stepFields: STEP_FIELDS,
      invalidMessage: "Fix the errors before saving.",
      validateStep: (fields) => trigger(fields as (keyof FormData)[])
    });

  useEffect(() => {
    if (!isOpen) return;

    setStep(0);
    setTemplate(null);
    setHasPickedTemplate(isUpdate);

    if (connection) {
      const { credential } = connection;
      reset({
        name: connection.name,
        hostPattern: connection.hostPattern,
        credentialType: credential.type,
        headerName:
          credential.type === AgentVaultCredentialType.Bearer ? credential.headerName : undefined,
        headerPrefix:
          credential.type === AgentVaultCredentialType.Bearer ? credential.headerPrefix : undefined,
        username:
          credential.type === AgentVaultCredentialType.Basic ? credential.username : undefined,
        secret: ""
      });
    } else {
      reset({
        name: "",
        hostPattern: "",
        credentialType: AgentVaultCredentialType.Bearer,
        headerName: "Authorization",
        headerPrefix: "Bearer",
        username: "",
        secret: ""
      });
    }
  }, [isOpen, connection, isUpdate, reset, setStep]);

  const credentialType = watch("credentialType");
  const headerName = watch("headerName");
  const headerPrefix = watch("headerPrefix");

  const handleTemplatePicked = (picked: AgentVaultTemplate | null) => {
    setTemplate(picked);
    setHasPickedTemplate(true);

    if (picked) {
      const cred = picked.credential;
      reset({
        name: picked.key,
        hostPattern: picked.hostPattern,
        credentialType: cred.type,
        headerName:
          cred.type === AgentVaultCredentialType.Bearer ? (cred.headerName ?? "Authorization") : "",
        headerPrefix:
          cred.type === AgentVaultCredentialType.Bearer ? (cred.headerPrefix ?? "Bearer") : "",
        username: "",
        secret: ""
      });
    }
    setStep(1);
  };

  const buildCredential = (data: FormData) => {
    if (data.credentialType === AgentVaultCredentialType.Passthrough) {
      return { type: AgentVaultCredentialType.Passthrough as const };
    }
    if (data.credentialType === AgentVaultCredentialType.Basic) {
      return {
        type: AgentVaultCredentialType.Basic as const,
        username: data.username ?? "",
        password: data.secret ?? ""
      };
    }
    return {
      type: AgentVaultCredentialType.Bearer as const,
      headerName: data.headerName || undefined,
      headerPrefix: data.headerPrefix ?? "",
      value: data.secret ?? ""
    };
  };

  const onSubmit = async (data: FormData) => {
    const needsSecret = data.credentialType !== AgentVaultCredentialType.Passthrough;
    // The schema has already required a secret wherever the wire settings changed, so a blank one
    // here means nothing about the credential moved and the stored secret can stay.
    const keepsStoredSecret = isUpdate && needsSecret && !data.secret;

    try {
      const result = connection
        ? await updateConnection.mutateAsync({
            accessBundleId,
            connectionId: connection.id,
            name: data.name,
            hostPattern: data.hostPattern,
            credential: keepsStoredSecret ? undefined : buildCredential(data)
          })
        : await createConnection.mutateAsync({
            accessBundleId,
            name: data.name,
            hostPattern: data.hostPattern,
            credential: buildCredential(data)
          });

      createNotification({
        text: `Connection "${data.name}" ${isUpdate ? "updated" : "created"}`,
        type: "success"
      });

      // Cross-bundle overlaps are informational, and the mint sheet shows them again when someone
      // combines the two bundles, so they go out as toasts rather than holding the sheet open.
      result.warnings.slice(0, 3).forEach((warning) => {
        createNotification({
          type: "warning",
          title: `${warning.connectionName} in ${warning.accessBundleName} also covers ${warning.patterns.join(", ")}`,
          text: "If one session carries both bundles, the earlier one wins for those hosts."
        });
      });
      if (result.warnings.length > 3) {
        createNotification({
          type: "warning",
          text: `${result.warnings.length - 3} more connections in other bundles overlap these hosts.`
        });
      }

      onOpenChange(false);
    } catch (error) {
      const serverResponse = axios.isAxiosError(error)
        ? (error.response?.data as TApiErrors | undefined)
        : undefined;

      // The two failures that name the Hosts field land on it, with the wizard moved back to that
      // step; everything else keeps the repo's standard error handling.
      if (
        serverResponse?.error === ApiErrorTypes.BadRequestError &&
        serverResponse.message.includes("already covers")
      ) {
        setError("hostPattern", { type: "server", message: serverResponse.message });
        setStep(stepKeys.indexOf("scope"));
        return;
      }

      if (serverResponse?.error === ApiErrorTypes.ValidationError) {
        const hostIssues = serverResponse.message.filter(
          (issue) => issue.path[0] === "hostPattern"
        );
        if (hostIssues.length > 0) {
          setError("hostPattern", {
            type: "server",
            message: hostIssues.map((issue) => issue.message).join(" ")
          });
          setStep(stepKeys.indexOf("scope"));
        }
        if (hostIssues.length < serverResponse.message.length) onRequestError(error);
      }
    }
  };

  const sendsPreview = () => {
    if (credentialType === AgentVaultCredentialType.Passthrough) return "Nothing is added.";
    if (credentialType === AgentVaultCredentialType.Basic) {
      return "Authorization: Basic ••••••••";
    }
    const prefix = headerPrefix ? `${headerPrefix} ` : "";
    return `${headerName || "Authorization"}: ${prefix}••••••••`;
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        requestDiscard();
      }}
    >
      <SheetContent className="sm:max-w-6xl">
        <SheetHeader>
          <SheetTitle>{isUpdate ? "Edit Connection" : "Add Connection"}</SheetTitle>
          <SheetDescription>
            A connection is one set of hosts plus the credential the proxy attaches to them.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit(onSubmit, onFormInvalid)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-4 lg:grid-cols-[200px_1fr_260px]">
            <Stepper activeStep={step} orientation="vertical">
              <StepperList>
                {stepKeys.map((key, index) => (
                  <StepperStep
                    key={key}
                    index={index}
                    title={
                      {
                        template: "Template",
                        credential: "Credential",
                        scope: "Scope",
                        review: "Review"
                      }[key]
                    }
                  />
                ))}
              </StepperList>
            </Stepper>

            <div className="flex flex-col gap-5">
              {currentStepKey === "template" && (
                <ConnectionTemplateSelect onSelect={handleTemplatePicked} />
              )}

              {currentStepKey === "credential" && (
                <>
                  <Controller
                    control={control}
                    name="credentialType"
                    render={({ field }) => (
                      <Field>
                        <FieldLabel>Credential Type</FieldLabel>
                        <FieldContent>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {Object.values(AgentVaultCredentialType).map((value) => (
                                <SelectItem key={value} value={value}>
                                  {CREDENTIAL_LABELS[value]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldContent>
                      </Field>
                    )}
                  />

                  {credentialType === AgentVaultCredentialType.Bearer && (
                    <>
                      <Controller
                        control={control}
                        name="headerName"
                        render={({ field, fieldState }) => (
                          <Field>
                            <FieldLabel>Header Name</FieldLabel>
                            <FieldContent>
                              <Input {...field} placeholder="Authorization" />
                              <FieldError>{fieldState.error?.message}</FieldError>
                            </FieldContent>
                          </Field>
                        )}
                      />
                      <Controller
                        control={control}
                        name="headerPrefix"
                        render={({ field, fieldState }) => (
                          <Field>
                            <FieldLabel>Prefix</FieldLabel>
                            <FieldContent>
                              <Input {...field} placeholder="Bearer" />
                              <FieldDescription>
                                Leave blank for headers that carry the key on its own.
                              </FieldDescription>
                              <FieldError>{fieldState.error?.message}</FieldError>
                            </FieldContent>
                          </Field>
                        )}
                      />
                    </>
                  )}

                  {credentialType === AgentVaultCredentialType.Basic && (
                    <Controller
                      control={control}
                      name="username"
                      render={({ field, fieldState }) => (
                        <Field>
                          <FieldLabel>Username</FieldLabel>
                          <FieldContent>
                            <Input {...field} placeholder="bot@acme.dev" />
                            <FieldError>{fieldState.error?.message}</FieldError>
                          </FieldContent>
                        </Field>
                      )}
                    />
                  )}

                  {credentialType !== AgentVaultCredentialType.Passthrough && (
                    <Controller
                      control={control}
                      name="secret"
                      render={({ field, fieldState }) => (
                        <Field>
                          <FieldLabel>
                            {credentialType === AgentVaultCredentialType.Basic
                              ? "Password"
                              : "Value"}
                          </FieldLabel>
                          <FieldContent>
                            <SecretInput
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              containerClassName="rounded-md border border-border bg-container px-2 py-1.5"
                            />
                            {isUpdate && (
                              <FieldDescription>
                                Leave blank to keep the current secret.
                              </FieldDescription>
                            )}
                            <FieldError>{fieldState.error?.message}</FieldError>
                          </FieldContent>
                        </Field>
                      )}
                    />
                  )}

                  {credentialType === AgentVaultCredentialType.Passthrough && (
                    <Alert variant="info">
                      <AlertTitle>No credential is attached</AlertTitle>
                      <AlertDescription>
                        Under a proxy that allows unmatched hosts this only terminates TLS. It earns
                        its keep on a proxy set to deny.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Field>
                    <FieldLabel>Sends</FieldLabel>
                    <FieldContent>
                      <div className="rounded-md border border-border bg-container px-3 py-2 font-mono text-xs">
                        {sendsPreview()}
                      </div>
                      <FieldDescription>
                        Any header the agent already set with this name is replaced.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </>
              )}

              {currentStepKey === "scope" && (
                <Controller
                  control={control}
                  name="hostPattern"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel>Hosts</FieldLabel>
                      <FieldContent>
                        <TextArea {...field} rows={3} placeholder="api.datadoghq.com" />
                        <FieldDescription>
                          Comma separated. No scheme and no path. A portless host means port 443. A
                          wildcard covers exactly one leftmost label, as in *.example.com.
                        </FieldDescription>
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
              )}

              {currentStepKey === "review" && (
                <>
                  <Controller
                    control={control}
                    name="name"
                    render={({ field, fieldState }) => (
                      <Field>
                        <FieldLabel>Name</FieldLabel>
                        <FieldContent>
                          <Input {...field} placeholder="datadog-us5" />
                          <FieldDescription>
                            Lowercase letters, numbers and hyphens.
                          </FieldDescription>
                          <FieldError>{fieldState.error?.message}</FieldError>
                        </FieldContent>
                      </Field>
                    )}
                  />
                  <div className="rounded-md border border-border bg-container p-3 text-sm">
                    <div className="mb-1 text-xs text-accent">Sends</div>
                    <div className="font-mono text-xs">{sendsPreview()}</div>
                    <div className="mt-3 mb-1 text-xs text-accent">To</div>
                    <div className="font-mono text-xs">{watch("hostPattern")}</div>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-3 text-xs">
              {template && (
                <>
                  <div className="text-accent">{template.description}</div>
                  {template.caveat && (
                    <Alert variant="warning">
                      <TriangleAlertIcon />
                      <AlertDescription>{template.caveat}</AlertDescription>
                    </Alert>
                  )}
                  <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/agent-vault" />
                  <div className="mt-2 flex flex-col gap-1 text-accent">
                    <div className="text-label">Filled in for you</div>
                    <div className="flex items-center gap-1.5">
                      <CheckIcon className="size-3" /> Hosts
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckIcon className="size-3" /> Credential type
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <SheetFooter className="justify-end border-t">
            <Button
              type="button"
              variant="ghost"
              onClick={() => (step === 0 ? requestDiscard() : goBack())}
            >
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {!isLastStep && (
              <Button
                type="button"
                variant="av"
                isDisabled={currentStepKey === "template" && !hasPickedTemplate}
                onClick={async () => goNext()}
              >
                Continue
              </Button>
            )}
            {(isLastStep || isUpdate) && (
              <Button type="submit" variant="av" isPending={isSubmitting}>
                Save
              </Button>
            )}
          </SheetFooter>
        </form>

        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Changes?"
          description="This connection has not been saved. Its hosts and credential will be lost."
        />
      </SheetContent>
    </Sheet>
  );
};
