import { Controller, useFormContext } from "react-hook-form";
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
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionHoneyTokenActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { HoneyTokenConfigStatus, HoneyTokenHosting } from "@app/hooks/api/honeyTokens/enums";
import { THoneyTokenHostingOptions } from "@app/hooks/api/honeyTokens/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";

import { THoneyTokenForm } from "./schemas";

type Props = {
  hosting: HoneyTokenHosting;
  environments?: ProjectEnv[];
  hostingOptions?: THoneyTokenHostingOptions;
  isHostingOptionsError?: boolean;
  isRetryingHostingOptions?: boolean;
  onRetryHostingOptions?: () => void;
};

export const HoneyTokenConfigurationFields = ({
  hosting,
  environments,
  hostingOptions,
  isHostingOptionsError,
  isRetryingHostingOptions,
  onRetryHostingOptions
}: Props) => {
  const {
    control,
    setValue,
    formState: { errors }
  } = useFormContext<THoneyTokenForm>();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();

  const canSetUpCustomerAccount = permission.can(
    OrgPermissionHoneyTokenActions.Setup,
    OrgPermissionSubjects.HoneyTokens
  );
  const customerAccountStatus = hostingOptions?.customerAccount.configStatus ?? null;
  const isCustomerAccountReady = customerAccountStatus === HoneyTokenConfigStatus.Complete;

  return (
    <>
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
      {!isHostingOptionsError && errors.hosting && (
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
