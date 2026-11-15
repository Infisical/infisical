import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep, type MultiStepStep } from "@infisical/cipher/ui/multi-step";
import { Select } from "@infisical/cipher/ui/select";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { useNavigate } from "@tanstack/react-router";

import {
  getCertificateImportReference,
  isCaTypeLinkable
} from "@app/helpers/certificateImportLinkage";
import type { TCertificatePemSummary } from "@app/helpers/certificatePem";
import type { TPkcs12Entry } from "@app/helpers/pkcs12";
import { CaStatus, CaType } from "@app/hooks/api/ca/enums";
import type { TCertificateProfile } from "@app/hooks/api/certificateProfiles/types";

import { useOrgId } from "../../../access/permissions";
import { errorMessage, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { v4Path } from "../../../links";

const MAX_KEYSTORE_BYTES = 1024 * 1024;

type Format = "pem" | "pkcs12";
type StepKey = "source" | "profile" | "review";

type ProfileOption = {
  id: string;
  slug: string;
  caId: string | null;
  caType: CaType | null;
  isLinkable: boolean;
};

const NOT_LINKABLE =
  "Infisical can't manage the lifecycle of a certificate issued by this authority yet.";

const toProfileOption = (profile: TCertificateProfile): ProfileOption => {
  const caType = profile.caId
    ? ((profile.certificateAuthority?.externalType as CaType) ?? CaType.INTERNAL)
    : null;
  return {
    id: profile.id,
    slug: profile.slug,
    caId: profile.caId,
    caType,
    isLinkable: profile.caId ? isCaTypeLinkable(caType) : true
  };
};

const entryLabel = (entry: TPkcs12Entry) =>
  entry.altNames || entry.commonName || entry.alias || entry.subject;

const plural = (count: number) => `${count} certificate${count === 1 ? "" : "s"}`;

const useReference = (profile: ProfileOption | null) => {
  const reference = getCertificateImportReference(profile?.caType);
  const certificates = useV4Adapter("certificates");
  const { data: authorities = [], isPending: isCasPending } =
    certificates.useCertificateAuthorities();
  const ca = authorities.find(
    (entry) => entry.id === profile?.caId && entry.status === CaStatus.ACTIVE
  );
  const digicert =
    ca?.type === CaType.DIGICERT && reference?.hasLiveOptions ? ca.configuration : undefined;
  const {
    data: orders = [],
    isPending: isOrdersPending,
    error
  } = certificates.useDigiCertOrders({
    connectionId: digicert?.appConnectionId ?? "",
    organizationId: digicert?.organizationId ?? 0,
    productNameId: digicert?.productNameId ?? "",
    enabled: Boolean(digicert)
  });
  const options = orders.map((order) => ({
    value: String(order.orderId),
    label: `#${order.orderId} (${order.commonName || "Certificate"})`
  }));
  const isLoading =
    Boolean(reference?.hasLiveOptions) && (isCasPending || (Boolean(digicert) && isOrdersPending));
  const freeText =
    !reference?.hasLiveOptions || (!isLoading && (!digicert || Boolean(error) || !options.length));
  return { reference, options, isLoading, freeText };
};

const ReferenceInput = ({
  profile,
  value,
  onChange,
  error
}: {
  profile: ProfileOption | null;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) => {
  const { reference, options, isLoading, freeText } = useReference(profile);
  if (!reference) return null;
  return (
    <Field label={reference.label} description={reference.description} error={error}>
      {freeText ? (
        <Input
          width="md"
          placeholder={reference.placeholder}
          value={value}
          invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Combobox
          label={reference.label}
          width="md"
          placeholder={reference.optionsPlaceholder}
          loading={isLoading}
          options={options}
          value={value}
          onChange={onChange}
        />
      )}
    </Field>
  );
};

const ProfileSelect = ({
  options,
  value,
  onChange,
  label = "Certificate profile"
}: {
  options: ProfileOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) => (
  <Select
    aria-label={label}
    width="md"
    placeholder="No profile"
    options={[
      { value: "", label: "No profile" },
      ...options.map((option) => ({
        value: option.id,
        label: option.slug,
        disabled: !option.isLinkable,
        description: option.isLinkable ? undefined : NOT_LINKABLE
      }))
    ]}
    value={value}
    onChange={onChange}
  />
);

const EntryReference = ({
  profile,
  value,
  onChange
}: {
  profile: ProfileOption | null;
  value: string;
  onChange: (value: string) => void;
}) => {
  const { reference, options, freeText, isLoading } = useReference(profile);
  if (!reference) return <span>None</span>;
  return freeText ? (
    <Input
      aria-label={reference.label}
      size="sm"
      placeholder={reference.placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ) : (
    <Combobox
      label={reference.label}
      placeholder={reference.optionsPlaceholder}
      loading={isLoading}
      options={options}
      value={value}
      onChange={onChange}
    />
  );
};

export const ImportCertificatesSheet = ({
  applicationId,
  onClose
}: {
  applicationId?: string;
  onClose: () => void;
}) => {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const certificates = useV4Adapter("certificates");
  const importCertificate = certificates.useImportCertificate();
  const importEntries = certificates.useImportPkcs12Entries();
  const { data: profileData } = certificates.useCertificateProfiles({
    applicationId,
    limit: 100,
    enabled: Boolean(applicationId)
  });
  const profileOptions = (applicationId ? (profileData?.certificateProfiles ?? []) : [])
    .map(toProfileOption)
    .sort((a, b) => Number(b.isLinkable) - Number(a.isLinkable));
  const hasApplication = Boolean(applicationId);

  const [format, setFormat] = useState<Format>("pem");
  const [pem, setPem] = useState({ certificatePem: "", chainPem: "", privateKeyPem: "", csr: "" });
  const [profileId, setProfileId] = useState("");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [summary, setSummary] = useState<TCertificatePemSummary | null>(null);
  const [pemError, setPemError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [entries, setEntries] = useState<TPkcs12Entry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profileByEntry, setProfileByEntry] = useState<Record<string, string>>({});
  const [referenceByEntry, setReferenceByEntry] = useState<Record<string, string>>({});
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [hasRun, setHasRun] = useState(false);
  const [step, setStep] = useState(0);
  const completed = useRef(false);

  const isKeystore = format === "pkcs12";
  const stepKeys: StepKey[] =
    hasApplication || isKeystore ? ["source", "profile", "review"] : ["source", "review"];
  const profileOf = (id?: string) => profileOptions.find((option) => option.id === id) ?? null;
  const selectedProfile = profileOf(profileId);
  const pemReference = getCertificateImportReference(selectedProfile?.caType);
  const isCsrApplicable =
    !isKeystore &&
    Boolean(selectedProfile?.caId) &&
    selectedProfile?.caType !== CaType.AWS_ACM_PUBLIC_CA &&
    !pem.privateKeyPem.trim();

  const remaining = (entries ?? []).filter((entry) => !imported.has(entry.fingerprintSha256));
  const chosen = remaining.filter((entry) => selected.has(entry.fingerprintSha256));
  const entryReferences = chosen.map((entry) => ({
    entry,
    reference: getCertificateImportReference(
      profileOf(profileByEntry[entry.fingerprintSha256])?.caType
    )
  }));
  const referenceLabels = [
    ...new Set(entryReferences.flatMap(({ reference: ref }) => (ref ? [ref.label] : [])))
  ];
  const referenceColumn =
    referenceLabels.length > 1 ? "Provider reference" : (referenceLabels[0] ?? null);
  const isMissingReference =
    isKeystore &&
    entryReferences.some(
      ({ entry, reference: ref }) =>
        ref && !ref.parse(referenceByEntry[entry.fingerprintSha256] ?? "")
    );
  const allDone = isKeystore && hasRun && remaining.length === 0;

  const resetKeystore = () => {
    setErrors({});
    setEntries(null);
    setSelected(new Set());
    setProfileByEntry({});
    setReferenceByEntry({});
  };

  const readKeystoreFile = async () => {
    if (!file) {
      setErrors({ file: "Choose a .p12 or .pfx keystore" });
      return false;
    }
    if (file.size > MAX_KEYSTORE_BYTES) {
      setErrors({ file: "This file is larger than 1 MB. Upload a keystore under 1 MB." });
      return false;
    }
    const { readKeystore } = await import("@app/helpers/pkcs12");
    const result = await readKeystore(await file.arrayBuffer(), password);
    if (!result.entries) {
      setErrors(result.isPasswordError ? { password: result.error } : { file: result.error });
      return false;
    }
    setEntries(result.entries);
    setSelected(
      new Set(
        result.entries
          .filter((entry) => !imported.has(entry.fingerprintSha256))
          .map((entry) => entry.fingerprintSha256)
      )
    );
    return true;
  };

  const readPem = async () => {
    if (!pem.certificatePem.trim()) {
      setErrors({ certificatePem: "Certificate PEM is required" });
      return false;
    }
    const { summarizeCertificatePem } = await import("@app/helpers/certificatePem");
    const next = summarizeCertificatePem(pem.certificatePem);
    if (!next) {
      setErrors({
        certificatePem:
          "This is not a valid certificate. Paste the PEM block, including the BEGIN and END lines."
      });
      return false;
    }
    setSummary(next);
    return true;
  };

  const validateProfile = () => {
    if (isKeystore) return !isMissingReference && chosen.length > 0;
    if (pemReference && !pemReference.parse(reference)) {
      setErrors({ reference: pemReference.invalidMessage });
      return false;
    }
    return true;
  };

  const importPem = async () => {
    setPemError(null);
    const externalMetadata = pemReference && reference ? pemReference.parse(reference) : null;
    try {
      const { certificateId } = await importCertificate.mutateAsync({
        certificatePem: pem.certificatePem,
        ...(pem.privateKeyPem.trim() && { privateKeyPem: pem.privateKeyPem.trim() }),
        ...(pem.chainPem.trim() && { chainPem: pem.chainPem.trim() }),
        ...(isCsrApplicable && pem.csr.trim() && { csr: pem.csr.trim() }),
        ...(profileId && { profileId }),
        ...(externalMetadata && { externalMetadata }),
        applicationId
      });
      saved("Certificate imported");
      completed.current = true;
      navigate({
        to: v4Path("/organizations/$orgId/cert-manager/certificates/$certificateId"),
        params: { orgId, certificateId }
      });
      return true;
    } catch (error) {
      setHasRun(true);
      setPemError(errorMessage(error) ?? "Could not import this certificate.");
      return false;
    }
  };

  const importKeystore = async () => {
    const externalMetadataByFingerprint = Object.fromEntries(
      entryReferences.flatMap(({ entry, reference: ref }) => {
        const parsed = ref?.parse(referenceByEntry[entry.fingerprintSha256] ?? "");
        return parsed ? [[entry.fingerprintSha256, parsed] as const] : [];
      })
    );
    const results = await importEntries.mutateAsync({
      entries: chosen,
      applicationId,
      profileIdByFingerprint: profileByEntry,
      externalMetadataByFingerprint
    });
    const succeeded = results.filter((result) => !result.error);
    const rejected = results.filter((result) => result.error);
    setImported((current) => {
      const next = new Set(current);
      succeeded.forEach((result) => next.add(result.entry.fingerprintSha256));
      return next;
    });
    setFailures(
      Object.fromEntries(
        rejected.map((result) => [result.entry.fingerprintSha256, result.error ?? ""])
      )
    );
    setSelected(new Set(rejected.map((result) => result.entry.fingerprintSha256)));
    setHasRun(true);
    if (succeeded.length) saved(`Imported ${succeeded.length} of ${plural(results.length)}`);
    return false;
  };

  const clearLastRun = () => {
    if (isKeystore && !remaining.length) return;
    setPemError(null);
    setHasRun(false);
  };

  const close = () => {
    completed.current = false;
    onClose();
  };

  const isDirty =
    Object.values(pem).some((value) => value.trim()) || Boolean(file) || Boolean(entries);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: isDirty && !allDone,
    onDiscard: close
  });
  const requestClose = () => (completed.current ? close() : requestDiscard());

  const entryColumns: DataTableColumn<TPkcs12Entry>[] = [
    {
      id: "name",
      header: "SAN / CN",
      primary: true,
      grow: true,
      text: entryLabel,
      render: entryLabel,
      secondary: (entry) =>
        imported.has(entry.fingerprintSha256)
          ? "Imported"
          : failures[entry.fingerprintSha256] || entry.chainWarning || undefined
    },
    {
      id: "key",
      header: "Private key",
      width: 104,
      text: (entry) => (entry.privateKeyPem ? "Yes" : "No"),
      render: (entry) => (entry.privateKeyPem ? "Yes" : "No")
    },
    {
      id: "chain",
      header: "Chain",
      width: 80,
      text: (entry) => (entry.chainPem ? "Yes" : "No"),
      render: (entry) => (entry.chainPem ? "Yes" : "No")
    },
    ...(hasApplication
      ? [
          {
            id: "profile",
            header: "Certificate profile",
            width: 208,
            render: (entry: TPkcs12Entry) =>
              selected.has(entry.fingerprintSha256) ? (
                <ProfileSelect
                  label={`Certificate profile for ${entryLabel(entry)}`}
                  options={profileOptions}
                  value={profileByEntry[entry.fingerprintSha256] ?? ""}
                  onChange={(value) => {
                    setProfileByEntry((current) => ({
                      ...current,
                      [entry.fingerprintSha256]: value
                    }));
                    setReferenceByEntry((current) => ({
                      ...current,
                      [entry.fingerprintSha256]: ""
                    }));
                  }}
                />
              ) : (
                "None"
              )
          }
        ]
      : []),
    ...(referenceColumn
      ? [
          {
            id: "reference",
            header: referenceColumn,
            width: 208,
            render: (entry: TPkcs12Entry) =>
              selected.has(entry.fingerprintSha256) ? (
                <EntryReference
                  profile={profileOf(profileByEntry[entry.fingerprintSha256])}
                  value={referenceByEntry[entry.fingerprintSha256] ?? ""}
                  onChange={(value) =>
                    setReferenceByEntry((current) => ({
                      ...current,
                      [entry.fingerprintSha256]: value
                    }))
                  }
                />
              ) : (
                "None"
              )
          }
        ]
      : [])
  ];

  type ReviewRow = {
    key: string;
    name: string;
    serialNumber: string;
    hasChain: boolean;
    hasPrivateKey: boolean;
    profile?: string;
    reference?: string;
  };
  const reviewRows: ReviewRow[] = isKeystore
    ? chosen.map((entry) => ({
        key: entry.fingerprintSha256,
        name: entryLabel(entry),
        serialNumber: entry.serialNumber,
        hasChain: Boolean(entry.chainPem),
        hasPrivateKey: Boolean(entry.privateKeyPem),
        profile: profileOf(profileByEntry[entry.fingerprintSha256])?.slug,
        reference: referenceByEntry[entry.fingerprintSha256]
      }))
    : [
        {
          key: "pem",
          name: summary?.altNames || summary?.commonName || summary?.subject || "Certificate",
          serialNumber: summary?.serialNumber ?? "",
          hasChain: Boolean(pem.chainPem.trim()),
          hasPrivateKey: Boolean(pem.privateKeyPem.trim()),
          profile: selectedProfile?.slug,
          reference
        }
      ];
  const reviewReference = isKeystore ? referenceColumn : (pemReference?.label ?? null);
  const reviewColumns: DataTableColumn<ReviewRow>[] = [
    {
      id: "name",
      header: "SAN / CN",
      primary: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => row.name
    },
    {
      id: "serial",
      header: "Serial number",
      width: 176,
      mono: true,
      text: (row) => row.serialNumber,
      render: (row) => row.serialNumber
    },
    {
      id: "chain",
      header: "Chain",
      width: 80,
      text: (row) => (row.hasChain ? "Yes" : "No"),
      render: (row) => (row.hasChain ? "Yes" : "No")
    },
    {
      id: "key",
      header: "Private key",
      width: 104,
      text: (row) => (row.hasPrivateKey ? "Yes" : "No"),
      render: (row) => (row.hasPrivateKey ? "Yes" : "No")
    },
    ...(hasApplication
      ? [
          {
            id: "profile",
            header: "Certificate profile",
            width: 160,
            text: (row: ReviewRow) => row.profile ?? "None",
            render: (row: ReviewRow) => row.profile ?? "None"
          }
        ]
      : []),
    ...(reviewReference
      ? [
          {
            id: "reference",
            header: reviewReference,
            width: 144,
            mono: true,
            text: (row: ReviewRow) => row.reference || "None",
            render: (row: ReviewRow) => row.reference || "None"
          }
        ]
      : [])
  ];

  const attempted = (entries ?? []).filter(
    (entry) => imported.has(entry.fingerprintSha256) || failures[entry.fingerprintSha256]
  );

  const reviewContent = () => {
    if (isKeystore && hasRun)
      return (
        <DataTable
          label="Import results"
          rows={attempted}
          columns={[
            {
              id: "name",
              header: "Certificate",
              primary: true,
              grow: true,
              text: entryLabel,
              render: entryLabel
            },
            {
              id: "result",
              header: "Result",
              width: 280,
              wrap: true,
              render: (entry) =>
                failures[entry.fingerprintSha256] ? (
                  <Badge tone="bad">{failures[entry.fingerprintSha256]}</Badge>
                ) : (
                  <Badge tone="ok" dot>
                    Imported
                  </Badge>
                )
            }
          ]}
          getRowId={(entry) => entry.fingerprintSha256}
          rowLabel={entryLabel}
        />
      );
    if (!isKeystore && pemError)
      return (
        <Alert tone="bad" title="Import failed">
          {pemError}
        </Alert>
      );
    return (
      <DataTable
        label={isKeystore ? "Certificates to import" : "Certificate to import"}
        rows={reviewRows}
        columns={reviewColumns}
        getRowId={(row) => row.key}
        rowLabel={(row) => row.name}
      />
    );
  };

  const sourceContent = (
    <Stack gap={16}>
      <Field
        label="Source format"
        description="PEM takes the certificate, its chain and its private key as text. A PKCS#12 keystore is a single .p12 or .pfx file, and can hold more than one certificate."
      >
        <Select
          aria-label="Source format"
          width="md"
          options={[
            { value: "pem", label: "PEM" },
            { value: "pkcs12", label: "PKCS#12 keystore" }
          ]}
          value={format}
          onChange={(value) => {
            setFormat(value as Format);
            setErrors({});
            setPemError(null);
          }}
        />
      </Field>
      {isKeystore ? (
        <>
          <Field
            label="Keystore file"
            description=".p12 or .pfx keystore, up to 1 MB"
            error={errors.file}
          >
            <Input
              type="file"
              accept=".p12,.pfx"
              invalid={Boolean(errors.file)}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                resetKeystore();
              }}
            />
          </Field>
          <Field
            label="Password"
            optional
            error={errors.password}
            description="Infisical opens the keystore in your browser to list what is inside."
          >
            <Input
              type="password"
              width="md"
              autoComplete="off"
              placeholder="Leave blank if the keystore has no password"
              value={password}
              invalid={Boolean(errors.password)}
              onChange={(event) => {
                setPassword(event.target.value);
                resetKeystore();
              }}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Leaf certificate PEM" error={errors.certificatePem}>
            <Textarea
              mono
              rows={6}
              spellCheck={false}
              placeholder="-----BEGIN CERTIFICATE-----"
              aria-invalid={Boolean(errors.certificatePem)}
              value={pem.certificatePem}
              onChange={(event) => {
                setPem({ ...pem, certificatePem: event.target.value });
                setErrors({});
              }}
            />
          </Field>
          <Field label="Certificate chain PEM" optional>
            <Textarea
              mono
              rows={4}
              spellCheck={false}
              value={pem.chainPem}
              onChange={(event) => setPem({ ...pem, chainPem: event.target.value })}
            />
          </Field>
          <Field label="Private key PEM" optional>
            <Textarea
              mono
              rows={4}
              spellCheck={false}
              value={pem.privateKeyPem}
              onChange={(event) => setPem({ ...pem, privateKeyPem: event.target.value })}
            />
          </Field>
        </>
      )}
    </Stack>
  );

  const profileContent = isKeystore ? (
    <DataTable
      label={`${plural(chosen.length)} to import`}
      rows={remaining}
      columns={entryColumns}
      getRowId={(entry) => entry.fingerprintSha256}
      rowLabel={entryLabel}
      selectable
      selectedIds={[...selected]}
      onSelectionChange={(ids) => setSelected(new Set(ids))}
    />
  ) : (
    <Stack gap={16}>
      <Field
        label="Certificate profile"
        optional
        description="Leave empty to track this certificate without renewal, reissue or revocation."
      >
        <ProfileSelect
          options={profileOptions}
          value={profileId}
          onChange={(value) => {
            setProfileId(value);
            setReference("");
            setErrors({});
          }}
        />
      </Field>
      <ReferenceInput
        profile={selectedProfile}
        value={reference}
        error={errors.reference}
        onChange={(value) => {
          setReference(value);
          setErrors({});
        }}
      />
      {isCsrApplicable && (
        <Field
          label="Certificate signing request PEM"
          optional
          description="The CSR generated from this certificate's private key. Infisical uses it to renew on the same key pair, including auto renewal, without holding the private key."
        >
          <Textarea
            mono
            rows={6}
            spellCheck={false}
            value={pem.csr}
            onChange={(event) => setPem({ ...pem, csr: event.target.value })}
          />
        </Field>
      )}
    </Stack>
  );

  const completeLabel = (() => {
    if (!isKeystore) return "Import";
    if (allDone) return "Done";
    return hasRun && chosen.length ? `Retry ${chosen.length}` : `Import ${chosen.length}`;
  })();

  const nothingToImport = isKeystore && chosen.length === 0;
  const blockReason = (() => {
    if (nothingToImport) return "Select at least one certificate to import";
    if (isMissingReference) return "Enter a provider reference for each selected certificate";
    return undefined;
  })();

  const STEPS: Record<StepKey, MultiStepStep> = {
    source: {
      title: "Source",
      description: "Paste the PEM files you hold, or upload a PKCS#12 keystore.",
      content: sourceContent,
      validate: () => {
        if (!isKeystore) return readPem();
        return entries ? true : readKeystoreFile();
      }
    },
    profile: hasApplication
      ? {
          title: "Profile",
          description: "Choose the profile that will manage renewal and revocation.",
          content: profileContent,
          disabledReason: blockReason,
          validate: validateProfile
        }
      : {
          title: "Certificates",
          description: "Choose which certificates to import from this keystore.",
          content: profileContent,
          disabledReason: blockReason,
          validate: validateProfile
        },
    review: {
      title: "Review",
      description: "Check what will be imported before it is stored.",
      content: reviewContent(),
      disabledReason: allDone ? undefined : blockReason,
      validate: () => {
        if (allDone) return true;
        return isKeystore ? importKeystore() : importPem();
      }
    }
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title="Import certificate"
        open
        step={Math.min(step, stepKeys.length - 1)}
        onStepChange={(next) => {
          if (next < step) clearLastRun();
          setStep(next);
        }}
        onOpenChange={(next) => !next && requestClose()}
        completeLabel={completeLabel}
        steps={stepKeys.map((key) => STEPS[key])}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="The certificates you added will not be imported."
      />
    </>
  );
};
