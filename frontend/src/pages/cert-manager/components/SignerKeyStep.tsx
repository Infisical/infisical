import { ReactNode } from "react";
import { Control, Controller, useWatch } from "react-hook-form";
import { AlertTriangleIcon } from "lucide-react";

import {
  Badge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProjectPermission, useSubscription } from "@app/context";
import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  CertKeySource,
  HSM_SUPPORTED_KEY_ALGORITHMS,
  SignerKeyAlgorithm,
  signerKeyAlgorithmLabels
} from "@app/hooks/api/signers";

export type HsmConnectorOption = { id: string; name: string; slotLabel: string };

type SignerKeyStepProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  requiresHsm: boolean;
  hsmConnectorOptions: HsmConnectorOption[];
  isHsmConnectorsLoading: boolean;
};

export const SignerKeyStep = ({
  control,
  requiresHsm,
  hsmConnectorOptions,
  isHsmConnectorsLoading
}: SignerKeyStepProps) => {
  const { subscription } = useSubscription();
  const isHsmLicensed = Boolean(subscription?.hsm);
  const { permission } = useProjectPermission();
  const canAttachHsm = permission.can(
    ProjectPermissionHsmConnectorActions.Attach,
    ProjectPermissionSub.HsmConnectors
  );

  const keySource = useWatch({ control, name: "keySource" });
  const isHsm = keySource === CertKeySource.Hsm;

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
                <FilterableSelect<HsmConnectorOption>
                  isLoading={isHsmConnectorsLoading}
                  options={hsmConnectorOptions}
                  value={hsmConnectorOptions.find((o) => o.id === field.value) ?? null}
                  onChange={(selected) => {
                    const opt = selected as HsmConnectorOption | null;
                    field.onChange(opt?.id ?? null);
                  }}
                  getOptionLabel={(opt) => `${opt.name} (slot ${opt.slotLabel})`}
                  getOptionValue={(opt) => opt.id}
                  placeholder="Select an HSM Connector..."
                  noOptionsMessage={() =>
                    hsmConnectorOptions.length === 0
                      ? "No HSM Connectors configured. Add one in Settings → HSM Connectors."
                      : "No match."
                  }
                  isError={Boolean(error)}
                />
                <FieldDescription>Which HSM connector to use.</FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}

      <Controller
        name="keyAlgorithm"
        control={control}
        render={({ field, fieldState: { error } }) => {
          const options = isHsm
            ? Object.values(SignerKeyAlgorithm).filter((v) =>
                HSM_SUPPORTED_KEY_ALGORITHMS.includes(v)
              )
            : Object.values(SignerKeyAlgorithm);
          return (
            <Field>
              <FieldLabel>
                Key algorithm <span className="text-danger">*</span>
              </FieldLabel>
              <FieldContent>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {options.map((value) => (
                      <SelectItem key={value} value={value}>
                        {signerKeyAlgorithmLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  RSA is widely compatible; ECDSA is smaller and faster.
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          );
        }}
      />
    </FieldGroup>
  );
};
