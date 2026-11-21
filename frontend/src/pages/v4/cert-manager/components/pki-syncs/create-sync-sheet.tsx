import { useRef, useState } from "react";
import { type FieldPath, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep, type MultiStepStep } from "@infisical/cipher/ui/multi-step";

import { CertificateSyncsUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { KEMP_DEFAULT_CA_NAME_SCHEMA } from "@app/components/pki-syncs/forms/schemas/kemp-loadmaster-pki-sync-destination-schema";
import {
  isPaloAltoNetworksTemplateMissing,
  PALO_ALTO_NETWORKS_TEMPLATE_REQUIRED_MESSAGE
} from "@app/components/pki-syncs/forms/schemas/palo-alto-networks-pki-sync-destination-schema";
import {
  getKeystoreFieldIssues,
  PkiSyncFormSchema,
  removeUnusedKeystoreOptions,
  type TPkiSyncForm
} from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";
import {
  isPaloAltoNetworksPkiSync,
  PRESERVE_ARN_DESTINATIONS,
  PRESERVE_ITEM_ON_RENEWAL_DESTINATIONS
} from "@app/helpers/pkiSyncs";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { PkiSync, PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSync, TPkiSyncOption } from "@app/hooks/api/pkiSyncs/types";

import { useOrgId } from "../../../access/permissions";
import { readableFailure, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { useUpgradeGate } from "../../../license/useUpgradeGate";
import { PkiSyncCertificatesFields } from "./certificates/certificates-fields";
import { PkiSyncReviewFields } from "./certificates/review-fields";
import { PkiSyncDestinationPicker } from "./destination-picker";
import { PkiSyncDestinationFields } from "./destinations/destination-fields";
import { PkiSyncTargetHostField } from "./destinations/target-host-field";
import { SwitchField } from "./fields";
import { PkiSyncDetailsFields } from "./options/details-fields";
import { PkiSyncFieldMappingsFields } from "./options/field-mappings-fields";
import { PkiSyncHealthCheckCommandFields } from "./options/health-check-command-fields";
import { PkiSyncOptionsFields } from "./options/options-fields";
import { PkiSyncPostSyncCommandFields } from "./options/post-sync-command-fields";
import {
  destinationNameOf,
  useCanSetHealthCheckCommand,
  useCanSetPostSyncCommand,
  usePkiSyncOption,
  usePkiSyncScope
} from "./shared";
import { pkiSyncSteps } from "./steps";

export const pkiSyncDefaults = (
  destination: PkiSync,
  syncOption?: TPkiSyncOption
): Partial<TPkiSyncForm> =>
  ({
    destination,
    isAutoSyncEnabled: false,
    filters: null,
    syncOptions: {
      canImportCertificates: false,
      canRemoveCertificates: false,
      certificateNameSchema: syncOption?.defaultCertificateNameSchema,
      ...(PRESERVE_ARN_DESTINATIONS.includes(destination) && { preserveArn: true }),
      ...(PRESERVE_ITEM_ON_RENEWAL_DESTINATIONS.includes(destination) && {
        preserveItemOnRenewal: true
      }),
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
    }
  }) as Partial<TPkiSyncForm>;

const AutoSyncField = () => (
  <SwitchField
    name="isAutoSyncEnabled"
    label="Auto-sync on change"
    description="Sync automatically when the certificates this sync holds change. Turn off to sync only manually."
  />
);

const CreateSyncForm = ({
  destination,
  initialData,
  pickerStep,
  onPickAnother,
  onClose
}: {
  destination: PkiSync;
  initialData?: Partial<TPkiSyncForm>;
  pickerStep: boolean;
  onPickAnother: () => void;
  onClose: () => void;
}) => {
  const { projectId, applicationId } = usePkiSyncScope();
  const adapter = useV4Adapter("pkiSyncs");
  const create = adapter.useCreateSync();
  const { syncOption } = usePkiSyncOption(destination);
  const canSetPostSyncCommand = useCanSetPostSyncCommand(applicationId);
  const canSetHealthCheckCommand = useCanSetHealthCheckCommand(applicationId);
  const destinationName = destinationNameOf(destination);
  const form = useForm<TPkiSyncForm>({
    resolver: zodResolver(PkiSyncFormSchema),
    defaultValues: {
      ...pkiSyncDefaults(destination, syncOption),
      ...initialData
    } as TPkiSyncForm,
    reValidateMode: "onChange"
  });
  const { trigger, getValues, setError, control, formState } = form;
  const connection = useWatch({ control, name: "connection" });
  const canRemoveCertificates = useWatch({ control, name: "syncOptions.canRemoveCertificates" });
  const { data: paloAltoDevice, isPending: detectingPaloAlto } = adapter.usePaloAltoTemplates(
    connection?.id ?? "",
    { enabled: isPaloAltoNetworksPkiSync(destination) && Boolean(connection?.id) }
  );
  const [step, setStep] = useState(pickerStep ? 1 : 0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const completed = useRef(false);
  const offset = pickerStep ? 1 : 0;

  const formSteps = pkiSyncSteps({
    destination,
    canRunHostCommands:
      (Boolean(syncOption?.canRunHealthCheckCommand) && canSetHealthCheckCommand) ||
      (Boolean(syncOption?.canRunPostSyncCommand) && canSetPostSyncCommand),
    needsTargetHost: connection?.app === AppConnection.LDAP,
    mode: "create"
  });

  const validateStep = async (index: number) => {
    const current = formSteps[index];
    if (!(await trigger(current.fields))) return false;
    if (current.key === "targetHost") {
      const { destinationConfig } = getValues() as { destinationConfig?: { host?: string } };
      if (!destinationConfig?.host) {
        setError("destinationConfig.host" as FieldPath<TPkiSyncForm>, {
          type: "manual",
          message: "A target host is required when using an LDAP connection"
        });
        return false;
      }
    }
    if (
      current.key === "destination" &&
      isPaloAltoNetworksPkiSync(destination) &&
      isPaloAltoNetworksTemplateMissing(paloAltoDevice?.isPanorama, getValues("destinationConfig"))
    ) {
      setError("destinationConfig.template" as FieldPath<TPkiSyncForm>, {
        type: "manual",
        message: PALO_ALTO_NETWORKS_TEMPLATE_REQUIRED_MESSAGE
      });
      return false;
    }
    if (current.key === "options") {
      const issues = getKeystoreFieldIssues(getValues(), { requirePassword: true });
      issues.forEach(({ path, message }) =>
        setError(path.join(".") as FieldPath<TPkiSyncForm>, { type: "manual", message })
      );
      if (issues.length) return false;
    }
    return true;
  };

  const body = (key: string) => {
    switch (key) {
      case "destination":
        return <PkiSyncDestinationFields />;
      case "targetHost":
        return <PkiSyncTargetHostField applicationId={applicationId} />;
      case "options":
        return (
          <Stack gap={16}>
            <PkiSyncOptionsFields destination={destination} />
            <AutoSyncField />
          </Stack>
        );
      case "mappings":
        return <PkiSyncFieldMappingsFields destination={destination} />;
      case "hostCommands":
        return (
          <Stack gap={32}>
            <PkiSyncHealthCheckCommandFields
              destination={destination}
              applicationId={applicationId}
              canEditCommand={canSetHealthCheckCommand}
            />
            <PkiSyncPostSyncCommandFields
              destination={destination}
              canEditCommand={canSetPostSyncCommand}
            />
          </Stack>
        );
      case "details":
        return <PkiSyncDetailsFields />;
      case "certificates":
        return <PkiSyncCertificatesFields applicationId={applicationId} />;
      default:
        return (
          <Stack gap={16}>
            <PkiSyncReviewFields applicationId={applicationId} />
            <Alert tone="warn" title="Infisical is the source of truth for this destination">
              <Stack gap={8}>
                <span>
                  Certificates in {destinationName} are overwritten, and direct edits there may be
                  overwritten by future syncs.
                </span>
                {syncOption?.canRemoveCertificates && canRemoveCertificates && (
                  <span>
                    Certificates that leave this sync are deleted from {destinationName}, whether
                    they stopped being active, were deleted, or stopped matching the filters.
                  </span>
                )}
              </Stack>
            </Alert>
            <Checkbox
              label="I understand"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
            />
          </Stack>
        );
    }
  };

  const steps: MultiStepStep[] = [
    ...(pickerStep
      ? [
          {
            title: "Service",
            summary: destinationName,
            render: () => <PkiSyncDestinationPicker onSelect={() => setStep(1)} />
          }
        ]
      : []),
    ...formSteps.map((entry, index) => ({
      title: entry.title,
      description: entry.description,
      content: body(entry.key),
      validate: entry.key === "review" ? undefined : () => validateStep(index),
      disabledReason:
        (entry.key === "destination" && detectingPaloAlto && Boolean(connection?.id)
          ? "Checking the Palo Alto Networks device"
          : undefined) ||
        (entry.key === "review" && !acknowledged
          ? "Confirm that Infisical overwrites certificates in the destination"
          : undefined)
    }))
  ];

  const close = () => {
    completed.current = false;
    onClose();
  };

  return (
    <FormProvider {...form}>
      <MultiStep
        variant="sheet"
        size="lg"
        title={`${destinationName} certificate sync`}
        open
        step={step}
        onStepChange={(next) => {
          if (pickerStep && next === 0) {
            if (formState.isDirty) {
              setDiscarding(true);
              return;
            }
            onPickAnother();
            return;
          }
          setStep(next);
        }}
        onOpenChange={(next) => {
          if (next) return;
          if (completed.current || !formState.isDirty) {
            close();
            return;
          }
          setDiscarding(true);
        }}
        completeLabel="Create sync"
        onComplete={async () => {
          const valid = await trigger();
          if (!valid) {
            const errorKeys = new Set(Object.keys(form.formState.errors));
            const index = formSteps.findIndex((entry) =>
              entry.fields.some((field) => errorKeys.has(String(field).split(".")[0]))
            );
            if (index >= 0) setStep(index + offset);
            throw new Error("Some settings are invalid. Fix them and try again.");
          }
          const { connection: picked, destinationConfig, ...data } = form.getValues();
          const created: TPkiSync = await create
            .mutateAsync({
              ...removeUnusedKeystoreOptions(data),
              connectionId: picked.id,
              projectId,
              applicationId,
              destinationConfig
            } as Parameters<typeof create.mutateAsync>[0])
            .catch(readableFailure(`Couldn't create the ${destinationName} sync`));
          saved(`${created.name} created`);
          completed.current = true;
        }}
        steps={steps}
      />
      <DiscardChangesAlertDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard sync setup?"
        description="Your progress configuring this sync will be lost."
        onDiscard={() => {
          setDiscarding(false);
          if (step === 0 && pickerStep) onPickAnother();
          else close();
        }}
      />
    </FormProvider>
  );
};

export const CreatePkiSyncSheet = ({
  open,
  onOpenChange,
  destination: preset,
  initialData
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destination?: PkiSync;
  initialData?: Partial<TPkiSyncForm>;
}) => {
  const [picked, setPicked] = useState<PkiSync>();
  const [round, setRound] = useState(0);
  const { data: subscription } = useV4Adapter("pkiPolicies").useSubscription(useOrgId());
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const destination = preset ?? picked;

  const close = () => {
    setPicked(undefined);
    setRound((current) => current + 1);
    onOpenChange(false);
  };

  if (!open) return upgradeGate;

  if (!destination)
    return (
      <>
        <MultiStep
          variant="sheet"
          size="lg"
          title="Add certificate sync"
          open
          onOpenChange={(next) => !next && close()}
          steps={[
            {
              title: "Service",
              render: () => (
                <PkiSyncDestinationPicker
                  onSelect={(next) => {
                    if (!subscription?.pkiSyncs) {
                      openUpgradeGate({
                        intent: CertificateSyncsUpgradeIntent,
                        paywallKey: "pki.sync-provider"
                      });
                      return;
                    }
                    setPicked(next);
                  }}
                />
              )
            },
            { title: "Destination" }
          ]}
        />
        {upgradeGate}
      </>
    );

  return (
    <>
      <CreateSyncForm
        key={`${destination}-${round}`}
        destination={destination}
        initialData={destination === preset ? initialData : undefined}
        pickerStep={!preset}
        onPickAnother={() => setPicked(undefined)}
        onClose={close}
      />
      {upgradeGate}
    </>
  );
};
