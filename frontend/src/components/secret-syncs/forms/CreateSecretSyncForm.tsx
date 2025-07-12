import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Switch } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  SecretSync,
  SecretSyncInitialSyncBehavior,
  TSecretSync,
  useCreateSecretSync,
  useSecretSyncOption
} from "@app/hooks/api/secretSyncs";

import { SecretSyncOptionsFields } from "./SecretSyncOptionsFields/SecretSyncOptionsFields";
import { SecretSyncFormSchema, TSecretSyncForm } from "./schemas";
import { SecretSyncDestinationFields } from "./SecretSyncDestinationFields";
import { SecretSyncDetailsFields } from "./SecretSyncDetailsFields";
import { SecretSyncReviewFields } from "./SecretSyncReviewFields";
import { SecretSyncSourceFields } from "./SecretSyncSourceFields";

type Props = {
  onComplete: (secretSync: TSecretSync) => void;
  destination: SecretSync;
  onCancel: () => void;
};

const FORM_TABS: { name: string; key: string; fields: (keyof TSecretSyncForm)[] }[] = [
  { name: "Source", key: "source", fields: ["secretPath", "environment"] },
  { name: "Destination", key: "destination", fields: ["connection", "destinationConfig"] },
  { name: "Sync Options", key: "options", fields: ["syncOptions"] },
  { name: "Details", key: "details", fields: ["name", "description"] },
  { name: "Review", key: "review", fields: [] }
];

export const CreateSecretSyncForm = ({ destination, onComplete, onCancel }: Props) => {
  const createSecretSync = useCreateSecretSync();
  const { currentWorkspace } = useWorkspace();
  const { name: destinationName } = SECRET_SYNC_MAP[destination];

  const [showConfirmation, setShowConfirmation] = useState(false);

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const { syncOption } = useSecretSyncOption(destination);

  const formMethods = useForm<TSecretSyncForm>({
    resolver: zodResolver(SecretSyncFormSchema),
    defaultValues: {
      destination,
      isAutoSyncEnabled: true,
      syncOptions: {
        initialSyncBehavior: syncOption?.canImportSecrets
          ? undefined
          : SecretSyncInitialSyncBehavior.OverwriteDestination
      }
    } as Partial<TSecretSyncForm>,
    reValidateMode: "onChange"
  });

  const onSubmit = async ({ environment, connection, ...formData }: TSecretSyncForm) => {
    try {
      const secretSync = await createSecretSync.mutateAsync({
        ...formData,
        connectionId: connection.id,
        environment: environment.slug,
        projectId: currentWorkspace.id
      });

      createNotification({
        text: `Successfully added ${destinationName} Sync`,
        type: "success"
      });
      onComplete(secretSync);
    } catch (err: any) {
      console.error(err);
      setShowConfirmation(false);
      createNotification({
        title: `Failed to add ${destinationName} Sync`,
        text: err.message,
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
        <div className="flex flex-col rounded-sm border border-l-[2px] border-mineshaft-600 border-l-primary bg-mineshaft-700/80 px-4 py-3">
          <div className="mb-1 flex items-center text-sm">
            <FontAwesomeIcon icon={faInfoCircle} size="sm" className="mr-1.5 text-primary" />
            Secret Sync Behavior
          </div>
          <p className="mt-1 text-sm text-bunker-200">
            Secret Syncs are the source of truth for connected third-party services. Any secret,
            including associated data, not present or imported in Infisical before syncing will be
            overwritten, and changes made directly in the connected service outside of infisical may
            also be overwritten by future syncs.
          </p>
        </div>
        <div className="mt-4 flex gap-4">
          <Button
            isDisabled={createSecretSync.isPending}
            isLoading={createSecretSync.isPending}
            onClick={handleSubmit(onSubmit)}
            colorSchema="secondary"
          >
            I Understand
          </Button>

          <Button
            isDisabled={createSecretSync.isPending}
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
                  `w-30 -mb-[0.14rem] ${index > selectedTabIndex ? "opacity-30" : ""} px-4 py-2 text-sm font-medium outline-none disabled:opacity-60 ${
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
              <SecretSyncSourceFields />
            </Tab.Panel>
            <Tab.Panel>
              <SecretSyncDestinationFields />
            </Tab.Panel>
            <Tab.Panel>
              <SecretSyncOptionsFields />
              <Controller
                control={control}
                name="isAutoSyncEnabled"
                render={({ field: { value, onChange }, fieldState: { error } }) => {
                  return (
                    <FormControl
                      helperText={
                        value
                          ? "Secrets will automatically be synced when changes occur in the source location."
                          : "Secrets will not automatically be synced when changes occur in the source location. You can still trigger syncs manually."
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
              <SecretSyncDetailsFields />
            </Tab.Panel>
            <Tab.Panel>
              <SecretSyncReviewFields />
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
