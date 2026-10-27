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
import { HoneyTokenConfigStatus, HoneyTokenHosting } from "@app/hooks/api/honeyTokens/enums";
import { THoneyTokenHostingOptions } from "@app/hooks/api/honeyTokens/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";

import { THoneyTokenForm } from "./schemas";

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
  const { control, setValue, clearErrors } = useFormContext<THoneyTokenForm>();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();

  const canSetUpCustomerAccount = permission.can(
    OrgPermissionHoneyTokenActions.Setup,
    OrgPermissionSubjects.HoneyTokens
  );
  const isManagedAvailable = Boolean(hostingOptions?.infisicalManaged.isAvailable);
  const customerAccountStatus = hostingOptions?.customerAccount.configStatus ?? null;
  const isCustomerAccountReady = customerAccountStatus === HoneyTokenConfigStatus.Complete;
  const isSetupActionShown =
    Boolean(hostingOptions) && !isCustomerAccountReady && canSetUpCustomerAccount;
  const setupActionLabel =
    customerAccountStatus === HoneyTokenConfigStatus.VerificationPending
      ? "Finish AWS Account Setup"
      : "Connect AWS Account";

  let customerAccountDescription =
    "Ask an organization admin to connect your organization's AWS account to use this option.";
  if (isCustomerAccountReady) {
    customerAccountDescription =
      "Infisical creates the decoy credentials in the AWS account your organization connected.";
  } else if (canSetUpCustomerAccount) {
    customerAccountDescription = "Connect your organization's AWS account to use this option.";
  }

  // Infisical-managed honey tokens are only offered on Infisical Cloud.
  const hostingChoices = [
    ...(isInfisicalCloud()
      ? [
          {
            value: HoneyTokenHosting.InfisicalManaged,
            title: "Infisical Managed",
            description: isManagedAvailable
              ? "Infisical creates the decoy credentials in an Infisical-managed AWS account. No setup needed."
              : "Temporarily unavailable. Contact support if this persists.",
            isDisabled: !isManagedAvailable
          }
        ]
      : []),
    {
      value: HoneyTokenHosting.CustomerAccount,
      title: "Self hosted",
      description: customerAccountDescription,
      isDisabled: !isCustomerAccountReady
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
        name="hosting"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="honey-token-hosting">AWS account</FieldLabel>
            <Combobox
              id="honey-token-hosting"
              value={hostingChoices.find((choice) => choice.value === value) ?? null}
              isClearable={false}
              placeholder="Select an AWS account..."
              onValueChange={(choice) => {
                clearErrors("hosting");
                onChange(choice.value);
              }}
              options={hostingChoices}
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
              {hostingChoices.find((choice) => choice.value === value)?.description}
            </FieldDescription>
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
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
    </>
  );
};
