import { Controller, useForm } from "react-hook-form";

import {
  Badge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
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
import { InternalCaType } from "@app/hooks/api/ca/enums";
import { certKeyAlgorithms, isPqcAlgorithm } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { CertKeySource } from "@app/hooks/api/signers";

import { CaWizardForm } from "./schemas";
import { HSM_SUPPORTED_CA_KEY_ALGORITHMS, HsmConnectorOption } from "./types";

type Props = {
  form: ReturnType<typeof useForm<CaWizardForm>>;
  hsmConnectorOptions: HsmConnectorOption[];
  isHsmConnectorsLoading: boolean;
};

export const KeyValidityStep = ({ form, hsmConnectorOptions, isHsmConnectorsLoading }: Props) => {
  const { subscription } = useSubscription();
  const isHsmLicensed = Boolean(subscription?.hsm);
  const { permission } = useProjectPermission();
  const canAttachHsm = permission.can(
    ProjectPermissionHsmConnectorActions.Attach,
    ProjectPermissionSub.HsmConnectors
  );

  const keySource = form.watch("keySource");
  const caType = form.watch("type");
  const isHsm = keySource === CertKeySource.Hsm;
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
                    value === CertKeySource.Hsm &&
                    !HSM_SUPPORTED_CA_KEY_ALGORITHMS.includes(form.getValues("keyAlgorithm"))
                  ) {
                    form.setValue("keyAlgorithm", CertKeyAlgorithm.RSA_2048, {
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
                </SelectContent>
              </Select>
              <FieldDescription>
                {isHsm
                  ? "The CA keypair is generated on a Hardware Security Module and every signature is performed there."
                  : "Infisical generates and manages the CA keypair for you."}
              </FieldDescription>
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
                <FilterableSelect<HsmConnectorOption>
                  isLoading={isHsmConnectorsLoading}
                  options={hsmConnectorOptions}
                  value={hsmConnectorOptions.find((o) => o.id === field.value) ?? null}
                  onChange={(selected) => {
                    const opt = selected as HsmConnectorOption | null;
                    field.onChange(opt?.id ?? null);
                  }}
                  getOptionLabel={(opt) => `${opt.name} (${opt.slotLabel})`}
                  getOptionValue={(opt) => opt.id}
                  placeholder="Select an HSM Connector..."
                  noOptionsMessage={() =>
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

      <Controller
        name="keyAlgorithm"
        control={form.control}
        render={({ field, fieldState: { error } }) => {
          const options = certKeyAlgorithms.filter(
            ({ value }) => !isHsm || HSM_SUPPORTED_CA_KEY_ALGORITHMS.includes(value)
          );
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
                    {options.map(({ label, value }) => {
                      const pqcLocked = isPqcAlgorithm(value) && !subscription?.pkiPqc;
                      return (
                        <SelectItem key={value} value={value} disabled={pqcLocked}>
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
                  Algorithm and size of the CA key pair. HSM-backed CAs support RSA and ECDSA only.
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
    </FieldGroup>
  );
};
