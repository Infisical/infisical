import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Tab } from "@headlessui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { SecretRotationV2ConfigurationFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2ConfigurationFields";
import { SecretRotationV2DetailsFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2DetailsFields";
import { SecretRotationV2ParametersFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2ParametersFields";
import { SecretRotationV2ReviewFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2ReviewFields";
import { SecretRotationV2SecretsMappingFields } from "@app/components/secret-rotations-v2/forms/SecretRotationV2SecretsMappingFields";
import { Button } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { IS_ROTATION_DUAL_CREDENTIALS } from "@app/helpers/secretRotationsV2";
import {
  SecretRotation as SecretScanningDataSource,
  TSecretRotationV2 as TSecretScanningDataSource,
  useSecretRotationV2Option
} from "@app/hooks/api/secretRotationsV2";
import { useUpdateSecretRotationV2 } from "@app/hooks/api/secretRotationsV2/mutations";
import { useCreateSecretScanningDataSource } from "@app/hooks/api/secretScanningV2/mutations";

import {
  SecretRotationV2FormSchema,
  TSecretRotationV2Form,
  TSecretScanningDataSourceForm
} from "./schemas";

type Props = {
  onComplete: (dataSource: TSecretScanningDataSource) => void;
  type: SecretScanningDataSource;
  onCancel: () => void;
  dataSource?: TSecretScanningDataSource;
};

const FORM_TABS: { name: string; key: string; fields: (keyof TSecretScanningDataSourceForm)[] }[] =
  [
    {
      name: "Connection",
      key: "connection",
      fields: ["connection"]
    },
    { name: "Configuration", key: "config", fields: ["config", "isAutoSyncEnabled"] },
    { name: "Details", key: "details", fields: ["name", "description"] },
    { name: "Review", key: "review", fields: [] }
  ];

const DEFAULT_ROTATION_INTERVAL = 30;

export const SecretScanningDataSourceForm = ({ type, onComplete, onCancel, dataSource }: Props) => {
  const createDataSource = useCreateSecretScanningDataSource();
  const updateSecretRotation = useUpdateSecretRotationV2();
  const { currentWorkspace } = useWorkspace();
  const { name: rotationType } = [type];

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const { rotationOption } = useSecretRotationV2Option(type);

  const formMethods = useForm<TSecretRotationV2Form>({
    resolver: zodResolver(SecretRotationV2FormSchema),
    defaultValues: dataSource
      ? {
          ...dataSource,
          environment: currentWorkspace?.environments.find((env) => env.slug === envSlug),
          secretPath
        }
      : {
          type,
          isAutoRotationEnabled: IS_ROTATION_DUAL_CREDENTIALS[type],
          rotationInterval: DEFAULT_ROTATION_INTERVAL,
          rotateAtUtc: {
            hours: 0,
            minutes: 0
          },
          environment: currentWorkspace?.environments.find((env) => env.slug === envSlug),
          secretPath,
          ...(rotationOption!.template as object) // can't infer type since we don't know which specific type it is
        },
    reValidateMode: "onChange"
  });

  const onSubmit = async ({
    environment,
    connection,

    ...formData
  }: TSecretRotationV2Form) => {
    const mutation = dataSource
      ? updateSecretRotation.mutateAsync({
          dataSourceId: dataSource.id,
          projectId: dataSource.projectId,
          ...formData
        })
      : createDataSource.mutateAsync({
          ...formData,

          connectionId: connection.id,
          environment: environment.slug,
          projectId: currentWorkspace.id
        });
    try {
      const rotation = await mutation;

      createNotification({
        text: `Successfully ${dataSource ? "updated" : "created"} ${rotationType} Rotation`,
        type: "success"
      });
      onComplete(rotation);
    } catch (err: any) {
      createNotification({
        title: `Failed to ${dataSource ? "update" : "create"} ${rotationType} Rotation`,
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

  const {
    handleSubmit,
    trigger,
    formState: { isSubmitting }
  } = formMethods;

  const isStepValid = async (index: number) => trigger(FORM_TABS[index].fields);

  const isFinalStep = selectedTabIndex === FORM_TABS.length - 1;

  const handleNext = async () => {
    if (isFinalStep) {
      handleSubmit(onSubmit)();
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
              <SecretRotationV2ConfigurationFields
                isUpdate={Boolean(dataSource)}
                environments={environments}
              />
            </Tab.Panel>
            <Tab.Panel>
              <SecretRotationV2ParametersFields />
            </Tab.Panel>
            <Tab.Panel>
              <SecretRotationV2SecretsMappingFields />
            </Tab.Panel>
            <Tab.Panel>
              <SecretRotationV2DetailsFields />
            </Tab.Panel>
            <Tab.Panel>
              <SecretRotationV2ReviewFields />
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </FormProvider>
      <div className="flex w-full flex-row-reverse justify-between gap-4 pt-4">
        <Button
          onClick={handleNext}
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
          colorSchema="secondary"
        >
          {isFinalStep ? `${dataSource ? "Update" : "Create"} Secret Rotation` : "Next"}
        </Button>
        <Button onClick={handlePrev} colorSchema="secondary">
          Back
        </Button>
      </div>
    </form>
  );
};
