import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, SheetFooter, Stepper, StepperList, StepperStep } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { HONEY_TOKEN_DEFAULT_SECRET_NAMES, HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { useCreateHoneyToken, useUpdateHoneyToken } from "@app/hooks/api/honeyTokens";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { fetchProjectSecrets } from "@app/hooks/api/secrets/queries";

import { HoneyTokenMappingFields } from "./HoneyTokenMappingFields/HoneyTokenMappingFields";
import { HoneyTokenConfigurationFields } from "./HoneyTokenConfigurationFields";
import { HoneyTokenDetailsFields } from "./HoneyTokenDetailsFields";
import { HoneyTokenFormSchema, THoneyTokenForm } from "./schemas";

type Props = {
  onComplete: () => void;
  type: HoneyTokenType;
  onCancel: () => void;
  layout?: "dialog" | "sheet";
  secretPath: string;
  environment?: string;
  environments?: ProjectEnv[];
  honeyToken?: TDashboardHoneyToken;
};

type FormTab = {
  name: string;
  key: string;
  shortDescription: string;
  title: string;
  subtitle: string;
  rightDescription: string;
  fields: (keyof THoneyTokenForm)[];
};

const FORM_TABS: FormTab[] = [
  {
    name: "Configuration",
    key: "configuration",
    shortDescription: "Environment",
    title: "Choose where to plant it",
    subtitle: "Select the environment where Infisical should store the decoy credentials.",
    rightDescription:
      "The selected environment determines where the generated honey token credentials are stored.",
    fields: ["environment"]
  },
  {
    name: "Mapping",
    key: "mapping",
    shortDescription: "Secret keys",
    title: "Map the generated credentials",
    subtitle: "Choose the secret keys that will receive each decoy credential field.",
    rightDescription:
      "Each generated credential field is written to the mapped secret key in the selected environment.",
    fields: ["secretsMapping"]
  },
  {
    name: "Details",
    key: "details",
    shortDescription: "Name and description",
    title: "Add honey token details",
    subtitle: "Give this honey token a clear name and an optional description.",
    rightDescription: "Use a name that makes the decoy easy to identify when it triggers an alert.",
    fields: ["name", "description"]
  }
];

export const HoneyTokenForm = ({
  type,
  onComplete,
  onCancel,
  layout = "dialog",
  environment: envSlug,
  secretPath,
  environments,
  honeyToken
}: Props) => {
  const createHoneyToken = useCreateHoneyToken();
  const updateHoneyToken = useUpdateHoneyToken();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { name: tokenTypeName } = HONEY_TOKEN_MAP[type];

  const isUpdate = Boolean(honeyToken);
  const formTabs = isUpdate ? FORM_TABS.filter((tab) => tab.key !== "configuration") : FORM_TABS;

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const formMethods = useForm<THoneyTokenForm>({
    resolver: zodResolver(HoneyTokenFormSchema),
    defaultValues: honeyToken
      ? {
          ...honeyToken,
          environment: currentProject?.environments.find(
            (env) => env.slug === honeyToken.environment.slug
          ),
          secretPath
        }
      : {
          type,
          environment: currentProject?.environments.find((env) => env.slug === envSlug),
          secretPath,
          secretsMapping: HONEY_TOKEN_DEFAULT_SECRET_NAMES[type]
        },
    reValidateMode: "onChange"
  });

  const onSubmit = async ({ environment, ...formData }: THoneyTokenForm) => {
    if (honeyToken) {
      await updateHoneyToken.mutateAsync({
        honeyTokenId: honeyToken.id,
        projectId: honeyToken.projectId,
        name: formData.name,
        description: formData.description,
        secretsMapping: formData.secretsMapping
      });

      createNotification({
        text: `Successfully updated ${tokenTypeName} Honey Token`,
        type: "success"
      });
    } else {
      const { stackDeployment } = await createHoneyToken.mutateAsync({
        ...formData,
        environment: environment.slug,
        projectId: currentProject.id
      });

      if (stackDeployment && !stackDeployment.deployed) {
        const isDeploying = stackDeployment.status?.endsWith("_IN_PROGRESS");
        createNotification({
          text: isDeploying
            ? "Token was created, but stack is still deploying."
            : "Token was created, but stack is not deployed yet.",
          callToAction: (
            <Link
              className="inline-flex h-7 items-center rounded border border-border px-2 text-xs text-foreground transition-colors hover:bg-container-hover"
              to={ROUTE_PATHS.Organization.SettingsPage.path}
              params={{ orgId: currentOrg.id }}
              search={{ selectedTab: "product-settings" }}
            >
              Go to settings
            </Link>
          ),
          type: "warning"
        });
      } else {
        createNotification({
          text: `Successfully created ${tokenTypeName} Honey Token`,
          type: "success"
        });
      }
    }
    onComplete();
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

  const isStepValid = async (index: number) => trigger(formTabs[index].fields);

  const isFinalStep = selectedTabIndex === formTabs.length - 1;

  const [isValidating, setIsValidating] = useState(false);

  const checkMappingConflicts = async (): Promise<boolean> => {
    const { environment, secretsMapping } = formMethods.getValues();
    if (!environment?.slug || !secretsMapping) return true;

    const mappingEntries = Object.entries(secretsMapping);
    const values = mappingEntries.map(([, v]) => v);

    if (new Set(values).size !== values.length) {
      formMethods.setError("secretsMapping", {
        message: "Secret mapping names must be unique."
      });
      return false;
    }

    try {
      setIsValidating(true);
      const data = await fetchProjectSecrets({
        projectId: currentProject.id,
        environment: environment.slug,
        secretPath
      });

      const ownKeys = honeyToken ? new Set(Object.values(honeyToken.secretsMapping)) : new Set();
      const existingKeys = new Set(data.secrets.map((s) => s.secretKey));
      const conflicts = values.filter((key) => existingKeys.has(key) && !ownKeys.has(key));

      if (conflicts.length > 0) {
        formMethods.setError("secretsMapping", {
          message: `The following secrets already exist in this path: ${conflicts.join(", ")}`
        });
        return false;
      }
    } catch {
      createNotification({
        text: "Failed to validate secret names. Please try again.",
        type: "error"
      });
      return false;
    } finally {
      setIsValidating(false);
    }

    return true;
  };

  const mappingStepIndex = formTabs.findIndex((tab) => tab.key === "mapping");

  const handleNext = async () => {
    if (isFinalStep) {
      handleSubmit(onSubmit)();
      return;
    }

    const isValid = await isStepValid(selectedTabIndex);

    if (!isValid) return;

    if (selectedTabIndex === mappingStepIndex && !isUpdate) {
      const noConflicts = await checkMappingConflicts();
      if (!noConflicts) return;
    }

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

  const handleStepChange = (index: number) => {
    isTabEnabled(index).then((isEnabled) => {
      if (isEnabled) setSelectedTabIndex(index);
    });
  };

  const currentStep = formTabs[selectedTabIndex];

  const formFields = (
    <>
      {currentStep.key === "configuration" && (
        <HoneyTokenConfigurationFields environments={environments} />
      )}
      {currentStep.key === "mapping" && <HoneyTokenMappingFields />}
      {currentStep.key === "details" && <HoneyTokenDetailsFields />}
    </>
  );

  if (layout === "sheet") {
    const displayedStepNumber = selectedTabIndex + 1;
    const totalSteps = formTabs.length;

    return (
      <FormProvider {...formMethods}>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => event.preventDefault()}>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="hidden w-60 shrink-0 flex-col border-r border-border px-5 py-6 md:flex">
              <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
                Setup steps
              </p>
              <Stepper
                activeStep={selectedTabIndex}
                orientation="vertical"
                onStepChange={handleStepChange}
                nonLinear
              >
                <StepperList aria-label="Honey token setup progress">
                  {formTabs.map((tab, index) => (
                    <StepperStep
                      key={tab.key}
                      index={index}
                      title={tab.name}
                      description={tab.shortDescription}
                      disabled={isSubmitting || isValidating}
                    />
                  ))}
                </StepperList>
              </Stepper>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
              <div className="border-b border-border px-4 py-4 md:hidden">
                <p className="text-xs font-medium text-muted">
                  Step {displayedStepNumber} of {totalSteps}: {currentStep.name}
                </p>
              </div>
              <div className="flex w-full max-w-3xl flex-col gap-y-2 px-4 py-6 md:px-8">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-foreground">{currentStep.title}</h2>
                  <p className="mt-1 text-sm text-muted">{currentStep.subtitle}</p>
                </div>
                {formFields}
              </div>
            </div>

            <aside className="hidden w-80 shrink-0 flex-col border-l border-border px-6 py-6 xl:flex">
              <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                Step {displayedStepNumber} · {currentStep.name}
              </p>
              <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {currentStep.rightDescription}
              </p>
            </aside>
          </div>
        </form>
        <SheetFooter className="items-center justify-between border-t">
          <span className="text-xs text-muted">
            Step {displayedStepNumber} of {totalSteps}
          </span>
          <div className="flex items-center gap-3">
            <Button onClick={handlePrev} variant="outline">
              Back
            </Button>
            <Button
              onClick={handleNext}
              isPending={isSubmitting || isValidating}
              isDisabled={isSubmitting || isValidating}
              variant={isFinalStep ? "org" : "outline"}
            >
              {isFinalStep ? "Create Honey Token" : "Next"}
            </Button>
          </div>
        </SheetFooter>
      </FormProvider>
    );
  }

  return (
    <FormProvider {...formMethods}>
      <form className="flex max-h-[75vh] flex-col">
        <div className="min-h-0 flex-1 p-4">
          <Stepper
            activeStep={selectedTabIndex}
            orientation="horizontal"
            onStepChange={handleStepChange}
            nonLinear
          >
            <StepperList aria-label="Honey token setup progress">
              {formTabs.map((tab, index) => (
                <StepperStep
                  key={tab.key}
                  index={index}
                  title={tab.name}
                  disabled={isSubmitting || isValidating}
                />
              ))}
            </StepperList>
          </Stepper>
          <div className="mt-6">{formFields}</div>
        </div>
      </form>
      <SheetFooter>
        <Button onClick={handlePrev} variant="outline">
          Back
        </Button>
        <Button
          onClick={handleNext}
          isPending={isSubmitting || isValidating}
          isDisabled={isSubmitting || isValidating}
          variant={isFinalStep ? "org" : "outline"}
        >
          {isFinalStep ? `${honeyToken ? "Update" : "Create"} Honey Token` : "Next"}
        </Button>
      </SheetFooter>
    </FormProvider>
  );
};
