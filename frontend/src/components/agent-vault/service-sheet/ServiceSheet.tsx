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
  useCreateAgentVaultService,
  useUpdateAgentVaultService
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { onRequestError } from "@app/hooks/api/reactQuery";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

import { ServiceTemplateSelect } from "../ServiceTemplateSelect";
import { CredentialFields } from "./CredentialFields";
import { DetailsFields } from "./DetailsFields";
import { ReviewFields } from "./ReviewFields";
import {
  buildServiceSchema,
  displayHostPattern,
  SERVICE_STEP_FIELDS,
  ServiceStep,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";
import { SERVICE_DOCS_URL, SERVICE_STEPS } from "./stepMeta";

const BLANK_SERVICE_FORM: TServiceForm = {
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
  service?: TAgentVaultService | null;
};

export const ServiceSheet = ({ isOpen, onOpenChange, accessBundleId, service }: Props) => {
  const isUpdate = Boolean(service);
  const createService = useCreateAgentVaultService();
  const updateService = useUpdateAgentVaultService();

  const [template, setTemplate] = useState<AgentVaultTemplate | null>(null);

  const schema = useMemo(() => buildServiceSchema(service), [service]);

  const formMethods = useForm<TServiceForm>({ resolver: zodResolver(schema) });
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
      isUpdate ? SERVICE_STEPS.filter((meta) => meta.step !== ServiceStep.Template) : SERVICE_STEPS,
    [isUpdate]
  );
  const stepKeys = useMemo(() => steps.map((meta) => meta.step), [steps]);

  const { step, isLastStep, goBack, goNext, onFormInvalid, setStep } = useWizardSteps<ServiceStep>({
    stepKeys,
    stepFields: SERVICE_STEP_FIELDS,
    invalidMessage: "Fix the errors before saving.",
    validateStep: (fields) => trigger(fields as (keyof TServiceForm)[])
  });

  useEffect(() => {
    if (!isOpen) return;

    setStep(0);
    setTemplate(null);

    if (service) {
      const { credential } = service;
      reset({
        name: service.name,
        hostPattern: displayHostPattern(service.hostPattern),
        credentialType: credential.type,
        // Seeded even for a credential that has no header, so switching the type to Bearer starts from
        // the same defaults a new service gets. Left undefined, the submit would send an empty
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
      reset(BLANK_SERVICE_FORM);
    }
  }, [isOpen, service, isUpdate, reset, setStep]);

  const handleTemplatePicked = (picked: AgentVaultTemplate | null) => {
    setTemplate(picked);

    if (picked) {
      const cred = picked.credential;
      reset({
        ...BLANK_SERVICE_FORM,
        name: picked.key,
        hostPattern: picked.hostPattern,
        credentialType: cred.type,
        ...(cred.type === AgentVaultCredentialType.Bearer && {
          headerName: cred.headerName ?? "Authorization",
          headerPrefix: cred.headerPrefix ?? "Bearer"
        })
      });
    } else {
      reset(BLANK_SERVICE_FORM);
    }
    setStep(1);
  };

  const buildCredential = (data: TServiceForm) => {
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

  const buildCredentialPatch = (data: TServiceForm) => {
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

  const onSubmit = async (data: TServiceForm) => {
    try {
      if (service) {
        await updateService.mutateAsync({
          accessBundleId,
          serviceId: service.id,
          name: data.name,
          hostPattern: data.hostPattern,
          credential: buildCredentialPatch(data)
        });
      } else {
        await createService.mutateAsync({
          accessBundleId,
          name: data.name,
          hostPattern: data.hostPattern,
          credential: buildCredential(data)
        });
      }

      createNotification({
        text: `Service "${data.name}" ${isUpdate ? "updated" : "created"}`,
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
        setStep(stepKeys.indexOf(ServiceStep.Details));
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
          setStep(stepKeys.indexOf(ServiceStep.Details));
        }
        if (hostIssues.length < serverResponse.message.length) onRequestError(error);
        return;
      }

      // The mutation suppresses the global toast for bad requests so the conflict above shows once.
      // Every other bad request has nothing rendering it, so hand those back.
      onRequestError(error);
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
      if (!(await trigger(SERVICE_STEP_FIELDS[stepKeys[i]] as (keyof TServiceForm)[]))) {
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

  const stepDescription = (meta: (typeof SERVICE_STEPS)[number]) => {
    if (meta.step === ServiceStep.Template) return template?.name ?? "Custom";
    if (meta.step === ServiceStep.Review && isUpdate) return "Confirm and save";
    return meta.shortDescription;
  };

  const current = steps[step];
  const isTemplateStep = current.step === ServiceStep.Template;
  const saveLabel = isUpdate ? "Save" : "Add Service";

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
                Start from a template, or configure the service yourself.
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
                {template?.name ?? (isUpdate ? service?.name : "Custom")}
                <DocumentationLinkBadge href={SERVICE_DOCS_URL} />
              </SheetTitle>
              <SheetDescription>Set up the service and its credentials.</SheetDescription>
            </>
          )}
        </SheetHeader>

        <FormProvider {...formMethods}>
          {isTemplateStep ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <ServiceTemplateSelect onSelect={handleTemplatePicked} />
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

                  {current.step === ServiceStep.Details && <DetailsFields />}
                  {current.step === ServiceStep.Credential && (
                    <CredentialFields storedType={service?.credential.type} />
                  )}
                  {current.step === ServiceStep.Review && <ReviewFields isUpdate={isUpdate} />}
                </div>

                <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                      Step {step + 1} · {current.rightLabel}
                    </p>
                    <DocumentationLinkBadge href={SERVICE_DOCS_URL} />
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
