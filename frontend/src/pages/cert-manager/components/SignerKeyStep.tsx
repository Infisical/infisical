import { ReactNode, useEffect, useState } from "react";
import { Control, Controller, useController, useWatch } from "react-hook-form";
import { AxiosError } from "axios";
import { AlertTriangleIcon, InfoIcon } from "lucide-react";

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
  SelectValue,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProjectPermission, useSubscription } from "@app/context";
import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useDebounce } from "@app/hooks";
import {
  HsmKeyAlgorithm,
  hsmKeyAlgorithmLabels,
  THsmConnectorKey,
  useListHsmConnectorKeys
} from "@app/hooks/api/hsmConnectors";
import {
  CertKeySource,
  HSM_SUPPORTED_KEY_ALGORITHMS,
  SignerKeyAlgorithm,
  signerKeyAlgorithmLabels
} from "@app/hooks/api/signers";
import { CreateHsmConnectorWizard } from "@app/pages/cert-manager/SettingsPage/components/HsmConnectorsTab/CreateHsmConnectorWizard";

import { ExternalOrderMode, isUsingExistingCertificate } from "./DigiCertExistingOrderField";

const formatHsmKeyOption = (key: THsmConnectorKey) =>
  key.keyAlgorithm
    ? `ID ${key.keyId} (${hsmKeyAlgorithmLabels[key.keyAlgorithm as HsmKeyAlgorithm] ?? key.keyAlgorithm})`
    : `ID ${key.keyId}`;

export type HsmConnectorOption = { id: string; name: string; slotLabel: string };

type SignerKeyStepProps = {
  control: Control<any>;
  requiresHsm: boolean;
  hsmConnectorOptions: HsmConnectorOption[];
  isHsmConnectorsLoading: boolean;
  minRsaKeyBits?: number;
  currentKeyAlgorithm?: SignerKeyAlgorithm;
  importCheckError?: string;
};

export const SignerKeyStep = ({
  control,
  requiresHsm,
  hsmConnectorOptions,
  isHsmConnectorsLoading,
  minRsaKeyBits,
  currentKeyAlgorithm,
  importCheckError
}: SignerKeyStepProps) => {
  const { subscription } = useSubscription();
  const isHsmLicensed = Boolean(subscription?.hsm);
  const { permission } = useProjectPermission();
  const canAttachHsm = permission.can(
    ProjectPermissionHsmConnectorActions.Attach,
    ProjectPermissionSub.HsmConnectors
  );
  const canCreateHsmConnector = permission.can(
    ProjectPermissionHsmConnectorActions.Create,
    ProjectPermissionSub.HsmConnectors
  );
  const [isCreateHsmConnectorOpen, setIsCreateHsmConnectorOpen] = useState(false);

  const keySource = useWatch({ control, name: "keySource" });
  const isHsm = keySource === CertKeySource.Hsm;
  const externalOrderId = useWatch({ control, name: "externalOrderId" }) as
    | string
    | null
    | undefined;
  const externalOrderMode = useWatch({ control, name: "externalOrderMode" }) as ExternalOrderMode;
  const usingExistingCertificate = isUsingExistingCertificate({
    externalOrderId,
    externalOrderMode
  });

  const hsmConnectorId = useWatch({ control, name: "hsmConnectorId" }) as string | null | undefined;
  const {
    field: hsmKeyLabelField,
    fieldState: { error: hsmKeyLabelError }
  } = useController({ control, name: "hsmKeyLabel" });
  const {
    field: hsmKeyIdField,
    fieldState: { error: hsmKeyIdError }
  } = useController({ control, name: "hsmKeyId" });
  const { field: hsmKeyIdRequiredField } = useController({ control, name: "hsmKeyIdRequired" });
  const { field: hsmKeyUnresolvedField } = useController({ control, name: "hsmKeyUnresolved" });
  const typedKeyLabel = ((hsmKeyLabelField.value as string) ?? "").trim();
  const [debouncedKeyLabel] = useDebounce(typedKeyLabel);
  const {
    data: matchingHsmKeys,
    isFetching: isHsmKeyLookupFetching,
    error: hsmKeyLookupError
  } = useListHsmConnectorKeys(hsmConnectorId, debouncedKeyLabel, {
    enabled: isHsm && usingExistingCertificate
  });
  const hsmKeyChoices = (matchingHsmKeys ?? []).filter((key) => Boolean(key.keyId));
  const canChooseHsmKey = (matchingHsmKeys?.length ?? 0) > 1 && hsmKeyChoices.length > 0;

  const isHsmKeyLookupPending =
    isHsmKeyLookupFetching || (Boolean(hsmConnectorId) && debouncedKeyLabel !== typedKeyLabel);
  useEffect(() => {
    hsmKeyUnresolvedField.onChange(isHsmKeyLookupPending || matchingHsmKeys?.length === 0);
  }, [isHsmKeyLookupPending, matchingHsmKeys]);

  useEffect(() => {
    const keys = matchingHsmKeys ?? [];

    hsmKeyIdRequiredField.onChange(keys.length > 1 && keys.some((key) => Boolean(key.keyId)));
    if (keys.length === 1) {
      hsmKeyIdField.onChange(keys[0].keyId);
    } else if (!keys.some((key) => key.keyId === hsmKeyIdField.value)) {
      hsmKeyIdField.onChange("");
    }
  }, [matchingHsmKeys]);

  let hsmKeyLookupHint = "The label of the certificate's private key on the HSM.";
  if (isHsmKeyLookupPending) {
    hsmKeyLookupHint = "Looking up the key...";
  } else if (matchingHsmKeys?.length === 1) {
    hsmKeyLookupHint = matchingHsmKeys[0].keyId
      ? `Found the key (ID ${matchingHsmKeys[0].keyId}).`
      : "Found the key.";
  } else if (matchingHsmKeys && matchingHsmKeys.length > 1) {
    hsmKeyLookupHint = canChooseHsmKey
      ? `${matchingHsmKeys.length} keys have this label. Select one below.`
      : `${matchingHsmKeys.length} keys have this label and none has a key ID. Give the keys unique labels.`;
  }
  let hsmKeyLookupProblem: string | undefined;
  if (hsmKeyLookupError) {
    hsmKeyLookupProblem =
      (hsmKeyLookupError as AxiosError<{ message?: string }>)?.response?.data?.message ??
      "Could not look up the key.";
  } else if (matchingHsmKeys?.length === 0) {
    hsmKeyLookupProblem = "No private key with this label in the connector's slot.";
  } else if (importCheckError) {
    hsmKeyLookupProblem = importCheckError;
  }

  const visibleHsmKeyLabelError = typedKeyLabel ? undefined : hsmKeyLabelError;
  const visibleHsmKeyIdError = hsmKeyIdField.value ? undefined : hsmKeyIdError;

  const isAlgorithmAllowed = (algo: SignerKeyAlgorithm): boolean => {
    if (algo === currentKeyAlgorithm) return true;
    if (isHsm && !HSM_SUPPORTED_KEY_ALGORITHMS.includes(algo)) return false;
    if (minRsaKeyBits && algo.startsWith("RSA_") && Number(algo.slice(4)) < minRsaKeyBits)
      return false;
    return true;
  };
  const algorithmOptions = Object.values(SignerKeyAlgorithm).filter(isAlgorithmAllowed);

  const { field: keyAlgorithmField } = useController({ control, name: "keyAlgorithm" });
  useEffect(() => {
    if (
      !usingExistingCertificate &&
      algorithmOptions.length > 0 &&
      !isAlgorithmAllowed(keyAlgorithmField.value)
    ) {
      keyAlgorithmField.onChange(algorithmOptions[0]);
    }
  }, [
    isHsm,
    minRsaKeyBits,
    keyAlgorithmField.value,
    usingExistingCertificate,
    currentKeyAlgorithm
  ]);

  let keySourceHint: ReactNode = "Infisical manages the keypair.";
  if (requiresHsm) {
    keySourceHint = (
      <span className="inline-flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0 text-warning" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            This CA only issues certificates with an HSM-backed key.
          </TooltipContent>
        </Tooltip>
        HSM required by this CA.
      </span>
    );
  } else if (isHsm) {
    keySourceHint = "Uses an HSM-backed key.";
  }

  return (
    <FieldGroup>
      <Controller
        name="keySource"
        control={control}
        render={({ field }) => (
          <Field>
            <FieldLabel>
              Key source <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Select value={field.value} onValueChange={field.onChange} disabled={requiresHsm}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={CertKeySource.Infisical} disabled={requiresHsm}>
                    Infisical
                  </SelectItem>
                  <SelectItem value={CertKeySource.Hsm} disabled={!isHsmLicensed || !canAttachHsm}>
                    <div className="flex items-center gap-2">
                      HSM
                      {!isHsmLicensed && <Badge variant="info">Enterprise</Badge>}
                      {isHsmLicensed && !canAttachHsm && (
                        <Badge variant="warning">Permission required</Badge>
                      )}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>{keySourceHint}</FieldDescription>
            </FieldContent>
          </Field>
        )}
      />

      {isHsm && (
        <Controller
          name="hsmConnectorId"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                HSM Connector <span className="text-danger">*</span>
              </FieldLabel>
              <FieldContent>
                <Combobox<HsmConnectorOption>
                  isClearable={false}
                  isLoading={isHsmConnectorsLoading}
                  options={hsmConnectorOptions}
                  value={hsmConnectorOptions.find((o) => o.id === field.value) ?? null}
                  onValueChange={(opt) => field.onChange(opt.id)}
                  creation={
                    canCreateHsmConnector
                      ? {
                          mode: "action",
                          emptyLabel: "Add HSM Connector",
                          formatLabel: () => "Add HSM Connector",
                          onAction: () => setIsCreateHsmConnectorOpen(true)
                        }
                      : undefined
                  }
                  getOptionLabel={(opt) => `${opt.name} (slot ${opt.slotLabel})`}
                  getOptionValue={(opt) => opt.id}
                  placeholder="Select an HSM Connector..."
                  searchPlaceholder="Search HSM Connectors..."
                  searchAriaLabel="Search HSM Connectors"
                  emptyMessage={
                    hsmConnectorOptions.length === 0 ? "No HSM Connectors configured." : "No match."
                  }
                  isError={Boolean(error)}
                />
                <FieldDescription>Which HSM connector to use.</FieldDescription>
                <FieldError errors={[error]} />
                {canCreateHsmConnector && (
                  <CreateHsmConnectorWizard
                    isOpen={isCreateHsmConnectorOpen}
                    onOpenChange={setIsCreateHsmConnectorOpen}
                    onCreated={(connector) => field.onChange(connector.id)}
                  />
                )}
              </FieldContent>
            </Field>
          )}
        />
      )}

      {isHsm && externalOrderId && (
        <Controller
          name="externalOrderMode"
          control={control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <div className="flex items-center gap-1.5">
                  <FieldLabel htmlFor="use-existing-key">Use existing key</FieldLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-3.5 w-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      When off, DigiCert issues a new certificate into this order.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <FieldDescription>
                  Sign with the certificate already issued in this order and its key on the HSM.
                </FieldDescription>
                {field.value !== ExternalOrderMode.UseExisting && (
                  <FieldDescription className="text-warning">
                    DigiCert revokes the order&apos;s current certificate within 72 hours of the
                    replacement. After that, it can no longer be used to sign.
                  </FieldDescription>
                )}
              </FieldContent>
              <Toggle
                id="use-existing-key"
                variant="project"
                checked={field.value === ExternalOrderMode.UseExisting}
                onCheckedChange={(checked) =>
                  field.onChange(
                    checked ? ExternalOrderMode.UseExisting : ExternalOrderMode.Reissue
                  )
                }
              />
            </Field>
          )}
        />
      )}

      {isHsm && usingExistingCertificate && (
        <Field>
          <FieldLabel>
            Key label <span className="text-danger">*</span>
          </FieldLabel>
          <FieldContent>
            <Input
              {...hsmKeyLabelField}
              value={hsmKeyLabelField.value ?? ""}
              placeholder="acme-code-signing-2026"
              isError={Boolean(visibleHsmKeyLabelError || hsmKeyLookupProblem)}
            />
            <FieldDescription>{hsmKeyLookupHint}</FieldDescription>
            <FieldError
              errors={[
                visibleHsmKeyLabelError,
                hsmKeyLookupProblem ? { message: hsmKeyLookupProblem } : undefined
              ]}
            />
          </FieldContent>
        </Field>
      )}

      {isHsm && usingExistingCertificate && canChooseHsmKey && (
        <Field>
          <FieldLabel>
            Key ID <span className="text-danger">*</span>
          </FieldLabel>
          <FieldContent>
            <Select value={hsmKeyIdField.value || undefined} onValueChange={hsmKeyIdField.onChange}>
              <SelectTrigger className="w-full" isError={Boolean(visibleHsmKeyIdError)}>
                <SelectValue placeholder="Select a key..." />
              </SelectTrigger>
              <SelectContent position="popper">
                {hsmKeyChoices.map((key) => (
                  <SelectItem key={key.keyId} value={key.keyId}>
                    {formatHsmKeyOption(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>The key&apos;s CKA_ID on the HSM.</FieldDescription>
            <FieldError errors={[visibleHsmKeyIdError]} />
          </FieldContent>
        </Field>
      )}

      {!usingExistingCertificate && (
        <Field>
          <FieldLabel>
            Key algorithm <span className="text-danger">*</span>
          </FieldLabel>
          <FieldContent>
            <Select value={keyAlgorithmField.value} onValueChange={keyAlgorithmField.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {algorithmOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {signerKeyAlgorithmLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              RSA is widely compatible; ECDSA is smaller and faster.
            </FieldDescription>
          </FieldContent>
        </Field>
      )}
    </FieldGroup>
  );
};
