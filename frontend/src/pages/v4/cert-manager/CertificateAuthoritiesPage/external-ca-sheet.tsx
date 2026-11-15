import { useId, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Heading } from "@infisical/cipher/ui/text";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { ExternalCertificateAuthoritiesUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  ACME_DNS_PROVIDER_APP_CONNECTION_MAP,
  ACME_DNS_PROVIDER_NAME_MAP
} from "@app/hooks/api/ca/constants";
import { AcmeDnsProvider, CaStatus, CaType, GoDaddyProductType } from "@app/hooks/api/ca/enums";
import {
  DigiCertCaPurpose,
  type TCreateCertificateAuthorityDTO,
  type TUnifiedCertificateAuthority,
  type TUpdateCertificateAuthorityDTO
} from "@app/hooks/api/ca/types";
import { slugSchema } from "@app/lib/schemas";

import { failed, saved } from "../../access/toast";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license/useUpgradeGate";
import { ConnectionField } from "./install/forms";

const UNCHANGED_CREDENTIAL = "__INFISICAL_UNCHANGED__";

const typedOver = (previous: string, next: string) => {
  let start = 0;
  while (start < next.length && start < previous.length && next[start] === previous[start])
    start += 1;
  let end = 0;
  while (
    end < next.length - start &&
    end < previous.length - start &&
    next[next.length - 1 - end] === previous[previous.length - 1 - end]
  )
    end += 1;
  return next.slice(start, next.length - end);
};

const REQUIRED_EAB_DIRECTORIES = [
  "https://acme.digicert.com/v2/acme/directory",
  "https://acme.zerossl.com/v2/DV90",
  "https://acme.ssl.com/sslcom-dv-rsa",
  "https://acme.ssl.com/sslcom-dv-ecc",
  "https://dv.acme-v02.api.pki.goog/directory",
  "https://acme.sectigo.com/v2/OV",
  "https://acme.sectigo.com/v2/EV",
  "https://acme.cisco.com/ACMEv2/directory"
];

type ExternalCaType = Exclude<CaType, CaType.INTERNAL>;

const PROVIDERS: {
  type: ExternalCaType;
  name: string;
  description: string;
  image?: string;
}[] = [
  {
    type: CaType.ACME,
    name: "ACME",
    description: "Any ACME directory, such as Let's Encrypt or ZeroSSL."
  },
  {
    type: CaType.ADCS,
    name: "Microsoft ADCS",
    description: "Active Directory Certificate Services over the Gateway.",
    image: "Windows.png"
  },
  {
    type: CaType.AZURE_AD_CS,
    name: "Azure ADCS (Web Enrollment)",
    description: "ADCS Web Enrollment over HTTPS.",
    image: "Microsoft Azure.png"
  },
  {
    type: CaType.AWS_PCA,
    name: "AWS Private CA",
    description: "AWS Private Certificate Authority.",
    image: "Amazon Web Services.png"
  },
  {
    type: CaType.AWS_ACM_PUBLIC_CA,
    name: "AWS ACM Public CA",
    description: "Publicly trusted certificates through AWS Certificate Manager.",
    image: "Amazon Web Services.png"
  },
  {
    type: CaType.DIGICERT,
    name: "DigiCert CertCentral",
    description: "Orders placed through the CertCentral API.",
    image: "DigiCert.png"
  },
  {
    type: CaType.VENAFI_TPP,
    name: "Venafi TPP",
    description: "Venafi Trust Protection Platform.",
    image: "Venafi.png"
  },
  {
    type: CaType.GODADDY,
    name: "GoDaddy",
    description: "Domain validated SSL orders.",
    image: "GoDaddy.png"
  }
];

const PROVIDER_CONNECTION: Record<Exclude<ExternalCaType, CaType.ACME>, AppConnection> = {
  [CaType.ADCS]: AppConnection.ADCS,
  [CaType.AZURE_AD_CS]: AppConnection.AzureADCS,
  [CaType.AWS_PCA]: AppConnection.AWS,
  [CaType.AWS_ACM_PUBLIC_CA]: AppConnection.AWS,
  [CaType.DIGICERT]: AppConnection.DigiCert,
  [CaType.VENAFI_TPP]: AppConnection.VenafiTpp,
  [CaType.GODADDY]: AppConnection.GoDaddy
};

const CONNECTION_DESCRIPTIONS: Partial<Record<ExternalCaType, string>> = {
  [CaType.ADCS]: "Holds the Windows domain credentials and Gateway used to reach the AD CS server.",
  [CaType.AWS_PCA]: "Used to communicate with AWS Private Certificate Authority.",
  [CaType.AWS_ACM_PUBLIC_CA]: "Used to issue, export, renew and revoke certificates through ACM.",
  [CaType.DIGICERT]: "Provides the CertCentral API key used to place orders.",
  [CaType.VENAFI_TPP]: "Holds the credentials for your Venafi Trust Protection Platform instance.",
  [CaType.GODADDY]: "Provides the API key and secret used to place certificate orders."
};

const CONTACT_FIELDS = [
  { key: "firstName", label: "First name", placeholder: "John", max: 128 },
  { key: "lastName", label: "Last name", placeholder: "Doe", max: 128 },
  { key: "email", label: "Email", placeholder: "john.doe@example.com", max: 255 },
  { key: "jobTitle", label: "Job title", placeholder: "Security Engineer", max: 64 },
  { key: "telephone", label: "Telephone", placeholder: "+15551234567", max: 32 }
] as const;

type ContactKey = (typeof CONTACT_FIELDS)[number]["key"];

const blank = (type: ExternalCaType) => ({
  type,
  name: "",
  status: CaStatus.ACTIVE,
  connectionId: "",
  dnsProvider: AcmeDnsProvider.ROUTE53,
  hostedZoneId: "",
  gcpProjectId: "",
  directoryUrl: "",
  accountEmail: "",
  eabKid: "",
  eabHmacKey: "",
  dnsResolver: "",
  caName: "",
  certificateAuthorityArn: "",
  region: "",
  dnsConnectionId: "",
  organizationId: "",
  productNameId: "",
  purpose: DigiCertCaPurpose.Ssl,
  contact: { firstName: "", lastName: "", email: "", jobTitle: "", telephone: "" } as Record<
    ContactKey,
    string
  >,
  policyDN: "",
  productType: GoDaddyProductType.DV_SSL
});

type Draft = ReturnType<typeof blank>;
type Errors = Partial<Record<string, string>>;

const fromCa = (ca: TUnifiedCertificateAuthority): Draft | undefined => {
  if (ca.type === CaType.INTERNAL) return undefined;
  const base = { ...blank(ca.type), name: ca.name, status: ca.status };
  switch (ca.type) {
    case CaType.ACME:
      return {
        ...base,
        connectionId: ca.configuration.dnsAppConnectionId,
        dnsProvider: ca.configuration.dnsProviderConfig.provider,
        hostedZoneId: ca.configuration.dnsProviderConfig.hostedZoneId,
        gcpProjectId: ca.configuration.dnsProviderConfig.hostedZoneId.split("/")[1] ?? "",
        directoryUrl: ca.configuration.directoryUrl,
        accountEmail: ca.configuration.accountEmail,
        eabKid: ca.configuration.eabKid ?? "",
        eabHmacKey: UNCHANGED_CREDENTIAL,
        dnsResolver: ca.configuration.dnsResolver ?? ""
      };
    case CaType.AZURE_AD_CS:
      return { ...base, connectionId: ca.configuration.azureAdcsConnectionId };
    case CaType.ADCS:
      return {
        ...base,
        connectionId: ca.configuration.appConnectionId,
        caName: ca.configuration.caName ?? ""
      };
    case CaType.AWS_PCA:
      return {
        ...base,
        connectionId: ca.configuration.appConnectionId,
        certificateAuthorityArn: ca.configuration.certificateAuthorityArn,
        region: ca.configuration.region
      };
    case CaType.DIGICERT:
      return {
        ...base,
        connectionId: ca.configuration.appConnectionId,
        organizationId: String(ca.configuration.organizationId),
        productNameId: ca.configuration.productNameId,
        purpose: ca.configuration.purpose ?? DigiCertCaPurpose.Ssl,
        contact: { ...base.contact, ...ca.configuration.verifiedContact }
      };
    case CaType.AWS_ACM_PUBLIC_CA:
      return {
        ...base,
        connectionId: ca.configuration.appConnectionId,
        dnsConnectionId: ca.configuration.dnsAppConnectionId ?? "",
        hostedZoneId: ca.configuration.hostedZoneId ?? "",
        region: ca.configuration.region
      };
    case CaType.VENAFI_TPP:
      return {
        ...base,
        connectionId: ca.configuration.appConnectionId,
        policyDN: ca.configuration.policyDN
      };
    case CaType.GODADDY:
      return {
        ...base,
        connectionId: ca.configuration.appConnectionId,
        productType: ca.configuration.productType
      };
    default:
      return undefined;
  }
};

const trimmedOrUndefined = (value: string) => value.trim() || undefined;

const toConfiguration = (draft: Draft, csRequiresContact: boolean) => {
  switch (draft.type) {
    case CaType.ACME:
      return {
        dnsProviderConfig: { provider: draft.dnsProvider, hostedZoneId: draft.hostedZoneId.trim() },
        directoryUrl: draft.directoryUrl.trim(),
        accountEmail: draft.accountEmail.trim(),
        dnsAppConnectionId: draft.connectionId,
        eabKid: draft.eabKid,
        eabHmacKey: draft.eabHmacKey,
        dnsResolver: draft.dnsResolver || undefined
      };
    case CaType.AZURE_AD_CS:
      return { azureAdcsConnectionId: draft.connectionId };
    case CaType.ADCS:
      return {
        appConnectionId: draft.connectionId,
        ...(draft.caName.trim() && { caName: draft.caName.trim() })
      };
    case CaType.AWS_PCA:
      return {
        appConnectionId: draft.connectionId,
        certificateAuthorityArn: draft.certificateAuthorityArn.trim(),
        region: draft.region
      };
    case CaType.DIGICERT:
      return {
        appConnectionId: draft.connectionId,
        organizationId: Number(draft.organizationId),
        productNameId: draft.productNameId,
        purpose: draft.purpose,
        ...(draft.purpose === DigiCertCaPurpose.CodeSigning &&
          csRequiresContact && {
            verifiedContact: Object.fromEntries(
              CONTACT_FIELDS.map(({ key }) => [key, trimmedOrUndefined(draft.contact[key])])
            )
          })
      };
    case CaType.AWS_ACM_PUBLIC_CA:
      return {
        appConnectionId: draft.connectionId,
        dnsAppConnectionId: draft.dnsConnectionId,
        hostedZoneId: draft.hostedZoneId.trim(),
        region: draft.region
      };
    case CaType.VENAFI_TPP:
      return { appConnectionId: draft.connectionId, policyDN: draft.policyDN.trim() };
    default:
      return { appConnectionId: draft.connectionId, productType: draft.productType };
  }
};

const issue = (schema: z.ZodTypeAny, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
};

const required = (value: string, message: string) => (value.trim() ? undefined : message);

const validate = (draft: Draft, editing: boolean, csRequiresContact: boolean): Errors => {
  const errors: Errors = {
    name: editing ? undefined : issue(slugSchema({ field: "Name" }), draft.name)
  };
  switch (draft.type) {
    case CaType.ACME:
      return {
        ...errors,
        connectionId: required(draft.connectionId, "Pick a DNS connection"),
        gcpProjectId:
          draft.dnsProvider === AcmeDnsProvider.GcpCloudDns
            ? required(draft.gcpProjectId, "Pick a GCP project")
            : undefined,
        hostedZoneId: required(draft.hostedZoneId, "Enter the hosted zone"),
        directoryUrl:
          required(draft.directoryUrl, "Enter the directory URL") ??
          issue(z.string().url("Must be a valid URL"), draft.directoryUrl.trim()),
        accountEmail:
          required(draft.accountEmail, "Enter the account email") ??
          issue(z.string().email("Must be a valid email address"), draft.accountEmail.trim()),
        eabKid:
          REQUIRED_EAB_DIRECTORIES.includes(draft.directoryUrl) && !draft.eabKid.trim()
            ? "This directory requires an EAB key identifier"
            : undefined,
        dnsResolver: draft.dnsResolver
          ? issue(z.string().ip({ message: "Must be a valid IP address" }), draft.dnsResolver)
          : undefined
      };
    case CaType.AWS_PCA:
      return {
        ...errors,
        connectionId: required(draft.connectionId, "Pick an AWS connection"),
        certificateAuthorityArn: required(draft.certificateAuthorityArn, "Enter the CA ARN"),
        region: required(draft.region, "Pick a region")
      };
    case CaType.AWS_ACM_PUBLIC_CA:
      return {
        ...errors,
        connectionId: required(draft.connectionId, "Pick an AWS connection"),
        dnsConnectionId: required(draft.dnsConnectionId, "Pick a Route 53 connection"),
        hostedZoneId: required(draft.hostedZoneId, "Enter the hosted zone ID"),
        region: required(draft.region, "Pick a region")
      };
    case CaType.DIGICERT: {
      const contactErrors =
        draft.purpose === DigiCertCaPurpose.CodeSigning && csRequiresContact
          ? Object.fromEntries(
              CONTACT_FIELDS.map(({ key, label, max }) => {
                const value = draft.contact[key].trim();
                if (!value) return [`contact.${key}`, `${label} is required for code signing CAs`];
                if (value.length > max) return [`contact.${key}`, `Up to ${max} characters`];
                if (key === "email" && !z.string().email().safeParse(value).success)
                  return [`contact.${key}`, "Email must be valid"];
                return [`contact.${key}`, undefined];
              })
            )
          : {};
      return {
        ...errors,
        ...contactErrors,
        connectionId: required(draft.connectionId, "Pick a DigiCert connection"),
        organizationId: required(draft.organizationId, "Pick an organization"),
        productNameId: required(draft.productNameId, "Pick a product")
      };
    }
    case CaType.VENAFI_TPP:
      return {
        ...errors,
        connectionId: required(draft.connectionId, "Pick a Venafi TPP connection"),
        policyDN: required(draft.policyDN, "Enter the policy DN")
      };
    default:
      return { ...errors, connectionId: required(draft.connectionId, "Pick a connection") };
  }
};

const suggestName = (draft: Draft) => {
  const typeName = PROVIDERS.find((entry) => entry.type === draft.type)?.name ?? "";
  let issuer = "";
  if (draft.type === CaType.ACME) {
    try {
      const { hostname } = new URL(draft.directoryUrl);
      if (/[a-z]/i.test(hostname) && !hostname.includes(":")) {
        const labels = hostname.split(".");
        if (labels.length > 1) labels.pop();
        if (labels.length > 1 && /^(ac|co|com|edu|gov|net|org)$/.test(labels[labels.length - 1]))
          labels.pop();
        issuer = labels[labels.length - 1];
      }
    } catch {
      issuer = "";
    }
  }
  if (draft.type === CaType.ADCS) issuer = draft.caName;
  if (draft.type === CaType.VENAFI_TPP)
    issuer = draft.policyDN.split("\\").filter(Boolean).pop() ?? "";
  return slugify(`${typeName} ${issuer}`, { lowercase: true, decamelize: false })
    .slice(0, 64)
    .replace(/-+$/, "");
};

type FieldsProps = {
  draft: Draft;
  errors: Errors;
  projectId: string;
  editing: boolean;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  patch: (next: Partial<Draft>) => void;
};

const ZoneCombobox = ({
  provider,
  connectionId,
  value,
  error,
  onChange
}: {
  provider: AcmeDnsProvider;
  connectionId: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const enabledFor = (target: AcmeDnsProvider) => ({
    enabled: provider === target && Boolean(connectionId)
  });
  const cloudflare = adapter.useCloudflareZones(
    connectionId,
    enabledFor(AcmeDnsProvider.Cloudflare)
  );
  const dnsMadeEasy = adapter.useDnsMadeEasyZones(
    connectionId,
    enabledFor(AcmeDnsProvider.DNSMadeEasy)
  );
  const azure = adapter.useAzureDnsZones(connectionId, enabledFor(AcmeDnsProvider.AzureDNS));
  const powerDns = adapter.usePowerDnsZones(connectionId, enabledFor(AcmeDnsProvider.PowerDns));
  const ultraDns = adapter.useUltraDnsZones(connectionId, enabledFor(AcmeDnsProvider.UltraDNS));
  const result = {
    [AcmeDnsProvider.Cloudflare]: cloudflare,
    [AcmeDnsProvider.DNSMadeEasy]: dnsMadeEasy,
    [AcmeDnsProvider.AzureDNS]: azure,
    [AcmeDnsProvider.PowerDns]: powerDns,
    [AcmeDnsProvider.UltraDNS]: ultraDns
  }[provider as AcmeDnsProvider.Cloudflare];
  const zones: { id: string; name: string }[] = result?.data ?? [];
  const options = zones.map((zone) => ({ value: zone.id, label: zone.name.replace(/\.$/, "") }));
  if (value && !zones.some((zone) => zone.id === value)) options.push({ value, label: value });
  return (
    <Field
      label="Zone"
      description="Where Infisical creates the challenge TXT records. It must contain the domains you request certificates for."
      error={error}
      wide
    >
      <Combobox
        label="Zone"
        value={value}
        disabled={!connectionId}
        loading={Boolean(connectionId) && result?.isPending}
        invalid={Boolean(error)}
        placeholder={connectionId ? "Select a zone" : "Pick a DNS connection first"}
        emptyText="No zones found for this connection."
        options={options}
        onValueChange={onChange}
      />
    </Field>
  );
};

const GcpZoneFields = ({
  connectionId,
  projectValue,
  zoneValue,
  errors,
  onProjectChange,
  onZoneChange
}: {
  connectionId: string;
  projectValue: string;
  zoneValue: string;
  errors: Errors;
  onProjectChange: (value: string) => void;
  onZoneChange: (value: string) => void;
}) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const projects = adapter.useGcpCloudDnsProjects(connectionId, { enabled: Boolean(connectionId) });
  const zones = adapter.useGcpCloudDnsZones(
    { connectionId, gcpProjectId: projectValue },
    { enabled: Boolean(connectionId) && Boolean(projectValue) }
  );
  const projectOptions = (projects.data ?? []).map((project) => ({
    value: project.id,
    label: project.name === project.id ? project.id : project.name,
    meta: project.name === project.id ? undefined : project.id
  }));
  if (projectValue && !projectOptions.some((option) => option.value === projectValue))
    projectOptions.push({ value: projectValue, label: projectValue, meta: undefined });
  const zoneOptions = (zones.data ?? []).map((zone) => ({
    value: zone.id,
    label: zone.dnsName || zone.name,
    meta: zone.dnsName ? zone.name : undefined
  }));
  if (zoneValue && !zoneOptions.some((option) => option.value === zoneValue))
    zoneOptions.push({
      value: zoneValue,
      label: zoneValue.split("/").pop() ?? zoneValue,
      meta: undefined
    });
  const listFailure = (error: unknown, fallback: string) => (error ? fallback : undefined);
  return (
    <>
      <Field
        label="GCP project"
        description="Only projects the service account can see with the Cloud DNS API enabled are listed."
        error={
          listFailure(projects.error, "Could not list GCP projects for this connection.") ??
          errors.gcpProjectId
        }
        wide
      >
        <Combobox
          label="GCP project"
          value={projectValue}
          disabled={!connectionId}
          loading={Boolean(connectionId) && projects.isPending}
          placeholder={connectionId ? "Select a project" : "Pick a DNS connection first"}
          emptyText="No projects found. Grant the service account the DNS Administrator and Service Usage Viewer roles and enable the Cloud DNS API."
          options={projectOptions}
          onValueChange={onProjectChange}
        />
      </Field>
      <Field
        label="Zone"
        description="The public Cloud DNS zone where Infisical creates the challenge TXT records."
        error={
          listFailure(zones.error, "Could not list Cloud DNS zones for this project.") ??
          errors.hostedZoneId
        }
        wide
      >
        <Combobox
          label="Zone"
          value={zoneValue}
          disabled={!projectValue}
          loading={Boolean(projectValue) && zones.isPending}
          placeholder={projectValue ? "Select a zone" : "Pick a project first"}
          emptyText="No public managed zones found in this project."
          options={zoneOptions}
          onValueChange={onZoneChange}
        />
      </Field>
    </>
  );
};

const AcmeFields = ({ draft, errors, projectId, editing, set, patch }: FieldsProps) => (
  <>
    <Field label="DNS provider" wide>
      <Select
        aria-label="DNS provider"
        value={draft.dnsProvider}
        disabled={editing}
        options={Object.values(AcmeDnsProvider).map((provider) => ({
          value: provider,
          label: ACME_DNS_PROVIDER_NAME_MAP[provider]
        }))}
        onValueChange={(next) =>
          patch({
            dnsProvider: next as AcmeDnsProvider,
            connectionId: "",
            hostedZoneId: "",
            gcpProjectId: ""
          })
        }
      />
    </Field>
    <ConnectionField
      key={draft.dnsProvider}
      app={ACME_DNS_PROVIDER_APP_CONNECTION_MAP[draft.dnsProvider]}
      projectId={projectId}
      label="DNS connection"
      value={draft.connectionId}
      error={errors.connectionId}
      onChange={(id) => patch({ connectionId: id, hostedZoneId: "", gcpProjectId: "" })}
    />
    {draft.dnsProvider === AcmeDnsProvider.ROUTE53 && (
      <Field label="Hosted zone ID" error={errors.hostedZoneId} wide>
        <Input
          value={draft.hostedZoneId}
          mono
          placeholder="Z040441124N1GOOMCQYX1"
          invalid={Boolean(errors.hostedZoneId)}
          onChange={(event) => set("hostedZoneId", event.target.value)}
        />
      </Field>
    )}
    {draft.dnsProvider === AcmeDnsProvider.GcpCloudDns && (
      <GcpZoneFields
        connectionId={draft.connectionId}
        projectValue={draft.gcpProjectId}
        zoneValue={draft.hostedZoneId}
        errors={errors}
        onProjectChange={(value) => patch({ gcpProjectId: value, hostedZoneId: "" })}
        onZoneChange={(value) => set("hostedZoneId", value)}
      />
    )}
    {draft.dnsProvider !== AcmeDnsProvider.ROUTE53 &&
      draft.dnsProvider !== AcmeDnsProvider.GcpCloudDns && (
        <ZoneCombobox
          provider={draft.dnsProvider}
          connectionId={draft.connectionId}
          value={draft.hostedZoneId}
          error={errors.hostedZoneId}
          onChange={(value) => set("hostedZoneId", value)}
        />
      )}
    <Field
      label="Directory URL"
      description="The ACME directory of the CA that issues your certificates."
      error={errors.directoryUrl}
      wide
    >
      <Input
        value={draft.directoryUrl}
        mono
        placeholder="https://acme-v02.api.letsencrypt.org/directory"
        invalid={Boolean(errors.directoryUrl)}
        onChange={(event) => set("directoryUrl", event.target.value)}
      />
    </Field>
    {draft.directoryUrl.startsWith("http://") && (
      <Alert tone="warn">
        This directory is served over plain HTTP, so account credentials and EAB keys are sent
        unencrypted. Use HTTPS unless this is a local test directory.
      </Alert>
    )}
    <Field
      label="Account email"
      description="Registered with the CA for expiry and account notices."
      error={errors.accountEmail}
      wide
    >
      <Input
        type="email"
        value={draft.accountEmail}
        placeholder="user@infisical.com"
        invalid={Boolean(errors.accountEmail)}
        onChange={(event) => set("accountEmail", event.target.value)}
      />
    </Field>
    <Field
      label="EAB key identifier (KID)"
      optional={!REQUIRED_EAB_DIRECTORIES.includes(draft.directoryUrl)}
      description="Ties this ACME account to your existing account with the CA. Required by CAs such as DigiCert, ZeroSSL and Google Trust Services."
      error={errors.eabKid}
      wide
    >
      <Input
        value={draft.eabKid}
        mono
        autoComplete="off"
        invalid={Boolean(errors.eabKid)}
        onChange={(event) => set("eabKid", event.target.value)}
      />
    </Field>
    <Field
      label="EAB HMAC key"
      optional
      description="The base64 HMAC key issued with the key identifier. Provide both or neither."
      wide
    >
      <Input
        type="password"
        value={draft.eabHmacKey}
        mono
        autoComplete="new-password"
        onChange={(event) =>
          set(
            "eabHmacKey",
            draft.eabHmacKey === UNCHANGED_CREDENTIAL
              ? typedOver(UNCHANGED_CREDENTIAL, event.target.value)
              : event.target.value
          )
        }
      />
    </Field>
    <Field
      label="DNS resolver"
      optional
      description="A custom resolver IP used to check DNS propagation during challenges. Leave empty to use the system default."
      error={errors.dnsResolver}
      wide
    >
      <Input
        width="md"
        value={draft.dnsResolver}
        mono
        placeholder="8.8.8.8"
        invalid={Boolean(errors.dnsResolver)}
        onChange={(event) => set("dnsResolver", event.target.value)}
      />
    </Field>
  </>
);

const RegionField = ({
  value,
  error,
  onChange
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) => (
  <Field label="Region" error={error} wide>
    <Combobox
      label="Region"
      value={value}
      invalid={Boolean(error)}
      placeholder="Select a region"
      options={AWS_REGIONS.map((region) => ({
        value: region.slug,
        label: region.name,
        meta: region.slug
      }))}
      onValueChange={onChange}
    />
  </Field>
);

const DigiCertFields = ({ draft, errors, projectId, set, patch }: FieldsProps) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const connected = { enabled: Boolean(draft.connectionId) };
  const organizations = adapter.useDigiCertOrganizations(draft.connectionId, connected);
  const products = adapter.useDigiCertProducts(draft.connectionId, connected);
  const matching = (products.data ?? []).filter((product) =>
    draft.purpose === DigiCertCaPurpose.CodeSigning
      ? product.type === "code_signing_certificate"
      : product.type === "ssl_certificate" || !product.type
  );
  return (
    <>
      <ConnectionField
        app={AppConnection.DigiCert}
        projectId={projectId}
        label="DigiCert connection"
        description={CONNECTION_DESCRIPTIONS[CaType.DIGICERT]}
        value={draft.connectionId}
        error={errors.connectionId}
        onChange={(id) => patch({ connectionId: id, organizationId: "", productNameId: "" })}
      />
      <Field
        label="Organization"
        description="The validated CertCentral organization shown on issued certificates."
        error={errors.organizationId}
        wide
      >
        <Combobox
          label="Organization"
          value={draft.organizationId}
          disabled={!draft.connectionId}
          loading={Boolean(draft.connectionId) && organizations.isPending}
          invalid={Boolean(errors.organizationId)}
          placeholder={draft.connectionId ? "Select an organization" : "Pick a connection first"}
          options={(organizations.data ?? []).map((organization) => ({
            value: String(organization.id),
            label: organization.displayName || organization.name
          }))}
          onValueChange={(next) => set("organizationId", next)}
        />
      </Field>
      <Field label="Purpose" wide>
        <Select
          aria-label="Purpose"
          value={draft.purpose}
          options={[
            { value: DigiCertCaPurpose.Ssl, label: "SSL / TLS" },
            { value: DigiCertCaPurpose.CodeSigning, label: "Code signing" }
          ]}
          onValueChange={(next) => patch({ purpose: next as DigiCertCaPurpose, productNameId: "" })}
        />
      </Field>
      <Field
        label="Product"
        description="Your CertCentral entitlements. Each CA issues under exactly one product."
        error={errors.productNameId}
        wide
      >
        <Combobox
          label="Product"
          value={draft.productNameId}
          disabled={!draft.connectionId}
          loading={Boolean(draft.connectionId) && products.isPending}
          invalid={Boolean(errors.productNameId)}
          placeholder={draft.connectionId ? "Select a product" : "Pick a connection first"}
          options={matching.map((product) => ({
            value: product.nameId,
            label: product.name,
            meta: product.nameId
          }))}
          onValueChange={(next) => set("productNameId", next)}
        />
      </Field>
    </>
  );
};

const DigiCertContactFields = ({ draft, errors, patch }: FieldsProps) => (
  <Stack gap={16}>
    <Alert tone="info" title="Verified contact required">
      This organization hasn&apos;t completed DigiCert code signing validation, so DigiCert emails
      this person an approval link that starts organization validation.
    </Alert>
    {CONTACT_FIELDS.map(({ key, label, placeholder }) => (
      <Field key={key} label={label} error={errors[`contact.${key}`]} wide>
        <Input
          value={draft.contact[key]}
          type={key === "email" ? "email" : "text"}
          placeholder={placeholder}
          invalid={Boolean(errors[`contact.${key}`])}
          onChange={(event) => patch({ contact: { ...draft.contact, [key]: event.target.value } })}
        />
      </Field>
    ))}
  </Stack>
);

const ProviderFields = (props: FieldsProps & { csRequiresContact: boolean }) => {
  const { draft, errors, projectId, set } = props;
  const connection =
    draft.type === CaType.ACME || draft.type === CaType.DIGICERT ? undefined : (
      <ConnectionField
        app={PROVIDER_CONNECTION[draft.type]}
        projectId={projectId}
        label={
          draft.type === CaType.AWS_ACM_PUBLIC_CA || draft.type === CaType.AWS_PCA
            ? "AWS connection"
            : `${PROVIDERS.find((entry) => entry.type === draft.type)?.name} connection`
        }
        description={CONNECTION_DESCRIPTIONS[draft.type]}
        value={draft.connectionId}
        error={errors.connectionId}
        onChange={(id) => set("connectionId", id)}
      />
    );
  switch (draft.type) {
    case CaType.ACME:
      return <AcmeFields {...props} />;
    case CaType.DIGICERT:
      return (
        <>
          <DigiCertFields {...props} />
          {props.csRequiresContact && <DigiCertContactFields {...props} />}
        </>
      );
    case CaType.ADCS:
      return (
        <>
          {connection}
          <Field
            label="CA name"
            optional
            description="The AD CS CA common name. Leave blank only if the Gateway can reach the CA host over SMB (TCP 445) to discover it. Run certutil -dump on the AD CS server to find it."
            wide
          >
            <Input
              value={draft.caName}
              placeholder="corp-DC01-CA"
              onChange={(event) => set("caName", event.target.value)}
            />
          </Field>
        </>
      );
    case CaType.AWS_PCA:
      return (
        <>
          {connection}
          <Field label="Certificate authority ARN" error={errors.certificateAuthorityArn} wide>
            <Input
              value={draft.certificateAuthorityArn}
              mono
              placeholder="arn:aws:acm-pca:us-east-1:123456789012:certificate-authority/abc-123"
              invalid={Boolean(errors.certificateAuthorityArn)}
              onChange={(event) => set("certificateAuthorityArn", event.target.value)}
            />
          </Field>
          <RegionField
            value={draft.region}
            error={errors.region}
            onChange={(value) => set("region", value)}
          />
        </>
      );
    case CaType.AWS_ACM_PUBLIC_CA:
      return (
        <>
          {connection}
          <ConnectionField
            app={AppConnection.AWS}
            projectId={projectId}
            label="Route 53 connection"
            description="Writes the ACM CNAME validation records into Route 53."
            value={draft.dnsConnectionId}
            error={errors.dnsConnectionId}
            onChange={(id) => set("dnsConnectionId", id)}
          />
          <Field
            label="Hosted zone ID"
            description="The Route 53 hosted zone that owns the domains you issue certificates for."
            error={errors.hostedZoneId}
            wide
          >
            <Input
              value={draft.hostedZoneId}
              mono
              placeholder="Z040441124N1GOOMCQYX1"
              invalid={Boolean(errors.hostedZoneId)}
              onChange={(event) => set("hostedZoneId", event.target.value)}
            />
          </Field>
          <RegionField
            value={draft.region}
            error={errors.region}
            onChange={(value) => set("region", value)}
          />
        </>
      );
    case CaType.VENAFI_TPP:
      return (
        <>
          {connection}
          <Field
            label="Policy DN"
            description="The policy folder in Venafi TPP where certificates are managed."
            error={errors.policyDN}
            wide
          >
            <Input
              value={draft.policyDN}
              mono
              placeholder="\\VED\\Policy\\Certificates"
              invalid={Boolean(errors.policyDN)}
              onChange={(event) => set("policyDN", event.target.value)}
            />
          </Field>
        </>
      );
    case CaType.GODADDY:
      return (
        <>
          {connection}
          <Field label="Product type" wide>
            <Select
              aria-label="Product type"
              value={draft.productType}
              options={[{ value: GoDaddyProductType.DV_SSL, label: "DV SSL" }]}
              onValueChange={(next) => set("productType", next as GoDaddyProductType)}
            />
          </Field>
        </>
      );
    default:
      return connection ?? null;
  }
};

const useCodeSigningValidation = (draft?: Draft) => {
  const checkable =
    draft?.type === CaType.DIGICERT &&
    draft.purpose === DigiCertCaPurpose.CodeSigning &&
    Boolean(draft.connectionId && draft.organizationId && draft.productNameId);
  const { data, isPending } = useV4Adapter("certificateAuthorities").useDigiCertOrgValidation(
    draft?.connectionId ?? "",
    Number(draft?.organizationId ?? 0),
    draft?.productNameId ?? "",
    { enabled: checkable }
  );
  return {
    requiresContact: checkable && data?.isValidated === false,
    checking: checkable && !data && isPending
  };
};

const ProviderPicker = ({
  locked,
  onPick
}: {
  locked: (type: CaType) => boolean;
  onPick: (type: ExternalCaType) => void;
}) => {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const matches = PROVIDERS.filter(
    (entry) =>
      !query ||
      entry.name.toLowerCase().includes(query) ||
      entry.description.toLowerCase().includes(query)
  );
  return (
    <Stack gap={16}>
      <Input
        icon="search"
        aria-label="Search providers"
        placeholder="Search certificate authorities"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <RadioGroup
        aria-label="Certificate authority provider"
        value=""
        onValueChange={(next) => onPick(next as ExternalCaType)}
      >
        {matches.map((entry) => (
          <RadioGroupCard
            key={entry.type}
            value={entry.type}
            media={entry.image ? <ProviderIcon icon={entry.image} alt="" /> : <Icon name="lock" />}
            title={
              <Inline gap={8} align="center">
                {entry.name}
                {locked(entry.type) && (
                  <Badge size="sm" tone="info">
                    Enterprise
                  </Badge>
                )}
              </Inline>
            }
            description={entry.description}
          />
        ))}
      </RadioGroup>
    </Stack>
  );
};

const ProviderHeading = ({
  type,
  pending,
  onChange
}: {
  type: CaType;
  pending: boolean;
  onChange: () => void;
}) => {
  const provider = PROVIDERS.find((entry) => entry.type === type);
  return (
    <Inline gap={12} align="center" justify="between">
      <Inline gap={8} align="center">
        {provider?.image ? <ProviderIcon icon={provider.image} alt="" /> : <Icon name="lock" />}
        <Heading level={3} size="subsection">
          {provider?.name}
        </Heading>
      </Inline>
      <Button variant="link" disabled={pending} onClick={onChange}>
        Change provider
      </Button>
    </Inline>
  );
};

const NameField = ({
  draft,
  error,
  editing,
  onChange
}: {
  draft: Draft;
  error?: string;
  editing: boolean;
  onChange: (name: string) => void;
}) => (
  <Field
    label="Name"
    description={editing ? undefined : "Lowercase letters, numbers and hyphens."}
    error={error}
    wide
  >
    <Input
      value={draft.name}
      disabled={editing}
      autoComplete="off"
      placeholder={editing ? undefined : suggestName(draft) || "my-external-ca"}
      invalid={Boolean(error)}
      onChange={(event) => onChange(event.target.value)}
    />
  </Field>
);

const useExternalCaDraft = (base?: Draft) => {
  const [edits, setEdits] = useState<Draft>();
  const [errors, setErrors] = useState<Errors>({});
  const draft = edits ?? base;

  const patch = (next: Partial<Draft>) => {
    if (!draft) return;
    setEdits({ ...draft, ...next });
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !(key in next)))
    );
  };

  return {
    draft,
    errors,
    setErrors,
    dirty: Boolean(edits) && JSON.stringify(edits) !== JSON.stringify(base),
    patch,
    set: <K extends keyof Draft>(key: K, value: Draft[K]) =>
      patch({ [key]: value } as Partial<Draft>),
    reset: () => {
      setEdits(undefined);
      setErrors({});
    }
  };
};

type DraftForm = ReturnType<typeof useExternalCaDraft>;

const ExternalCaForm = ({
  formId,
  ca,
  draft,
  form,
  projectId,
  pending,
  requiresContact,
  onChangeProvider,
  onSubmit
}: {
  formId: string;
  ca?: TUnifiedCertificateAuthority;
  draft: Draft;
  form: DraftForm;
  projectId: string;
  pending: boolean;
  requiresContact: boolean;
  onChangeProvider: () => void;
  onSubmit: () => void;
}) => (
  <form
    id={formId}
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    <Stack gap={16}>
      {ca ? (
        <Field label="CA ID" wide>
          <Input value={ca.id} mono readOnly />
        </Field>
      ) : (
        <ProviderHeading type={draft.type} pending={pending} onChange={onChangeProvider} />
      )}
      <NameField
        draft={draft}
        error={form.errors.name}
        editing={Boolean(ca)}
        onChange={(name) => form.set("name", name)}
      />
      <ProviderFields
        draft={draft}
        errors={form.errors}
        projectId={projectId}
        editing={Boolean(ca)}
        set={form.set}
        patch={form.patch}
        csRequiresContact={requiresContact}
      />
    </Stack>
  </form>
);

const useSaveExternalCa = (
  ca: TUnifiedCertificateAuthority | undefined,
  onCreated?: (ca: TUnifiedCertificateAuthority) => void
) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const create = adapter.useCreateCa();
  const update = adapter.useUpdateCa();

  const save = async (draft: Draft, configuration: ReturnType<typeof toConfiguration>) => {
    const body = { name: draft.name, type: draft.type, status: draft.status, configuration };
    try {
      if (ca) {
        await update.mutateAsync({ id: ca.id, ...body } as TUpdateCertificateAuthorityDTO);
        saved(`CA ${draft.name} updated`);
        return true;
      }
      const created = await create.mutateAsync(body as TCreateCertificateAuthorityDTO);
      saved(`CA ${draft.name} created`);
      onCreated?.(created);
      return true;
    } catch (error) {
      failed(ca ? "Could not update the CA" : "Could not create the CA", error);
      return false;
    }
  };

  return { save, pending: create.isPending || update.isPending };
};

const sheetTitle = (draft: Draft | undefined, editing: boolean) => {
  const provider = draft && PROVIDERS.find((entry) => entry.type === draft.type);
  if (!provider) return "Connect external CA";
  return `${editing ? "Edit" : "Create"} ${provider.name} CA`;
};

const useFetchedCa = (open: boolean, ca?: TUnifiedCertificateAuthority) =>
  useV4Adapter("certificateAuthorities").useCa({
    caId: ca?.id ?? "",
    type: ca?.type ?? CaType.ACME,
    options: { enabled: open && Boolean(ca) }
  });

const ExternalCaFooterActions = ({
  formId,
  pending,
  checking,
  editing,
  onCancel
}: {
  formId: string;
  pending: boolean;
  checking: boolean;
  editing: boolean;
  onCancel: () => void;
}) => (
  <>
    <Button
      variant="primary"
      type="submit"
      form={formId}
      loading={pending}
      disabledReason={checking ? "Checking DigiCert validation" : undefined}
    >
      {editing ? "Update" : "Create"}
    </Button>
    <Button variant="outline" disabled={pending} onClick={onCancel}>
      Cancel
    </Button>
  </>
);

export const ExternalCaSheet = ({
  orgId,
  projectId,
  open,
  ca,
  onOpenChange,
  onCreated
}: {
  orgId: string;
  projectId: string;
  open: boolean;
  ca?: TUnifiedCertificateAuthority;
  onOpenChange: (open: boolean) => void;
  onCreated?: (ca: TUnifiedCertificateAuthority) => void;
}) => {
  const adapter = useV4Adapter("certificateAuthorities");
  const { data: plan } = adapter.useCaPlan(orgId);
  const { data: fetched, isPending: fetching } = useFetchedCa(open, ca);
  const { save, pending } = useSaveExternalCa(ca, onCreated);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const formId = useId();
  const [picked, setPicked] = useState<ExternalCaType>();
  const [discard, setDiscard] = useState<() => void>();
  const editing = Boolean(ca);
  const form = useExternalCaDraft(editing ? fetched && fromCa(fetched) : picked && blank(picked));
  const { draft } = form;
  const codeSigning = useCodeSigningValidation(draft);
  const locked = (type: CaType) => type !== CaType.ACME && !plan?.pkiEnterpriseCaIntegrations;

  const close = () => {
    form.reset();
    setPicked(undefined);
    onOpenChange(false);
  };

  const guarded = (action: () => void) => (form.dirty ? setDiscard(() => action) : action());

  const pick = (type: ExternalCaType) => {
    if (!locked(type)) {
      setPicked(type);
      return;
    }
    openUpgradeGate({
      intent: ExternalCertificateAuthoritiesUpgradeIntent,
      paywallKey: "cert-manager.external-ca-type"
    });
  };

  const submit = async () => {
    if (!draft) return;
    const next = validate(draft, editing, codeSigning.requiresContact);
    form.setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    if (await save(draft, toConfiguration(draft, codeSigning.requiresContact))) close();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && !pending && guarded(close)}>
        <SheetContent pending={pending || codeSigning.checking}>
          <SheetHeader>
            <SheetTitle>{sheetTitle(draft, editing)}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {!draft && editing && fetching && <Loader label="Loading CA" />}
            {!draft && !editing && <ProviderPicker locked={locked} onPick={pick} />}
            {draft && (
              <ExternalCaForm
                formId={formId}
                ca={ca}
                draft={draft}
                form={form}
                projectId={projectId}
                pending={pending}
                requiresContact={codeSigning.requiresContact}
                onChangeProvider={() =>
                  guarded(() => {
                    form.reset();
                    setPicked(undefined);
                  })
                }
                onSubmit={submit}
              />
            )}
          </SheetBody>
          {draft && (
            <SheetFooter>
              <ExternalCaFooterActions
                formId={formId}
                pending={pending}
                checking={codeSigning.checking}
                editing={editing}
                onCancel={() => guarded(close)}
              />
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={Boolean(discard)}
        onOpenChange={(next) => !next && setDiscard(undefined)}
        onDiscard={() => {
          discard?.();
          form.reset();
          setDiscard(undefined);
        }}
        description="Your certificate authority configuration will be lost."
      />
      {upgradeGate}
    </>
  );
};
