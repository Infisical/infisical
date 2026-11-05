import { Controller, useFormContext } from "react-hook-form";
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
  FieldLabel
} from "@app/components/v3";
import {
  OrgPermissionHoneyTokenActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { TAwsHoneyTokenDeploymentOption } from "@app/hooks/api/honeyToken";
import {
  AwsHoneyTokenDeploymentUnavailableReason,
  HoneyTokenManagedBy
} from "@app/hooks/api/honeyTokens/enums";
import { ProjectEnv } from "@app/hooks/api/projects/types";

import { THoneyTokenForm } from "./schemas";

type Props = {
  environments?: ProjectEnv[];
  deploymentOptions?: TAwsHoneyTokenDeploymentOption[];
  isDeploymentOptionsError?: boolean;
  isRetryingDeploymentOptions?: boolean;
  onRetryDeploymentOptions?: () => void;
};

export const HoneyTokenConfigurationFields = ({
  environments,
  deploymentOptions,
  isDeploymentOptionsError,
  isRetryingDeploymentOptions,
  onRetryDeploymentOptions
}: Props) => {
  const { control, setValue, clearErrors } = useFormContext<THoneyTokenForm>();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();

  const canSetUpOrganizationAccount = permission.can(
    OrgPermissionHoneyTokenActions.Setup,
    OrgPermissionSubjects.HoneyTokens
  );
  const instanceOption = deploymentOptions?.find(
    (option) => option.managedBy === HoneyTokenManagedBy.Instance
  );
  const organizationOption = deploymentOptions?.find(
    (option) => option.managedBy === HoneyTokenManagedBy.Organization
  );
  const isManagedAvailable = Boolean(instanceOption && !instanceOption.unavailableReason);
  const isOrganizationAccountReady = Boolean(
    organizationOption && !organizationOption.unavailableReason
  );
  const isSetupActionShown =
    Boolean(deploymentOptions) && !isOrganizationAccountReady && canSetUpOrganizationAccount;
  const setupActionLabel =
    organizationOption?.unavailableReason ===
    AwsHoneyTokenDeploymentUnavailableReason.StackVerificationPending
      ? "Finish AWS Account Setup"
      : "Connect AWS Account";

  let organizationAccountDescription =
    "Ask an organization admin to connect your organization's AWS account to use this option.";
  if (isOrganizationAccountReady) {
    organizationAccountDescription =
      "Infisical creates the decoy credentials in the AWS account your organization connected.";
  } else if (canSetUpOrganizationAccount) {
    organizationAccountDescription = "Connect your organization's AWS account to use this option.";
  }

  // Infisical-managed honey tokens are only offered on Infisical Cloud.
  const managedByChoices = [
    ...(isInfisicalCloud()
      ? [
          {
            value: HoneyTokenManagedBy.Instance,
            title: "Infisical Managed",
            description: isManagedAvailable
              ? "Infisical creates the decoy credentials in an Infisical-managed AWS account. No setup needed."
              : "Temporarily unavailable. Contact support if this persists.",
            isDisabled: !isManagedAvailable
          }
        ]
      : []),
    {
      value: HoneyTokenManagedBy.Organization,
      title: "Self hosted",
      description: organizationAccountDescription,
      isDisabled: !isOrganizationAccountReady
    }
  ];

  return (
    <>
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
      <Controller
        control={control}
        name="managedBy"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="honey-token-managed-by">AWS account</FieldLabel>
            <Combobox
              id="honey-token-managed-by"
              value={managedByChoices.find((choice) => choice.value === value) ?? null}
              isClearable={false}
              placeholder="Select an AWS account..."
              onValueChange={(choice) => {
                clearErrors("managedBy");
                onChange(choice.value);
              }}
              options={managedByChoices}
              getOptionValue={(choice) => choice.value}
              getOptionLabel={(choice) => choice.title}
              isOptionDisabled={(choice) => choice.isDisabled}
              renderOption={(choice) => (
                <div className="min-w-0">
                  <p className="truncate">{choice.title}</p>
                  <p className="text-xs leading-4 break-words whitespace-normal text-muted">
                    {choice.description}
                  </p>
                </div>
              )}
              creation={
                isSetupActionShown
                  ? {
                      mode: "action",
                      emptyLabel: setupActionLabel,
                      formatLabel: () => setupActionLabel,
                      // A new tab keeps this half-filled form open while the account is set up.
                      onAction: () =>
                        window.open(
                          `/organizations/${currentOrg.id}/projects/secret-management/product-settings`,
                          "_blank",
                          "noopener,noreferrer"
                        )
                    }
                  : undefined
              }
              isError={Boolean(error)}
            />
            <FieldDescription>
              {managedByChoices.find((choice) => choice.value === value)?.description}
            </FieldDescription>
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
      {isDeploymentOptionsError && !deploymentOptions && (
        <Alert variant="danger">
          <AlertTriangle />
          <AlertDescription className="text-xs">
            <span>Couldn&apos;t load where this honey token can be created.</span>
            <AlertAction>
              <Button
                variant="danger"
                size="xs"
                isPending={isRetryingDeploymentOptions}
                onClick={onRetryDeploymentOptions}
              >
                Retry
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
