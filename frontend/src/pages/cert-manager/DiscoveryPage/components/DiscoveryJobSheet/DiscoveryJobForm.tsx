import { useEffect, useState } from "react";
import { FieldPath, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Button,
  DocumentationLinkBadge,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { getDiscoveryDocsUrl, PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import { useCreatePkiDiscovery, useUpdatePkiDiscovery } from "@app/hooks/api";
import {
  PkiDiscoveryType,
  TPkiDiscovery,
  TPkiDiscoveryTargetConfig
} from "@app/hooks/api/pkiDiscovery/types";

import {
  DiscoveryJobFormSchema,
  getDefaultFormValues,
  parseTargets,
  TDiscoveryJobForm
} from "./discovery-job-form-schema";
import { DiscoveryDetailsFields } from "./DiscoveryDetailsFields";
import { DiscoveryReviewFields } from "./DiscoveryReviewFields";
import { LinuxServerFoldersFields } from "./LinuxServerFoldersFields";
import { LinuxServerHostsFields } from "./LinuxServerHostsFields";
import { LinuxServerOptionsFields } from "./LinuxServerOptionsFields";
import { NetworkTargetFields } from "./NetworkTargetFields";

type Props = {
  discoveryType: PkiDiscoveryType;
  projectId: string;
  discovery?: TPkiDiscovery;
  onComplete: () => void;
  onCancel: () => void;
  onDirtyChange: (isDirty: boolean) => void;
};

enum DiscoveryJobStep {
  Targets = "targets",
  Hosts = "hosts",
  Folders = "folders",
  Options = "options",
  Details = "details",
  Review = "review"
}

const STEP_META: Record<
  DiscoveryJobStep,
  { name: string; short: string; subtitle: string; rightDescription: string }
> = {
  [DiscoveryJobStep.Targets]: {
    name: "Targets",
    short: "What to scan",
    subtitle: "Choose the domains, IP ranges and ports to check.",
    rightDescription:
      "Each target is checked on every port listed. Any certificate served over TLS is imported with its chain.\n\nUse a gateway when the targets are on a private network."
  },
  [DiscoveryJobStep.Hosts]: {
    name: "Hosts",
    short: "Servers to scan",
    subtitle: "Pick the SSH connections for the servers to scan.",
    rightDescription:
      "Each SSH connection is one server. The scan runs from the gateway on that connection.\n\nOnly SSH connections that use a gateway can be selected."
  },
  [DiscoveryJobStep.Folders]: {
    name: "Where to Look",
    short: "Folders to search",
    subtitle: "Choose the folders to search and the ones to leave out.",
    rightDescription:
      "Only files with certificate extensions are opened, such as .pem, .crt, .cer, .der, .p7b, .pfx, .p12, .jks and .keystore.\n\nThe SSH user needs read access to these folders. Give it access through a group or ACL, or allow it to run find, readlink, head and timeout with sudo without a password. Folders it still cannot read are listed in the scan."
  },
  [DiscoveryJobStep.Options]: {
    name: "Options",
    short: "Limits and CA certificates",
    subtitle: "Set how deep to search and what to import.",
    rightDescription:
      "Private keys aren't imported.\n\nKeystores protected by a password are listed as locked. Set the password on the installation and that file is scanned again."
  },
  [DiscoveryJobStep.Details]: {
    name: "Details",
    short: "Name and schedule",
    subtitle: "Name this job and choose when it runs.",
    rightDescription: "A scheduled job runs again at the chosen interval."
  },
  [DiscoveryJobStep.Review]: {
    name: "Review",
    short: "Confirm and save",
    subtitle: "Check the settings and save the job.",
    rightDescription: "Every setting can be edited later from the job."
  }
};

const STEP_FIELDS: Record<DiscoveryJobStep, FieldPath<TDiscoveryJobForm>[]> = {
  [DiscoveryJobStep.Targets]: ["targets", "ports", "gatewayId", "gatewayPoolId"],
  [DiscoveryJobStep.Hosts]: ["connections"],
  [DiscoveryJobStep.Folders]: ["searchFolderPaths", "skipFolderPaths"],
  [DiscoveryJobStep.Options]: ["maxFolderDepth", "maxFileSizeKb", "importStandaloneCaCertificates"],
  [DiscoveryJobStep.Details]: ["name", "description", "isAutoScanEnabled", "scanIntervalDays"],
  [DiscoveryJobStep.Review]: []
};

const getSteps = (type: PkiDiscoveryType): DiscoveryJobStep[] =>
  type === PkiDiscoveryType.LinuxServer
    ? [
        DiscoveryJobStep.Hosts,
        DiscoveryJobStep.Folders,
        DiscoveryJobStep.Options,
        DiscoveryJobStep.Details,
        DiscoveryJobStep.Review
      ]
    : [DiscoveryJobStep.Targets, DiscoveryJobStep.Details, DiscoveryJobStep.Review];

const buildTargetConfig = (form: TDiscoveryJobForm): TPkiDiscoveryTargetConfig => {
  if (form.discoveryType === PkiDiscoveryType.LinuxServer) {
    return {
      connectionIds: form.connections.map((c) => c.id),
      searchFolderPaths: form.searchFolderPaths,
      skipFolderPaths: form.skipFolderPaths,
      maxFolderDepth: form.maxFolderDepth,
      maxFileSizeKb: form.maxFileSizeKb,
      importStandaloneCaCertificates: form.importStandaloneCaCertificates
    };
  }
  const { domains, ipRanges } = parseTargets(form.targets);
  return {
    domains: domains.length ? domains : undefined,
    ipRanges: ipRanges.length ? ipRanges : undefined,
    ports: form.ports.trim()
  };
};

export const DiscoveryJobForm = ({
  discoveryType,
  projectId,
  discovery,
  onComplete,
  onCancel,
  onDirtyChange
}: Props) => {
  const isEditing = Boolean(discovery);
  const createDiscovery = useCreatePkiDiscovery();
  const updateDiscovery = useUpdatePkiDiscovery();
  const [stepIndex, setStepIndex] = useState(0);

  const formMethods = useForm<TDiscoveryJobForm>({
    resolver: zodResolver(DiscoveryJobFormSchema),
    defaultValues: getDefaultFormValues(discoveryType, discovery),
    mode: "onChange",
    reValidateMode: "onChange"
  });

  const { handleSubmit, trigger, formState } = formMethods;
  const isPending = createDiscovery.isPending || updateDiscovery.isPending;

  const steps = getSteps(discoveryType);
  const currentKey = steps[stepIndex];
  const currentStep = STEP_META[currentKey];
  const isFinalStep = stepIndex === steps.length - 1;

  useEffect(() => {
    onDirtyChange(formState.isDirty);
  }, [formState.isDirty]);

  const onSubmit = async (form: TDiscoveryJobForm) => {
    const isNetwork = form.discoveryType === PkiDiscoveryType.Network;
    const gatewayPoolId = isNetwork ? form.gatewayPoolId || null : null;
    const gatewayId = isNetwork ? form.gatewayId || null : null;
    const payload = {
      name: form.name,
      targetConfig: buildTargetConfig(form),
      isAutoScanEnabled: form.isAutoScanEnabled
    };

    if (discovery) {
      await updateDiscovery.mutateAsync({
        ...payload,
        discoveryId: discovery.id,
        description: form.description || null,
        ...(isNetwork && { gatewayId, gatewayPoolId }),
        scanIntervalDays: form.isAutoScanEnabled ? form.scanIntervalDays : null
      });
    } else {
      await createDiscovery.mutateAsync({
        ...payload,
        projectId,
        description: form.description || undefined,
        discoveryType: form.discoveryType,
        gatewayId: gatewayId ?? undefined,
        gatewayPoolId: gatewayPoolId ?? undefined,
        scanIntervalDays: form.isAutoScanEnabled ? form.scanIntervalDays : undefined
      });
    }
    onComplete();
  };

  const handleNext = async () => {
    if (isFinalStep) {
      await handleSubmit(onSubmit)().catch(() => undefined);
      return;
    }
    const isValid = await trigger(STEP_FIELDS[currentKey]);
    if (isValid) setStepIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    if (stepIndex === 0) {
      onCancel();
      return;
    }
    setStepIndex((prev) => prev - 1);
  };

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <FormProvider {...formMethods}>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
            <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
              Setup steps
            </p>
            <Stepper
              activeStep={stepIndex}
              orientation="vertical"
              onStepChange={(index) => {
                if (index < stepIndex) setStepIndex(index);
              }}
            >
              <StepperList>
                {steps.map((key, index) => (
                  <StepperStep
                    key={key}
                    index={index}
                    title={STEP_META[key].name}
                    description={STEP_META[key].short}
                  />
                ))}
              </StepperList>
            </Stepper>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
            <div className="mb-6">
              <h2 className="text-lg font-normal text-foreground">{currentStep.name}</h2>
              <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
            </div>
            {currentKey === DiscoveryJobStep.Targets && <NetworkTargetFields />}
            {currentKey === DiscoveryJobStep.Hosts && <LinuxServerHostsFields />}
            {currentKey === DiscoveryJobStep.Folders && <LinuxServerFoldersFields />}
            {currentKey === DiscoveryJobStep.Options && <LinuxServerOptionsFields />}
            {currentKey === DiscoveryJobStep.Details && <DiscoveryDetailsFields />}
            {currentKey === DiscoveryJobStep.Review && <DiscoveryReviewFields />}
          </div>

          <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
            <div className="mb-auto">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                  Step {stepIndex + 1} · {currentStep.name}
                </p>
                <DocumentationLinkBadge href={getDiscoveryDocsUrl(discoveryType)} />
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
              {currentStep.rightDescription.split("\n\n").map((paragraph) => (
                <p key={paragraph} className="mt-2 text-sm leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
            </div>
          </aside>
        </div>
      </FormProvider>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
        <span className="text-xs text-muted">
          {PKI_DISCOVERY_TYPE_MAP[discoveryType].name} · Step {stepIndex + 1} of {steps.length}
        </span>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={handleBack}>
            {stepIndex === 0 ? "Cancel" : "Back"}
          </Button>
          <Button
            type="button"
            variant="project"
            onClick={handleNext}
            isPending={isFinalStep && isPending}
            isDisabled={isFinalStep && isPending}
          >
            {!isFinalStep && "Continue"}
            {isFinalStep && (isEditing ? "Save Changes" : "Create Job")}
          </Button>
        </div>
      </div>
    </form>
  );
};
