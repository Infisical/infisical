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
import { useProject } from "@app/context";
import { IS_ROTATION_DUAL_CREDENTIALS, SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import {
  SecretRotation,
  TSecretRotationV2,
  useSecretRotationV2Option
} from "@app/hooks/api/secretRotationsV2";
import {
  useCreateSecretRotationV2,
  useUpdateSecretRotationV2
} from "@app/hooks/api/secretRotationsV2/mutations";

import { SecretRotationV2FormSchema, TSecretRotationV2Form } from "./schemas";

type Props = {
  onComplete: (secretRotation: TSecretRotationV2) => void;
  type: SecretRotation;
  onCancel: () => void;
  secretPath: string;
  environment?: string;
  environments?: ProjectEnv[];
  secretRotation?: TSecretRotationV2;
  initialFormData?: Partial<TSecretRotationV2Form>;
};

const FORM_TABS: { name: string; key: string; fields: (keyof TSecretRotationV2Form)[] }[] = [
  {
    name: "Configuration",
    key: "configuration",
    fields: [
      "isAutoRotationEnabled",
      "environment",
      "rotationInterval",
      "connection",
      "rotateAtUtc"
    ]
  },
  // @ts-expect-error temporary parameters aren't present on all forms
  { name: "Parameters", key: "parameters", fields: ["parameters", "temporaryParameters"] },
  { name: "Mappings", key: "secretsMapping", fields: ["secretsMapping"] },
  { name: "Details", key: "details", fields: ["name", "description"] },
  { name: "Review", key: "review", fields: [] }
];

const DEFAULT_ROTATION_INTERVAL = 30;

export const SecretRotationV2Form = ({
  type,
  onComplete,
  onCancel,
  environment: envSlug,
  secretPath,
  secretRotation,
  environments,
  initialFormData
}: Props) => {
  const createSecretRotation = useCreateSecretRotationV2();
  const updateSecretRotation = useUpdateSecretRotationV2();
  const { currentProject } = useProject();
  const { name: rotationType } = SECRET_ROTATION_MAP[type];

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const { rotationOption } = useSecretRotationV2Option(type);

  const formMethods = useForm<TSecretRotationV2Form>({
    resolver: zodResolver(SecretRotationV2FormSchema(Boolean(secretRotation))),
    defaultValues: secretRotation
      ? {
          ...secretRotation,
          environment: currentProject?.environments.find((env) => env.slug === envSlug),
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
          environment: currentProject?.environments.find((env) => env.slug === envSlug),
          secretPath,
          ...((rotationOption?.template as object) ?? {}), // can't infer type since we don't know which specific type it is
          ...(initialFormData as object)
        },
    reValidateMode: "onChange"
  });

  const onSubmit = async ({ environment, connection, ...formData }: TSecretRotationV2Form) => {
    const mutation = secretRotation
      ? updateSecretRotation.mutateAsync({
          rotationId: secretRotation.id,
          projectId: secretRotation.projectId,
          ...formData
        })
      : createSecretRotation.mutateAsync({
          ...formData,

          connectionId: connection.id,
          environment: environment.slug,
          projectId: currentProject.id
        });
    const rotation = await mutation;

    createNotification({
      text: `Successfully ${secretRotation ? "updated" : "created"} ${rotationType} Rotation`,
      type: "success"
    });
    onComplete(rotation);
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
              <SecretRotationV2ConfigurationFields
                isUpdate={Boolean(secretRotation)}
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
          {isFinalStep ? `${secretRotation ? "Update" : "Create"} Secret Rotation` : "Next"}
        </Button>
        <Button onClick={handlePrev} colorSchema="secondary">
          Back
        </Button>
      </div>
    </form>
  );
};
