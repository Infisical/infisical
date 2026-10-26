import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  Button,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionHoneyTokenActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import {
  HoneyTokenConfigStatus,
  HoneyTokenHosting,
  HoneyTokenManagedUnavailableReason
} from "@app/hooks/api/honeyTokens/enums";
import { THoneyTokenHostingOptions } from "@app/hooks/api/honeyTokens/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";

import { THoneyTokenForm } from "./schemas";

// Self-hosted users are told which setting is missing so they can pass it to whoever runs the
// instance. On Infisical Cloud the instance settings are ours, so an env var name would mean nothing.
const getManagedUnavailableDescription = (reason: HoneyTokenManagedUnavailableReason | null) => {
  if (isInfisicalCloud()) {
    return "Temporarily unavailable. Contact support if this persists.";
  }

  switch (reason) {
    case HoneyTokenManagedUnavailableReason.IncompleteAwsCredentials:
      return "Not available on this instance: HONEY_TOKEN_MANAGED_AWS_ACCESS_KEY_ID and HONEY_TOKEN_MANAGED_AWS_SECRET_ACCESS_KEY must be set together. Ask your instance administrator to fix this.";
    case HoneyTokenManagedUnavailableReason.InvalidRoleArn:
      return "Not available on this instance: HONEY_TOKEN_MANAGED_AWS_ROLE_ARN must be an IAM role ARN (arn:aws:iam::<account-id>:role/<name>). Ask your instance administrator to fix this.";
    default:
      return "Not available on this instance. Ask your instance administrator to check the managed honey token settings.";
  }
};

type Props = {
  environments?: ProjectEnv[];
  hostingOptions?: THoneyTokenHostingOptions;
  isHostingOptionsError?: boolean;
  isRetryingHostingOptions?: boolean;
  onRetryHostingOptions?: () => void;
};

export const HoneyTokenConfigurationFields = ({
  environments,
  hostingOptions,
  isHostingOptionsError,
  isRetryingHostingOptions,
  onRetryHostingOptions
}: Props) => {
  const {
    control,
    setValue,
    clearErrors,
    formState: { errors }
  } = useFormContext<THoneyTokenForm>();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const hosting = useWatch({ control, name: "hosting" });

  const canSetUpCustomerAccount = permission.can(
    OrgPermissionHoneyTokenActions.Setup,
    OrgPermissionSubjects.HoneyTokens
  );
  const isManagedAvailable = Boolean(hostingOptions?.infisicalManaged.isAvailable);
  // An instance that never set up managed honey tokens only has the customer's own account, so there is
  // nothing to choose. A misconfigured one still shows the chooser, with the reason managed is unavailable.
  // Waiting for the options keeps the chooser from appearing and then vanishing.
  const isHostingChoiceShown =
    Boolean(hostingOptions) &&
    hostingOptions?.infisicalManaged.unavailableReason !==
      HoneyTokenManagedUnavailableReason.NotConfigured;
  const customerAccountStatus = hostingOptions?.customerAccount.configStatus ?? null;
  const isCustomerAccountReady = customerAccountStatus === HoneyTokenConfigStatus.Complete;

  const hostingChoices = [
    {
      value: HoneyTokenHosting.InfisicalManaged,
      title: "Infisical-managed",
      description: isManagedAvailable
        ? "Infisical creates the decoy credentials in its own AWS account. No setup needed."
        : getManagedUnavailableDescription(
            hostingOptions?.infisicalManaged.unavailableReason ?? null
          ),
      isDisabled: !isManagedAvailable
    },
    {
      value: HoneyTokenHosting.CustomerAccount,
      title: "Your AWS account",
      description:
        "Infisical creates the decoy credentials in the AWS account your organization connected.",
      isDisabled: false
    }
  ];

  return (
    <>
      {isHostingChoiceShown && (
        <Controller
          control={control}
          name="hosting"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>AWS account</FieldLabel>
              <RadioGroup
                value={value}
                onValueChange={(nextValue) => {
                  clearErrors("hosting");
                  onChange(nextValue);
                }}
                aria-label="AWS account"
              >
                {hostingChoices.map((choice) => (
                  <FieldLabel
                    key={choice.value}
                    htmlFor={`honey-token-hosting-${choice.value}`}
                    variant="project"
                  >
                    <Field orientation="horizontal" data-disabled={choice.isDisabled}>
                      <FieldContent>
                        <FieldTitle>{choice.title}</FieldTitle>
                        <FieldDescription>{choice.description}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem
                        id={`honey-token-hosting-${choice.value}`}
                        value={choice.value}
                        disabled={choice.isDisabled}
                        isError={Boolean(error)}
                      />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
      )}
      {hostingOptions &&
        hosting === HoneyTokenHosting.CustomerAccount &&
        !isCustomerAccountReady && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>
              <p>
                {customerAccountStatus === HoneyTokenConfigStatus.VerificationPending
                  ? "Your organization connected its AWS account, but the CloudFormation stack is not verified yet."
                  : "Your organization has not connected its own AWS account for honey tokens."}{" "}
                {canSetUpCustomerAccount ? (
                  <Link
                    to={ROUTE_PATHS.Organization.SettingsPage.path}
                    params={{ orgId: currentOrg.id }}
                    search={{ selectedTab: "product-settings" }}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Finish the setup in Organization Settings
                  </Link>
                ) : (
                  "Ask an organization admin to finish the setup."
                )}
              </p>
            </AlertDescription>
          </Alert>
        )}
      {isHostingOptionsError && !hostingOptions && (
        <Alert variant="danger">
          <AlertTriangle />
          <AlertDescription className="text-xs">
            <span>Couldn&apos;t load where this honey token can be created.</span>
            <AlertAction>
              <Button
                variant="danger"
                size="xs"
                isPending={isRetryingHostingOptions}
                onClick={onRetryHostingOptions}
              >
                Retry
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}
      {!isHostingChoiceShown && !isHostingOptionsError && errors.hosting && (
        <FieldError>{errors.hosting.message}</FieldError>
      )}
      {environments && (
        <Controller
          control={control}
          name="environment"
          render={({ field: { value }, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="honey-token-environment">Environment</FieldLabel>
              <FieldContent>
                <Combobox
                  id="honey-token-environment"
                  value={value}
                  isClearable={false}
                  onValueChange={(environment) =>
                    setValue("environment", environment, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true
                    })
                  }
                  options={environments}
                  placeholder="Select an environment..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                  getOptionKeywords={(option) => [option.id]}
                  isError={Boolean(error)}
                />
              </FieldContent>
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
      )}
    </>
  );
};
