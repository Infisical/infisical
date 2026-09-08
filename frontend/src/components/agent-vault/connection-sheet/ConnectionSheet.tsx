import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep
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

import { ConnectionTemplateSelect } from "../ConnectionTemplateSelect";
import {
  buildConnectionSchema,
  CONNECTION_STEP_FIELDS,
  ConnectionStep,
  displayHostPattern,
  TConnectionForm,
  UNCHANGED_SECRET
} from "./connectionSchema";
import { CredentialFields } from "./CredentialFields";
import { DetailsFields } from "./DetailsFields";
import { ReviewFields } from "./ReviewFields";
import { CONNECTION_DOCS_URL, CONNECTION_STEPS } from "./stepMeta";

const BLANK_CONNECTION_FORM: TConnectionForm = {
  name: "",
  hostPattern: "",
  credentialType: AgentVaultCredentialType.Bearer,
  headerName: "Authorization",
  headerPrefix: "Bearer",
  username: "",
  secret: ""
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessBundleId: string;
  connection?: TAgentVaultConnection | null;
};

export const ConnectionSheet = ({ isOpen, onOpenChange, accessBundleId, connection }: Props) => {
  const isUpdate = Boolean(connection);
  const createConnection = useCreateAgentVaultConnection();
  const updateConnection = useUpdateAgentVaultConnection();

  const [template, setTemplate] = useState<AgentVaultTemplate | null>(null);

  const schema = useMemo(() => buildConnectionSchema(connection), [connection]);

  const formMethods = useForm<TConnectionForm>({ resolver: zodResolver(schema) });
  const {
    handleSubmit,
    reset,
    setError,
    trigger,
    formState: { isDirty, isSubmitting }
  } = formMethods;

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => onOpenChange(false) });

  const steps = useMemo(
    () =>
      isUpdate
        ? CONNECTION_STEPS.filter((meta) => meta.step !== ConnectionStep.Template)
        : CONNECTION_STEPS,
    [isUpdate]
  );
  const stepKeys = useMemo(() => steps.map((meta) => meta.step), [steps]);

  const { step, isLastStep, goBack, goNext, onFormInvalid, setStep } =
    useWizardSteps<ConnectionStep>({
      stepKeys,
      stepFields: CONNECTION_STEP_FIELDS,
      invalidMessage: "Fix the errors before saving.",
      validateStep: (fields) => trigger(fields as (keyof TConnectionForm)[])
    });

  useEffect(() => {
    if (!isOpen) return;

    setStep(0);
    setTemplate(null);

    if (connection) {
      const { credential } = connection;
      reset({
        name: connection.name,
        hostPattern: displayHostPattern(connection.hostPattern),
        credentialType: credential.type,
        // Seeded even for a credential that has no header, so switching the type to Bearer starts from
        // the same defaults a new connection gets. Left undefined, the submit would send an empty
        // prefix and the proxy would attach a bare token.
        headerName:
          credential.type === AgentVaultCredentialType.Bearer
            ? credential.headerName
            : "Authorization",
        headerPrefix:
          credential.type === AgentVaultCredentialType.Bearer ? credential.headerPrefix : "Bearer",
        username: credential.type === AgentVaultCredentialType.Basic ? UNCHANGED_SECRET : undefined,
        secret: credential.type === AgentVaultCredentialType.Passthrough ? "" : UNCHANGED_SECRET
      });
    } else {
      reset(BLANK_CONNECTION_FORM);
    }
  }, [isOpen, connection, isUpdate, reset, setStep]);

  const handleTemplatePicked = (picked: AgentVaultTemplate | null) => {
    setTemplate(picked);

    if (picked) {
      const cred = picked.credential;
      reset({
        ...BLANK_CONNECTION_FORM,
        name: picked.key,
        hostPattern: picked.hostPattern,
        credentialType: cred.type,
        ...(cred.type === AgentVaultCredentialType.Bearer && {
          headerName: cred.headerName ?? "Authorization",
          headerPrefix: cred.headerPrefix ?? "Bearer"
        })
      });
    } else {
      reset(BLANK_CONNECTION_FORM);
    }
    setStep(1);
  };

  const buildCredential = (data: TConnectionForm) => {
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

  const buildCredentialPatch = (data: TConnectionForm) => {
    if (data.credentialType === AgentVaultCredentialType.Passthrough) {
      return { type: AgentVaultCredentialType.Passthrough as const };
    }
    const untouched = data.secret === UNCHANGED_SECRET;

    if (data.credentialType === AgentVaultCredentialType.Basic) {
      return {
        type: AgentVaultCredentialType.Basic as const,
        username: data.username === UNCHANGED_SECRET ? undefined : (data.username ?? ""),
        password: untouched ? undefined : (data.secret ?? "")
      };
    }
    return {
      type: AgentVaultCredentialType.Bearer as const,
      headerName: data.headerName || "Authorization",
      headerPrefix: data.headerPrefix ?? "",
      value: untouched || !data.secret ? undefined : data.secret
    };
  };

  const onSubmit = async (data: TConnectionForm) => {
    try {
      if (connection) {
        await updateConnection.mutateAsync({
          accessBundleId,
          connectionId: connection.id,
          name: data.name,
          hostPattern: data.hostPattern,
          credential: buildCredentialPatch(data)
        });
      } else {
        await createConnection.mutateAsync({
          accessBundleId,
          name: data.name,
          hostPattern: data.hostPattern,
          credential: buildCredential(data)
        });
      }

      createNotification({
        text: `Connection "${data.name}" ${isUpdate ? "updated" : "created"}`,
        type: "success"
      });

      onOpenChange(false);
    } catch (error) {
      const serverResponse = axios.isAxiosError(error)
        ? (error.response?.data as TApiErrors | undefined)
        : undefined;

      if (
        serverResponse?.error === ApiErrorTypes.BadRequestError &&
        serverResponse.message.includes("already covers")
      ) {
        setError("hostPattern", { type: "server", message: serverResponse.message });
        setStep(stepKeys.indexOf(ConnectionStep.Details));
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
          setStep(stepKeys.indexOf(ConnectionStep.Details));
        }
        if (hostIssues.length < serverResponse.message.length) onRequestError(error);
      }
    }
  };

  const handleStepChange = async (target: number) => {
    if (target === step) return;
    if (target < step) {
      setStep(target);
      return;
    }
    for (let i = step; i < target; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await trigger(CONNECTION_STEP_FIELDS[stepKeys[i]] as (keyof TConnectionForm)[]))) {
        return;
      }
    }
    setStep(target);
  };

  const handleNext = async () => {
    if (isLastStep) {
      handleSubmit(onSubmit, onFormInvalid)();
      return;
    }
    await goNext();
  };

  const stepDescription = (meta: (typeof CONNECTION_STEPS)[number]) => {
    if (meta.step === ConnectionStep.Template) return template?.name ?? "Custom";
    if (meta.step === ConnectionStep.Review && isUpdate) return "Confirm and save";
    return meta.shortDescription;
  };

  const current = steps[step];
  const isTemplateStep = current.step === ConnectionStep.Template;
  const saveLabel = isUpdate ? "Save" : "Add Connection";

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
          {isTemplateStep ? (
            <>
              <SheetTitle>Choose a template</SheetTitle>
              <SheetDescription>
                Pick a service to get a head start, or set one up yourself.
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle className="flex items-center gap-2.5">
                {template && (
                  <img
                    src={`/images/integrations/${template.image}`}
                    alt=""
                    className="size-6 object-contain"
                  />
                )}
                {template?.name ?? (isUpdate ? connection?.name : "Custom")}
                <DocumentationLinkBadge href={CONNECTION_DOCS_URL} />
              </SheetTitle>
              <SheetDescription>Set up the service and its credentials.</SheetDescription>
            </>
          )}
        </SheetHeader>

        <FormProvider {...formMethods}>
          {isTemplateStep ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <ConnectionTemplateSelect onSelect={handleTemplatePicked} />
            </div>
          ) : (
            // Nothing submits natively: a type="submit" on the last step is the same reconciled node as Continue,
            // so the click that advances to Review would also save.
            <form onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
                  <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
                    Setup steps
                  </p>
                  <Stepper activeStep={step} orientation="vertical" onStepChange={handleStepChange}>
                    <StepperList>
                      {steps.map((meta, index) => (
                        <StepperStep
                          key={meta.step}
                          index={index}
                          title={meta.name}
                          description={stepDescription(meta)}
                        />
                      ))}
                    </StepperList>
                  </Stepper>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-foreground">{current.title}</h2>
                    <p className="mt-1 text-sm text-muted">{current.subtitle}</p>
                  </div>

                  {current.step === ConnectionStep.Details && <DetailsFields />}
                  {current.step === ConnectionStep.Credential && (
                    <CredentialFields storedType={connection?.credential.type} />
                  )}
                  {current.step === ConnectionStep.Review && <ReviewFields isUpdate={isUpdate} />}
                </div>

                <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                      Step {step + 1} · {current.rightLabel}
                    </p>
                    <DocumentationLinkBadge href={CONNECTION_DOCS_URL} />
                  </div>
                  <p className="text-sm font-semibold text-foreground">What this step does</p>
                  <p className="text-sm leading-relaxed text-muted">{current.rightDescription}</p>
                </aside>
              </div>

              <SheetFooter className="items-center justify-between border-t">
                <span className="text-xs text-muted">{isDirty ? "Unsaved changes" : ""}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">
                    Step {step + 1} of {steps.length}
                  </span>
                  {step > 0 && (
                    <Button type="button" variant="outline" onClick={goBack}>
                      Back
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="av"
                    onClick={handleNext}
                    isPending={isLastStep && isSubmitting}
                  >
                    {isLastStep ? saveLabel : "Continue"}
                  </Button>
                </div>
              </SheetFooter>
            </form>
          )}
        </FormProvider>

        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Changes?"
          description="Your changes will be lost."
        />
      </SheetContent>
    </Sheet>
  );
};
