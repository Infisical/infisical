import { Controller, useForm } from "react-hook-form";
import { Link, useParams } from "@tanstack/react-router";

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
import { ROUTE_PATHS } from "@app/const/routes";
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
  hsmConnectorOptions: HsmConnectorOption[];
  isHsmConnectorsLoading: boolean;
};

export const CertificateStep = ({
  form,
  caOptions,
  isCasLoading,
  hsmConnectorOptions,
  isHsmConnectorsLoading
}: CertificateStepProps) => {
  const { orgId, projectId } = useParams({ strict: false }) as {
    orgId?: string;
    projectId?: string;
  };

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
                The CA that will issue the certificate.
                {!isCasLoading && caOptions.length === 0 && orgId && projectId && (
                  <>
                    {" "}
                    <Link
                      to={ROUTE_PATHS.CertManager.CertificateAuthoritiesPage.path}
                      params={{ orgId, projectId }}
                      className="text-primary underline hover:text-primary/80"
                    >
                      Create one in the Certificate Authorities page.
                    </Link>
                  </>
                )}
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="commonName"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Common Name <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="Acme Mobile, Inc." isError={Boolean(error)} />
              <FieldDescription>The legal name shown on the certificate.</FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="keySource"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>
              Key source <span className="text-danger">*</span>
            </FieldLabel>
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
                {field.value === CertKeySource.Hsm
                  ? "The keypair is generated on a Hardware Security Module and every signature is performed there."
                  : "Infisical generates and manages the keypair for you."}
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
                  Algorithm used to generate the signing key. RSA is widely compatible, ECDSA
                  produces smaller signatures and is faster.
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
                onChange={(e) => {
                  const val = e.target.value;
                  field.onChange(val === "" ? "" : Number(val));
                }}
                placeholder="365"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
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
    </FieldGroup>
  );
};
