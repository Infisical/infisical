import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Switch } from "@app/components/v2";
import { useProject } from "@app/context";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSync, TPkiSync, useCreatePkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

import { PkiSyncFormSchema, TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncCertificatesFields } from "./PkiSyncCertificatesFields";
import { PkiSyncDestinationFields } from "./PkiSyncDestinationFields";
import { PkiSyncDetailsFields } from "./PkiSyncDetailsFields";
import { PkiSyncOptionsFields } from "./PkiSyncOptionsFields";
import { PkiSyncReviewFields } from "./PkiSyncReviewFields";

type Props = {
  onComplete: (pkiSync: TPkiSync) => void;
  destination: PkiSync;
  onCancel: () => void;
};

const FORM_TABS: { name: string; key: string; fields: (keyof TPkiSyncForm)[] }[] = [
  { name: "Destination", key: "destination", fields: ["connection", "destinationConfig"] },
  { name: "Sync Options", key: "options", fields: ["syncOptions"] },
  { name: "Details", key: "details", fields: ["name", "description"] },
  { name: "Certificates", key: "certificates", fields: ["certificateIds"] },
  { name: "Review", key: "review", fields: [] }
];

export const CreatePkiSyncForm = ({ destination, onComplete, onCancel }: Props) => {
  const createPkiSync = useCreatePkiSync();
  const { currentProject } = useProject();
  const { name: destinationName } = PKI_SYNC_MAP[destination];

  const [showConfirmation, setShowConfirmation] = useState(false);

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

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
        certificateNameSchema: syncOption?.defaultCertificateNameSchema
      }
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
    } catch (err: Error | unknown) {
      console.error("PKI sync creation failed:", err);
      setShowConfirmation(false);
      createNotification({
        title: `Failed to create ${destinationName} Certificate Sync`,
        text: err instanceof Error ? err.message : "An unknown error occurred",
        type: "error"
      });
    }
  };

  const handlePrev = () => {
    if (selectedTabIndex === 0) {
      onCancel();
      return;
    }

    setSelectedTabIndex((prev) => prev - 1);
  };

  const { handleSubmit, trigger, control } = formMethods;

  const isStepValid = async (index: number) => trigger(FORM_TABS[index].fields);

  const isFinalStep = selectedTabIndex === FORM_TABS.length - 1;

  const handleNext = async () => {
    if (isFinalStep) {
      setShowConfirmation(true);
      return;
    }

    const isValid = await isStepValid(selectedTabIndex);

    if (!isValid) return;

    setSelectedTabIndex((prev) => prev + 1);
  };

  const isTabEnabled = async (index: number) => {
    let isEnabled = true;
    for (let i = index - 1; i >= 0; i -= 1) {
      // eslint-disable-next-line no-await-in-loop
      isEnabled = isEnabled && (await isStepValid(i));
    }

    return isEnabled;
  };

  if (showConfirmation)
    return (
      <>
        <div className="flex flex-col rounded-xs border border-l-2 border-mineshaft-600 border-l-primary bg-mineshaft-700/80 px-4 py-3">
          <div className="mb-1 flex items-center text-sm">
            <FontAwesomeIcon icon={faInfoCircle} size="sm" className="mr-1.5 text-primary" />
            Certificate Sync Behavior
          </div>
          <p className="mt-1 text-sm text-bunker-200">
            Only certificates managed by Infisical will be affected during sync operations.
            Certificates not created or managed by Infisical will remain untouched, and changes made
            to Infisical-managed certificates directly in the destination service may be overwritten
            by future syncs.
          </p>
        </div>
        <div className="mt-4 flex gap-4">
          <Button
            isDisabled={createPkiSync.isPending}
            isLoading={createPkiSync.isPending}
            onClick={handleSubmit(onSubmit)}
            colorSchema="secondary"
          >
            I Understand
          </Button>

          <Button
            isDisabled={createPkiSync.isPending}
            variant="plain"
            onClick={() => setShowConfirmation(false)}
            colorSchema="secondary"
          >
            Cancel
          </Button>
        </div>
      </>
    );

  return (
    <form className={twMerge(isFinalStep && "max-h-[70vh] overflow-y-auto")}>
      <FormProvider {...formMethods}>
        <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
          <Tab.List className="-pb-1 mb-6 w-full border-b-2 border-mineshaft-600">
            {FORM_TABS.map((tab, index) => (
              <Tab
                onClick={async (e) => {
                  e.preventDefault();
                  const isEnabled = await isTabEnabled(index);
                  setSelectedTabIndex((prev) => (isEnabled ? index : prev));
                }}
                className={({ selected }) =>
                  `-mb-[0.14rem] whitespace-nowrap ${index > selectedTabIndex ? "opacity-30" : ""} px-4 py-2 text-sm font-medium outline-hidden disabled:opacity-60 ${
                    selected
                      ? "border-b-2 border-mineshaft-300 text-mineshaft-200"
                      : "text-bunker-300"
                  }`
                }
                key={tab.key}
              >
                {index + 1}. {tab.name}
              </Tab>
            ))}
          </Tab.List>
          <Tab.Panels>
            <Tab.Panel>
              <PkiSyncDestinationFields />
            </Tab.Panel>
            <Tab.Panel>
              <PkiSyncOptionsFields destination={destination} />
              <Controller
                control={control}
                name="isAutoSyncEnabled"
                render={({ field: { value, onChange }, fieldState: { error } }) => {
                  return (
                    <FormControl
                      helperText={
                        value
                          ? "Certificates will automatically be synced when changes occur in the selected certificates."
                          : "Certificates will not automatically be synced when changes occur. You can still trigger syncs manually."
                      }
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Switch
                        className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                        id="auto-sync-enabled"
                        thumbClassName="bg-mineshaft-800"
                        onCheckedChange={onChange}
                        isChecked={value}
                      >
                        <p className="w-[8.4rem]">Auto-Sync {value ? "Enabled" : "Disabled"}</p>
                      </Switch>
                    </FormControl>
                  );
                }}
              />
            </Tab.Panel>
            <Tab.Panel>
              <PkiSyncDetailsFields />
            </Tab.Panel>
            <Tab.Panel>
              <PkiSyncCertificatesFields />
            </Tab.Panel>
            <Tab.Panel>
              <PkiSyncReviewFields />
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </FormProvider>

      <div className="flex w-full flex-row-reverse justify-between gap-4 pt-4">
        <Button onClick={handleNext} colorSchema="secondary">
          {isFinalStep ? "Create Sync" : "Next"}
        </Button>
        {selectedTabIndex > 0 && (
          <Button onClick={handlePrev} colorSchema="secondary">
            Back
          </Button>
        )}
      </div>
    </form>
  );
};
