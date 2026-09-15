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
import { hostError } from "@app/helpers/agentVaultHostPattern";
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
import { TransformationsFields } from "./TransformationsFields";

const BLANK_SERVICE_FORM: TServiceForm = {
  name: "",
  hosts: [],
  hostDraft: "",
  pathDraft: "",
  credentialType: AgentVaultCredentialType.Bearer,
  headerName: "Authorization",
  headerPrefix: "Bearer",
  username: "",
  secret: "",
  allMethods: true,
  methods: [],
  pathPrefixes: [],
  customHeaders: [],
  substitutions: []
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

  const formMethods = useForm<TServiceForm>({
    // Without these every value is undefined until the open effect resets, and the repeating lists read
    // .includes() on mount.
    defaultValues: BLANK_SERVICE_FORM,
    resolver: zodResolver(schema)
  });
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
        ...BLANK_SERVICE_FORM,
        name: service.name,
        hosts: displayHostPattern(service.hostPattern).split(", "),
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
        secret: credential.type === AgentVaultCredentialType.Passthrough ? "" : UNCHANGED_SECRET,
        allMethods: service.allowedMethods === null,
        methods: service.allowedMethods ?? [],
        pathPrefixes: service.allowedPathPrefixes ?? [],
        // The stored values never come back, so each row carries the sentinel until it is retyped.
        customHeaders: service.customHeaders.map((header) => ({
          id: header.id,
          name: header.name,
          prefix: header.prefix,
          value: UNCHANGED_SECRET
        })),
        substitutions: service.substitutions.map((substitution) => ({
          id: substitution.id,
          placeholder: substitution.placeholder,
          surfaces: substitution.surfaces,
          value: UNCHANGED_SECRET
        }))
      });
    } else {
      reset(BLANK_SERVICE_FORM);
    }
  }, [isOpen, service, isUpdate, reset, setStep]);

  const handleTemplatePicked = (picked: AgentVaultTemplate | null) => {
    setTemplate(picked);

    if (picked) {
      const cred = picked.credential;
      // Some templates carry a placeholder such as <your-tenant>.atlassian.net, which is not a host. A
      // part that would be refused as a chip goes into the draft instead, ready to be replaced.
      const parts = picked.hostPattern.split(",").map((host) => host.trim());

      reset({
        ...BLANK_SERVICE_FORM,
        name: picked.key,
        hosts: parts.filter((host) => !hostError(host, [])),
        hostDraft: parts.find((host) => Boolean(hostError(host, []))) ?? "",
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

  const buildPolicy = (data: TServiceForm) => ({
    allowedMethods: data.allMethods ? null : data.methods,
    allowedPathPrefixes: data.pathPrefixes.length ? data.pathPrefixes : null
  });

  // An untouched row sends no value at all, which the API reads as "keep what is stored".
  const buildTransformations = (data: TServiceForm) => ({
    customHeaders: data.customHeaders.map((header) => ({
      ...(header.id ? { id: header.id } : {}),
      name: header.name,
      prefix: header.prefix,
      ...(header.value === UNCHANGED_SECRET ? {} : { value: header.value })
    })),
    substitutions: data.substitutions.map((substitution) => ({
      ...(substitution.id ? { id: substitution.id } : {}),
      placeholder: substitution.placeholder,
      surfaces: substitution.surfaces,
      ...(substitution.value === UNCHANGED_SECRET ? {} : { value: substitution.value })
    }))
  });

  const onSubmit = async (data: TServiceForm) => {
    try {
      if (service) {
        await updateService.mutateAsync({
          accessBundleId,
          serviceId: service.id,
          name: data.name,
          hostPattern: data.hosts.join(","),
          ...buildPolicy(data),
          credential: buildCredentialPatch(data),
          ...buildTransformations(data)
        });
      } else {
        await createService.mutateAsync({
          accessBundleId,
          name: data.name,
          hostPattern: data.hosts.join(","),
          ...buildPolicy(data),
          credential: buildCredential(data),
          ...buildTransformations(data)
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
        setError("hosts", { type: "server", message: serverResponse.message });
        setStep(stepKeys.indexOf(ServiceStep.Details));
        return;
      }

      if (serverResponse?.error === ApiErrorTypes.ValidationError) {
        // A server issue whose path names a field maps back onto that field and jumps to its step, so the
        // user sees what to fix instead of a toast with the form parked on Review.
        const STEP_OF_FIELD: Record<string, ServiceStep> = {
          name: ServiceStep.Details,
          hostPattern: ServiceStep.Details,
          allowedMethods: ServiceStep.Details,
          allowedPathPrefixes: ServiceStep.Details,
          credential: ServiceStep.Credential,
          customHeaders: ServiceStep.Transformations,
          substitutions: ServiceStep.Transformations
        };

        const FORM_FIELD_OF: Record<string, keyof TServiceForm> = {
          hostPattern: "hosts",
          allowedMethods: "methods",
          allowedPathPrefixes: "pathPrefixes",
          credential: "secret"
        };

        let earliestStep: number | null = null;
        let unmapped = false;

        serverResponse.message.forEach((issue) => {
          const root = String(issue.path[0]);
          const issueStep = STEP_OF_FIELD[root];
          if (!issueStep) {
            unmapped = true;
            return;
          }

          // Index-addressed issues (customHeaders.0.name) keep their path so the row's own field is marked.
          const target =
            issue.path.length > 1 && (root === "customHeaders" || root === "substitutions")
              ? (issue.path.join(".") as keyof TServiceForm)
              : (FORM_FIELD_OF[root] ?? (root as keyof TServiceForm));

          setError(target, { type: "server", message: issue.message });
          const index = stepKeys.indexOf(issueStep);
          if (index !== -1 && (earliestStep === null || index < earliestStep)) earliestStep = index;
        });

        if (earliestStep !== null) setStep(earliestStep);
        if (unmapped) onRequestError(error);
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
      {/* Same width as the proxied service sheet, which this whole layout mirrors: three columns need more
          than the Sheet default, which caps at sm:max-w-md and leaves the middle one about 445px. */}
      <SheetContent className="flex h-full max-h-full w-screen flex-col gap-y-0 sm:max-w-[90vw] xl:max-w-7xl">
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
                  {current.step === ServiceStep.Transformations && <TransformationsFields />}
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
