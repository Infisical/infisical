import { useState } from "react";
import { Controller, UseFormReturn } from "react-hook-form";

import { AppConnectionOptionContent } from "@app/components/app-connections";
import { useConnectionCreation } from "@app/components/app-connections/useConnectionCreation";
import {
  PostQuantumCertificatesUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared/AwsRegionSelect";
import {
  Badge,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useProjectPermission, useSubscription } from "@app/context";
import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { InternalCaType } from "@app/hooks/api/ca/enums";
import { certKeyAlgorithms, isPqcAlgorithm } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { CertKeySource } from "@app/hooks/api/signers";
import { CreateHsmConnectorWizard } from "@app/pages/cert-manager/SettingsPage/components/HsmConnectorsTab/CreateHsmConnectorWizard";

import { CaWizardForm } from "./schemas";
import { HsmConnectorOption, isKeyAlgorithmSupportedByKeySource } from "./types";

const KEY_SOURCE_DESCRIPTIONS: Record<CertKeySource, string> = {
  [CertKeySource.Infisical]: "Infisical generates and manages the CA keypair for you.",
  [CertKeySource.Hsm]:
    "The CA keypair is generated on a Hardware Security Module and every signature is performed there.",
  [CertKeySource.AwsKms]:
    "The CA keypair is generated in AWS KMS and every signature is performed there."
};

type Props = {
  form: UseFormReturn<CaWizardForm>;
  hsmConnectorOptions: HsmConnectorOption[];
  isHsmConnectorsLoading: boolean;
  awsConnectionOptions: TAvailableAppConnection[];
  isAwsConnectionsLoading: boolean;
};

export const KeyValidityStep = ({
  form,
  hsmConnectorOptions,
  isHsmConnectorsLoading,
  awsConnectionOptions,
  isAwsConnectionsLoading
}: Props) => {
  const { subscription } = useSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const isHsmLicensed = Boolean(subscription?.hsm);
  const isAwsKmsLicensed = Boolean(subscription?.pkiAwsKmsSigning);
  const { permission } = useProjectPermission();
  const [createdAwsConnection, setCreatedAwsConnection] = useState<TAvailableAppConnection | null>(
    null
  );
  const [isCreateHsmConnectorOpen, setIsCreateHsmConnectorOpen] = useState(false);
  const [createdHsmConnector, setCreatedHsmConnector] = useState<HsmConnectorOption | null>(null);
  const connectionCreation = useConnectionCreation(AppConnection.AWS, (connection) => {
    setCreatedAwsConnection(connection);
    form.setValue("appConnectionId", connection.id, { shouldValidate: true });
  });
  const canAttachHsm = permission.can(
    ProjectPermissionHsmConnectorActions.Attach,
    ProjectPermissionSub.HsmConnectors
  );
  const canCreateHsm = permission.can(
    ProjectPermissionHsmConnectorActions.Create,
    ProjectPermissionSub.HsmConnectors
  );

  const keySource = form.watch("keySource");
  const caType = form.watch("type");
  const isHsm = keySource === CertKeySource.Hsm;
  const isAwsKms = keySource === CertKeySource.AwsKms;
  const isRoot = caType === InternalCaType.ROOT;

  return (
    <FieldGroup>
      <Controller
        name="keySource"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>
              Key source <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  if (
                    !isKeyAlgorithmSupportedByKeySource(
                      value as CertKeySource,
                      form.getValues("keyAlgorithm")
                    )
                  ) {
                    form.setValue("keyAlgorithm", CertKeyAlgorithm.ECDSA_P256, {
                      shouldValidate: true
                    });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={CertKeySource.Infisical}>Infisical</SelectItem>
                  <SelectItem value={CertKeySource.Hsm} disabled={!isHsmLicensed || !canAttachHsm}>
                    <div className="flex items-center gap-2">
                      HSM
                      {!isHsmLicensed && <Badge variant="info">Enterprise</Badge>}
                      {isHsmLicensed && !canAttachHsm && (
                        <Badge variant="warning">Permission required</Badge>
                      )}
                    </div>
                  </SelectItem>
                  <SelectItem value={CertKeySource.AwsKms} disabled={!isAwsKmsLicensed}>
                    <div className="flex items-center gap-2">
                      AWS KMS
                      {!isAwsKmsLicensed && <Badge variant="info">Enterprise</Badge>}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>{KEY_SOURCE_DESCRIPTIONS[field.value]}</FieldDescription>
            </FieldContent>
          </Field>
        )}
      />

      {isHsm && (
        <Controller
          name="hsmConnectorId"
          control={form.control}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                HSM Connector <span className="text-danger">*</span>
              </FieldLabel>
              <FieldContent>
                <Combobox<HsmConnectorOption>
                  isClearable={false}
                  name={field.name}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  isLoading={isHsmConnectorsLoading}
                  options={hsmConnectorOptions}
                  value={
                    [...hsmConnectorOptions, createdHsmConnector].find(
                      (option) => option?.id === field.value
                    ) ?? null
                  }
                  onValueChange={(selected) => {
                    field.onChange(selected.id);
                  }}
                  getOptionLabel={(opt) => `${opt.name} (${opt.slotLabel})`}
                  getOptionValue={(opt) => opt.id}
                  placeholder="Select an HSM Connector..."
                  creation={
                    isHsmLicensed && canAttachHsm && canCreateHsm
                      ? {
                          mode: "action",
                          emptyLabel: "Create HSM Connector",
                          formatLabel: () => "Create HSM Connector",
                          onAction: () => setIsCreateHsmConnectorOpen(true)
                        }
                      : undefined
                  }
                  emptyMessage={() =>
                    hsmConnectorOptions.length === 0
                      ? "No HSM Connectors configured. Add one in Cert Manager Settings → HSM Connectors."
                      : "No match."
                  }
                  isError={Boolean(error)}
                />
                <FieldDescription>
                  The HSM on which Infisical will generate the CA signing key.
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}

      {isAwsKms && (
        <>
          <Controller
            name="appConnectionId"
            control={form.control}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  AWS Connection <span className="text-danger">*</span>
                </FieldLabel>
                <FieldContent>
                  <Combobox
                    isClearable={false}
                    includeMissingSelectedOptions={false}
                    name={field.name}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    isLoading={isAwsConnectionsLoading}
                    options={awsConnectionOptions}
                    value={
                      [...awsConnectionOptions, createdAwsConnection].find(
                        (option) => option?.id === field.value
                      ) ?? null
                    }
                    onValueChange={(selected) => {
                      field.onChange(selected.id);
                    }}
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.id}
                    renderOption={(option) => <AppConnectionOptionContent data={option} />}
                    creation={connectionCreation}
                    placeholder="Select an AWS connection..."
                    emptyMessage={() =>
                      "No AWS connections available. Contact an admin to create one."
                    }
                    isError={Boolean(error)}
                  />
                  <FieldDescription>
                    The AWS connection Infisical uses to create the key and send signing requests.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            name="region"
            control={form.control}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel id="ca-aws-kms-region-label" htmlFor="ca-aws-kms-region">
                  Region <span className="text-danger">*</span>
                </FieldLabel>
                <FieldContent>
                  <AwsRegionSelect
                    id="ca-aws-kms-region"
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(value || null)}
                    isError={Boolean(error)}
                    aria-labelledby="ca-aws-kms-region-label"
                  />
                  <FieldDescription>
                    The AWS region where the CA signing key is created.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
        </>
      )}

      <Controller
        name="keyAlgorithm"
        control={form.control}
        render={({ field, fieldState: { error } }) => {
          const options = certKeyAlgorithms.filter(({ value }) =>
            isKeyAlgorithmSupportedByKeySource(keySource, value)
          );
          return (
            <Field>
              <FieldLabel>
                Key algorithm <span className="text-danger">*</span>
              </FieldLabel>
              <FieldContent>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    if (isPqcAlgorithm(value) && !subscription.pkiPqc) {
                      openUpgradeGate({
                        intent: PostQuantumCertificatesUpgradeIntent,
                        paywallKey: "cert-manager.ca-key-algorithm"
                      });
                      return;
                    }
                    field.onChange(value);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {options.map(({ label, value }) => {
                      const pqcLocked = isPqcAlgorithm(value) && !subscription?.pkiPqc;
                      return (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            {label}
                            {pqcLocked && <Badge variant="info">Enterprise</Badge>}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Algorithm and size of the CA key pair.
                  {isHsm && " HSM-backed CAs support RSA and ECDSA only."}
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          );
        }}
      />

      {isRoot && (
        <>
          <Controller
            name="notAfter"
            control={form.control}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  Valid Until <span className="text-danger">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input {...field} placeholder="YYYY-MM-DD" isError={Boolean(error)} />
                  <FieldDescription>
                    When the self-signed Root CA certificate expires.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            name="maxPathLength"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel>Path Length</FieldLabel>
                <FieldContent>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {[-1, 0, 1, 2, 3, 4].map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          {String(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    How many intermediate CAs may follow this CA in the chain. -1 means no limit.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
        </>
      )}
      {upgradeGate}
      <CreateHsmConnectorWizard
        isOpen={isCreateHsmConnectorOpen}
        onOpenChange={setIsCreateHsmConnectorOpen}
        onCreated={(connector) => {
          setCreatedHsmConnector({
            id: connector.id,
            name: connector.name,
            slotLabel: connector.slotLabel
          });
          form.setValue("hsmConnectorId", connector.id, {
            shouldDirty: true,
            shouldValidate: true
          });
        }}
      />
    </FieldGroup>
  );
};
