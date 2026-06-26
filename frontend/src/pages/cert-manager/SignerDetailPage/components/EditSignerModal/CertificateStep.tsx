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
import {
  CertKeySource,
  HSM_SUPPORTED_KEY_ALGORITHMS,
  SignerKeyAlgorithm,
  signerKeyAlgorithmLabels
} from "@app/hooks/api/signers";

import { CertificateForm } from "./schemas";
import { CaGroup, CaOption } from "./types";

export type HsmConnectorOption = { id: string; name: string; slotLabel: string };

type CertificateStepProps = {
  form: ReturnType<typeof useForm<CertificateForm>>;
  caOptions: CaOption[];
  isCasLoading: boolean;
  commonName: string;
  certificateTtlDays: number | null;
  hsmConnectorOptions: HsmConnectorOption[];
  isHsmConnectorsLoading: boolean;
  caSwap: boolean;
  canEditSubject: boolean;
  keySourceChanged: boolean;
};

export const CertificateStep = ({
  form,
  caOptions,
  isCasLoading,
  commonName,
  certificateTtlDays,
  hsmConnectorOptions,
  isHsmConnectorsLoading,
  caSwap,
  canEditSubject,
  keySourceChanged
}: CertificateStepProps) => {
  const { subscription } = useSubscription();
  const isHsmLicensed = Boolean(subscription?.hsm);
  const { permission } = useProjectPermission();
  const canAttachHsm = permission.can(
    ProjectPermissionHsmConnectorActions.Attach,
    ProjectPermissionSub.HsmConnectors
  );

  const keySource = form.watch("keySource");
  const isHsm = keySource === CertKeySource.Hsm;

  return (
    <FieldGroup>
      <Controller
        name="caId"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Certificate Authority <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect<CaOption>
                isLoading={isCasLoading}
                options={caOptions}
                value={caOptions.find((o) => o.id === field.value) ?? null}
                onChange={(selected) => {
                  const opt = selected as CaOption | null;
                  field.onChange(opt?.id ?? "");
                }}
                getOptionLabel={(opt) => opt.name}
                getOptionValue={(opt) => opt.id}
                groupBy={caOptions.length > 0 ? "groupType" : undefined}
                getGroupHeaderLabel={
                  caOptions.length > 0
                    ? (groupType: CaGroup) =>
                        groupType === "internal" ? "Internal CAs" : "External CAs"
                    : undefined
                }
                placeholder="Select a Certificate Authority..."
                noOptionsMessage={() => "No active CAs available."}
                isError={Boolean(error)}
              />
              <FieldDescription>
                Changing the CA reissues the certificate immediately.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {canEditSubject ? (
        <Controller
          name="commonName"
          control={form.control}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Common Name <span className="text-danger">*</span>
              </FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Acme Mobile, Inc."
                  isError={Boolean(error)}
                />
                <FieldDescription>
                  The legal name shown on the certificate. Editable while no certificate has been
                  issued. Locked once the signer becomes Active.
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      ) : (
        <Field>
          <FieldLabel>Common Name</FieldLabel>
          <FieldContent>
            <Input value={commonName} readOnly disabled />
            <FieldDescription>The legal name shown on the certificate.</FieldDescription>
          </FieldContent>
        </Field>
      )}

      {canEditSubject ? (
        <Controller
          name="certificateTtlDays"
          control={form.control}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Validity (days) <span className="text-danger">*</span>
              </FieldLabel>
              <FieldContent>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  placeholder="365"
                  isError={Boolean(error)}
                />
                <FieldDescription>
                  How long each issued certificate stays valid. Locked once the signer becomes
                  Active.
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      ) : (
        <Field>
          <FieldLabel>Validity (days)</FieldLabel>
          <FieldContent>
            <Input
              value={certificateTtlDays != null ? String(certificateTtlDays) : "—"}
              readOnly
              disabled
            />
            <FieldDescription>How long each issued certificate stays valid.</FieldDescription>
          </FieldContent>
        </Field>
      )}

      <Controller
        name="keySource"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>Key source</FieldLabel>
            <FieldContent>
              <Select value={field.value} onValueChange={field.onChange}>
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
                Switching key source reissues the certificate with a new key.
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="keyAlgorithm"
        control={form.control}
        render={({ field, fieldState: { error } }) => {
          const options = isHsm
            ? Object.values(SignerKeyAlgorithm).filter((v) =>
                HSM_SUPPORTED_KEY_ALGORITHMS.includes(v)
              )
            : Object.values(SignerKeyAlgorithm);
          return (
            <Field>
              <FieldLabel>Key algorithm</FieldLabel>
              <FieldContent>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!keySourceChanged}
                >
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
                  {keySourceChanged
                    ? "Pick the algorithm for the new key."
                    : "Algorithm of the signer's current key. Switch key source to generate a new one."}
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          );
        }}
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
                  getOptionLabel={(opt) => `${opt.name} (slot ${opt.slotLabel})`}
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
                  The HSM on which Infisical will generate the signing key.
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}

      <Controller
        name="certificateRenewBeforeDays"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Renew before (days)</FieldLabel>
            <FieldContent>
              <Input
                type="number"
                min={1}
                max={30}
                value={field.value ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  field.onChange(raw === "" ? null : Number(raw));
                }}
                placeholder="Leave empty to disable auto-renewal"
                isError={Boolean(error)}
              />
              <FieldDescription>
                Renew the certificate this many days before it expires.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      {(caSwap || keySourceChanged) && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Saving will issue a new certificate right away.
        </div>
      )}
    </FieldGroup>
  );
};
