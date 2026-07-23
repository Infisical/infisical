import { useState } from "react";
import { Controller, FieldPath, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  Label,
  Stepper,
  StepperList,
  StepperStep,
  Switch
} from "@app/components/v3";
import { useProject } from "@app/context";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import {
  PkiSync,
  PkiSyncExportFormat,
  TPkiSync,
  useCreatePkiSync,
  usePkiSyncOption
} from "@app/hooks/api/pkiSyncs";

import { KEMP_DEFAULT_CA_NAME_SCHEMA } from "./schemas/kemp-loadmaster-pki-sync-destination-schema";
import { PkiSyncFormSchema, TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncCertificatesFields } from "./PkiSyncCertificatesFields";
import { PkiSyncDestinationFields } from "./PkiSyncDestinationFields";
import { PkiSyncDetailsFields } from "./PkiSyncDetailsFields";
import { PkiSyncFieldMappingsFields } from "./PkiSyncFieldMappingsFields";
import { PkiSyncOptionsFields } from "./PkiSyncOptionsFields";
import { PkiSyncReviewFields } from "./PkiSyncReviewFields";

type Props = {
  onComplete: (pkiSync: TPkiSync) => void;
  destination: PkiSync;
  onCancel: () => void;
  initialData?: Partial<TPkiSyncForm>;
  applicationId?: string;
};

const STEP_META: Record<
  string,
  { short: string; subtitle: string; rightLabel: string; rightDescription: string }
> = {
  destination: {
    short: "Where to sync",
    subtitle: "Choose a connection and configure the target location.",
    rightLabel: "DESTINATION",
    rightDescription:
      "Choose the connection and the destination where certificates will be pushed. The available fields depend on the selected service."
  },
  options: {
    short: "Sync behavior",
    subtitle: "Control how certificates are written and whether they sync automatically.",
    rightLabel: "SYNC OPTIONS",
    rightDescription:
      "Control how certificates are synced, such as whether stale certificates are removed and whether the root CA is included. Auto-Sync pushes changes automatically as they occur."
  },
  mappings: {
    short: "Field mappings",
    subtitle: "Map each certificate component to the field names used at the destination.",
    rightLabel: "MAPPINGS",
    rightDescription:
      "Map each certificate component (certificate, private key, and chain) to the field names used at the destination."
  },
  details: {
    short: "Name and description",
    subtitle: "Give this sync a name and an optional description.",
    rightLabel: "DETAILS",
    rightDescription:
      "Give this sync a name and an optional description so your team can identify it later."
  },
  certificates: {
    short: "Certificates to sync",
    subtitle: "Select which of this application's certificates are included in the sync.",
    rightLabel: "CERTIFICATES",
    rightDescription:
      "Select which of this application's certificates are included in the sync. You can change this selection after the sync is created."
  },
  review: {
    short: "Confirm and create",
    subtitle: "Double-check everything before creating the sync.",
    rightLabel: "REVIEW",
    rightDescription:
      "Review the configuration and create the sync. Every setting can be edited afterward from the sync's details."
  }
};

const getFormTabs = (
  destination: PkiSync
): { name: string; key: string; fields: FieldPath<TPkiSyncForm>[] }[] => {
  const baseTabs = [
    {
      name: "Destination",
      key: "destination",
      fields: ["connection", "destinationConfig"] as FieldPath<TPkiSyncForm>[]
    },
    {
      name: "Sync Options",
      key: "options",
      fields: ["syncOptions", "credentials"] as FieldPath<TPkiSyncForm>[]
    }
  ];

  if (destination === PkiSync.Chef || destination === PkiSync.AwsSecretsManager) {
    baseTabs.push({
      name: "Mappings",
      key: "mappings",
      fields: ["syncOptions"] as FieldPath<TPkiSyncForm>[]
    });
  }

  baseTabs.push(
    {
      name: "Details",
      key: "details",
      fields: ["name", "description"] as FieldPath<TPkiSyncForm>[]
    },
    {
      name: "Certificates",
      key: "certificates",
      fields: ["certificateIds"] as FieldPath<TPkiSyncForm>[]
    },
    { name: "Review", key: "review", fields: [] as FieldPath<TPkiSyncForm>[] }
  );

  return baseTabs;
};

export const CreatePkiSyncForm = ({
  destination,
  onComplete,
  onCancel,
  initialData,
  applicationId
}: Props) => {
  const createPkiSync = useCreatePkiSync();
  const { currentProject } = useProject();
  const { name: destinationName } = PKI_SYNC_MAP[destination];

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const FORM_TABS = getFormTabs(destination);

  const { syncOption } = usePkiSyncOption(destination);

  const formMethods = useForm<TPkiSyncForm>({
    resolver: zodResolver(PkiSyncFormSchema),
    defaultValues: {
      destination,
      isAutoSyncEnabled: false,
      certificateIds: [],
      syncOptions: {
        canImportCertificates: false,
        canRemoveCertificates: false,
        preserveArn: true,
        certificateNameSchema: syncOption?.defaultCertificateNameSchema,
        ...((destination === PkiSync.LinuxServer || destination === PkiSync.WindowsServer) && {
          exportFormat:
            destination === PkiSync.WindowsServer
              ? PkiSyncExportFormat.Pkcs12
              : PkiSyncExportFormat.Pem,
          includePrivateKey: true
        }),
        ...(destination === PkiSync.KempLoadMaster && {
          caCertificateNameSchema: KEMP_DEFAULT_CA_NAME_SCHEMA
        }),
        ...((destination === PkiSync.Chef || destination === PkiSync.AwsSecretsManager) && {
          fieldMappings: {
            certificate: "certificate",
            privateKey: "private_key",
            certificateChain: "certificate_chain",
            caCertificate: "ca_certificate"
          }
        }),
        ...(destination === PkiSync.AwsSecretsManager && {
          preserveSecretOnRenewal: true,
          updateExistingCertificates: true
        })
      },
      ...initialData
    } as Partial<TPkiSyncForm>,
    reValidateMode: "onChange"
  });

  const onSubmit = async ({
    connection,
    destinationConfig,
    certificateIds,
    ...formData
  }: TPkiSyncForm) => {
    try {
      const pkiSync = await createPkiSync.mutateAsync({
        ...formData,
        connectionId: connection.id,
        projectId: currentProject.id,
        applicationId,
        destinationConfig,
        certificateIds: certificateIds || []
      });

      createNotification({
        text: `Successfully created ${destinationName} Certificate Sync${
          certificateIds && certificateIds.length > 0
            ? ` with ${certificateIds.length} certificate(s)`
            : ""
        }`,
        type: "success"
      });
      onComplete(pkiSync);
    } catch {
      createNotification({
        text: `Failed to create ${destinationName} Certificate Sync`,
        type: "error"
      });
    }
  };

  const { handleSubmit, trigger, control, getValues, setError } = formMethods;

  const isStepValid = async (index: number) => {
    const isValid = await trigger(FORM_TABS[index].fields);
    if (!isValid) return false;

    if (FORM_TABS[index].key === "options") {
      const values = getValues() as {
        destination?: PkiSync;
        syncOptions?: { exportFormat?: PkiSyncExportFormat };
        credentials?: { exportPassword?: string };
      };
      const requiresPassword =
        (values.destination === PkiSync.WindowsServer ||
          values.destination === PkiSync.LinuxServer) &&
        values.syncOptions?.exportFormat === PkiSyncExportFormat.Pkcs12 &&
        !values.credentials?.exportPassword;
      if (requiresPassword) {
        setError("credentials.exportPassword" as FieldPath<TPkiSyncForm>, {
          type: "manual",
          message: "A password is required for PKCS#12 exports"
        });
        return false;
      }
    }

    return true;
  };

  const isFinalStep = selectedTabIndex === FORM_TABS.length - 1;

  const handleNext = async () => {
    if (isFinalStep) {
      await handleSubmit(onSubmit)();
      return;
    }

    const isValid = await isStepValid(selectedTabIndex);
    if (!isValid) return;

    setSelectedTabIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    if (selectedTabIndex === 0) {
      onCancel();
      return;
    }
    setSelectedTabIndex((prev) => prev - 1);
  };

  const handleStepChange = (index: number) => {
    if (index < selectedTabIndex) setSelectedTabIndex(index);
  };

  const currentKey = FORM_TABS[selectedTabIndex].key;
  const currentName = FORM_TABS[selectedTabIndex].name;
  const currentDetail = STEP_META[currentKey];

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
              activeStep={selectedTabIndex}
              orientation="vertical"
              onStepChange={handleStepChange}
            >
              <StepperList>
                {FORM_TABS.map((tab, index) => (
                  <StepperStep
                    key={tab.key}
                    index={index}
                    title={tab.name}
                    description={STEP_META[tab.key].short}
                  />
                ))}
              </StepperList>
            </Stepper>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-foreground">{currentName}</h2>
              <p className="mt-1 text-sm text-muted">{currentDetail.subtitle}</p>
            </div>
            {currentKey === "destination" && <PkiSyncDestinationFields />}
            {currentKey === "options" && (
              <>
                <PkiSyncOptionsFields destination={destination} />
                <Controller
                  control={control}
                  name="isAutoSyncEnabled"
                  render={({ field: { value, onChange } }) => (
                    <Field className="mt-2">
                      <Field orientation="horizontal">
                        <FieldContent>
                          <Label htmlFor="auto-sync-enabled">Auto-sync on changes</Label>
                          <FieldDescription>
                            When certificates in the selected list change, sync automatically. Turn
                            off to only sync manually.
                          </FieldDescription>
                        </FieldContent>
                        <Switch
                          id="auto-sync-enabled"
                          variant="project"
                          checked={value}
                          onCheckedChange={onChange}
                        />
                      </Field>
                    </Field>
                  )}
                />
              </>
            )}
            {currentKey === "mappings" && <PkiSyncFieldMappingsFields destination={destination} />}
            {currentKey === "details" && <PkiSyncDetailsFields />}
            {currentKey === "certificates" && (
              <PkiSyncCertificatesFields applicationId={applicationId} />
            )}
            {currentKey === "review" && <PkiSyncReviewFields />}
          </div>

          <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
            <div className="mb-auto">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                  Step {selectedTabIndex + 1} · {currentDetail.rightLabel}
                </p>
                <DocumentationLinkBadge
                  href={`https://infisical.com/docs/documentation/platform/pki/applications/certificate-syncs/${destination}`}
                />
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {currentDetail.rightDescription}
              </p>
            </div>
          </aside>
        </div>
      </FormProvider>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
        <span className="text-xs text-muted">
          Step {selectedTabIndex + 1} of {FORM_TABS.length}
        </span>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={handleBack}>
            {selectedTabIndex === 0 ? "Cancel" : "Back"}
          </Button>
          <Button
            type="button"
            variant="project"
            onClick={handleNext}
            isPending={isFinalStep && createPkiSync.isPending}
            isDisabled={isFinalStep && createPkiSync.isPending}
          >
            {isFinalStep ? "Create Sync" : "Continue"}
          </Button>
        </div>
      </div>
    </form>
  );
};
