import { ReactNode, useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { CircleCheck, CircleX, TriangleAlert, Upload } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FileDropzone,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import type { TCertificatePemSummary } from "@app/helpers/certificatePem";
import type { TPkcs12Entry } from "@app/helpers/pkcs12";
import { useImportCertificate, useImportPkcs12Entries } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import {
  CertificateProfileSelect,
  CertificateReferenceField,
  ProfileOption,
  useCertificateImportProfiles,
  useCertificateImportReference
} from "./certificate-import-fields";
import { getCertificateImportReference } from "./certificate-import-linkage";
import { CertificateWizardSheet, useWizardSteps, WizardStep } from "./CertificateWizardSheet";
import { CertificateImportFormData, certificateImportSchema } from "./types";

const MAX_KEYSTORE_BYTES = 1024 * 1024;
const STICKY_HEAD = "sticky top-0 z-10 bg-popover";
const ENTRY_BASE_WIDTH = 368;
const ENTRY_PROFILE_WIDTH = 224;
const ENTRY_REF_WIDTH = 224;
const REVIEW_BASE_WIDTH = 496;
const REVIEW_PROFILE_WIDTH = 176;
const REVIEW_REF_WIDTH = 160;

export type FormData = CertificateImportFormData;

enum ImportFormat {
  Pem = "pem",
  Keystore = "pkcs12"
}

const STEP_KEYS = ["source", "profile", "review"] as const;
type ImportStepKey = (typeof STEP_KEYS)[number];

const STEP_FIELDS: Record<ImportStepKey, string[]> = {
  source: ["certificatePem", "chainPem", "privateKeyPem"],
  profile: ["profileId", "providerReference"],
  review: []
};

const buildSteps = (hasApplication: boolean): Record<ImportStepKey, WizardStep> => ({
  source: {
    name: "Source",
    shortDescription: "PEM or keystore",
    title: "Certificate Source",
    subtitle: "Paste the PEM files you hold, or upload a PKCS#12 keystore."
  },
  profile: hasApplication
    ? {
        name: "Profile",
        shortDescription: "Lifecycle owner",
        title: "Certificate Profile",
        subtitle: "Choose the profile that will manage renewal and revocation."
      }
    : {
        name: "Certificates",
        shortDescription: "What to import",
        title: "Keystore Contents",
        subtitle: "Choose which certificates to import from this keystore."
      },
  review: {
    name: "Review",
    shortDescription: "Confirm and import",
    title: "Review & Import",
    subtitle: "Check what will be imported before it is stored."
  }
});

type Props = {
  popUp: UsePopUpState<["certificateImport"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["certificateImport"]>,
    state?: boolean
  ) => void;
  applicationId?: string;
};

const ReviewSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-3">
    <div className="w-full border-b border-border">
      <span className="text-sm text-muted">{title}</span>
    </div>
    {children}
  </div>
);

const entryLabel = (entry: TPkcs12Entry) =>
  entry.altNames || entry.commonName || entry.alias || entry.subject;

type EntryRowProps = {
  entry: TPkcs12Entry;
  isImported: boolean;
  isSelected: boolean;
  onToggle: () => void;
  showProfile: boolean;
  hasReferenceColumn: boolean;
  profileOptions: ProfileOption[];
  isProfilesLoading: boolean;
  profileId?: string;
  onProfileChange: (profileId?: string) => void;
  referenceValue?: string;
  onReferenceChange: (value: string) => void;
  lastError?: string;
};

const KeystoreEntryRow = ({
  entry,
  isImported,
  isSelected,
  onToggle,
  showProfile,
  hasReferenceColumn,
  profileOptions,
  isProfilesLoading,
  profileId,
  onProfileChange,
  referenceValue,
  onReferenceChange,
  lastError
}: EntryRowProps) => {
  const profile = profileOptions.find((option) => option.id === profileId) ?? null;
  const referenceSource = useCertificateImportReference(profile);
  const stopRowToggle = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <TableRow
      className={isImported ? "opacity-60" : "cursor-pointer"}
      onClick={isImported ? undefined : onToggle}
    >
      <TableCell onClick={stopRowToggle}>
        <Checkbox
          id={entry.fingerprintSha256}
          variant="project"
          isDisabled={isImported}
          isChecked={isImported || isSelected}
          onCheckedChange={onToggle}
        />
      </TableCell>
      <TableCell className="max-w-0">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate">{entryLabel(entry)}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-lg break-words">{entryLabel(entry)}</TooltipContent>
          </Tooltip>
          {isImported && <Badge variant="success">Imported</Badge>}
          {!isImported && lastError && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="danger">Rejected</Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-lg whitespace-pre-line">{lastError}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={entry.privateKeyPem ? "success" : "neutral"}>
          {entry.privateKeyPem ? "Yes" : "No"}
        </Badge>
      </TableCell>
      <TableCell>
        {entry.chainWarning ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 text-warning">
                <TriangleAlert className="size-3.5" />
                No
              </span>
            </TooltipTrigger>
            <TooltipContent>{entry.chainWarning}</TooltipContent>
          </Tooltip>
        ) : (
          <Badge variant={entry.chainPem ? "success" : "neutral"}>
            {entry.chainPem ? "Yes" : "No"}
          </Badge>
        )}
      </TableCell>
      {showProfile && (
        <TableCell onClick={stopRowToggle}>
          {isSelected ? (
            <CertificateProfileSelect
              options={profileOptions}
              isLoading={isProfilesLoading}
              value={profileId}
              onChange={onProfileChange}
            />
          ) : (
            <span className="text-muted">&mdash;</span>
          )}
        </TableCell>
      )}
      {hasReferenceColumn && (
        <TableCell onClick={stopRowToggle}>
          {isSelected && referenceSource.reference ? (
            <CertificateReferenceField
              source={referenceSource}
              value={referenceValue}
              onChange={onReferenceChange}
            />
          ) : (
            <span className="text-muted">&mdash;</span>
          )}
        </TableCell>
      )}
    </TableRow>
  );
};

export const CertificateImportSheet = ({ popUp, handlePopUpToggle, applicationId }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { mutateAsync: importCertificate, isPending: isImportingPem } = useImportCertificate();
  const { mutateAsync: importEntries, isPending: isImportingEntries } = useImportPkcs12Entries();

  const [format, setFormat] = useState<ImportFormat>(ImportFormat.Pem);
  const [keystoreFiles, setKeystoreFiles] = useState<File[]>([]);
  const [keystorePassword, setKeystorePassword] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [entries, setEntries] = useState<TPkcs12Entry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [references, setReferences] = useState<Record<string, string>>({});
  const [profileByFingerprint, setProfileByFingerprint] = useState<Record<string, string>>({});
  const [importedFingerprints, setImportedFingerprints] = useState<Set<string>>(new Set());
  const [failureByFingerprint, setFailureByFingerprint] = useState<Record<string, string>>({});
  const [hasRun, setHasRun] = useState(false);
  const [pemError, setPemError] = useState<string | null>(null);
  const [pemSummary, setPemSummary] = useState<TCertificatePemSummary | null>(null);

  const hasApplication = Boolean(applicationId);
  const stepKeys = useMemo(
    () =>
      hasApplication || format === ImportFormat.Keystore
        ? STEP_KEYS
        : STEP_KEYS.filter((key) => key !== "profile"),
    [hasApplication, format]
  );
  const steps = useMemo(() => {
    const built = buildSteps(hasApplication);
    return stepKeys.map((key) => built[key]);
  }, [hasApplication, stepKeys]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    getValues,
    trigger,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(certificateImportSchema),
    defaultValues: { certificatePem: "", chainPem: "", privateKeyPem: "", providerReference: "" }
  });

  const { profileOptions, isProfilesLoading } = useCertificateImportProfiles(applicationId);
  const selectedProfileId = useWatch({ control, name: "profileId" });
  const selectedProfile = profileOptions.find((option) => option.id === selectedProfileId) ?? null;
  const referenceSource = useCertificateImportReference(selectedProfile);
  const { reference } = referenceSource;

  const isKeystore = format === ImportFormat.Keystore;

  const selectableEntries = useMemo(
    () => (entries ?? []).filter((entry) => !importedFingerprints.has(entry.fingerprintSha256)),
    [entries, importedFingerprints]
  );

  const selectedEntries = useMemo(
    () => selectableEntries.filter((entry) => selected.has(entry.fingerprintSha256)),
    [selectableEntries, selected]
  );

  const profileFor = (fingerprint: string) =>
    profileOptions.find((option) => option.id === profileByFingerprint[fingerprint]) ?? null;

  const entryReferences = selectedEntries.map((entry) => ({
    entry,
    reference: getCertificateImportReference(profileFor(entry.fingerprintSha256)?.caType)
  }));

  const referenceColumnLabel = (() => {
    const labels = [
      ...new Set(entryReferences.flatMap(({ reference: r }) => (r ? [r.label] : [])))
    ];
    if (!labels.length) return null;
    return labels.length === 1 ? labels[0] : "Provider Reference";
  })();

  const isMissingReference = isKeystore
    ? entryReferences.some(
        ({ entry, reference: r }) => r && !r.parse(references[entry.fingerprintSha256] ?? "")
      )
    : false;

  const discardKeystoreRead = () => {
    setFileError(null);
    setPasswordError(null);
    setEntries(null);
    setSelected(new Set());
    setReferences({});
    setProfileByFingerprint({});
  };

  const readKeystoreFile = async () => {
    const file = keystoreFiles[0];
    if (!file) return false;

    setFileError(null);
    setPasswordError(null);
    if (file.size > MAX_KEYSTORE_BYTES) {
      setFileError("This file is larger than 1 MB. Upload a keystore under 1 MB.");
      return false;
    }

    setIsExtracting(true);
    try {
      const { readKeystore } = await import("@app/helpers/pkcs12");
      const result = await readKeystore(await file.arrayBuffer(), keystorePassword);
      if (!result.entries) {
        if (result.isPasswordError) setPasswordError(result.error);
        else setFileError(result.error);
        return false;
      }
      setEntries(result.entries);
      setSelected(
        new Set(
          result.entries
            .filter((entry) => !importedFingerprints.has(entry.fingerprintSha256))
            .map((entry) => entry.fingerprintSha256)
        )
      );
      return true;
    } finally {
      setIsExtracting(false);
    }
  };

  const readCertificatePem = async () => {
    if (!(await trigger(STEP_FIELDS.source as (keyof FormData)[]))) return false;

    const { summarizeCertificatePem } = await import("@app/helpers/certificatePem");
    const summary = summarizeCertificatePem(getValues("certificatePem"));
    if (!summary) {
      setError("certificatePem", {
        message:
          "This is not a valid certificate. Paste the PEM block, including the BEGIN and END lines."
      });
      return false;
    }
    setPemSummary(summary);
    return true;
  };

  const { step, setStep, currentStepKey, goBack, goNext, onFormInvalid } = useWizardSteps({
    stepKeys,
    stepFields: STEP_FIELDS,
    invalidMessage: "Fix the highlighted fields before importing.",
    validateStep: async (fields) => {
      if (fields === STEP_FIELDS.source) {
        if (isKeystore) return entries ? true : readKeystoreFile();
        return readCertificatePem();
      }
      if (isKeystore) return true;
      return trigger(fields as (keyof FormData)[]);
    }
  });

  const resetAll = () => {
    reset({
      certificatePem: "",
      chainPem: "",
      privateKeyPem: "",
      profileId: undefined,
      linkedCaType: undefined,
      providerReference: ""
    });
    setFormat(ImportFormat.Pem);
    setKeystoreFiles([]);
    setKeystorePassword("");
    setFileError(null);
    setPasswordError(null);
    setEntries(null);
    setSelected(new Set());
    setReferences({});
    setProfileByFingerprint({});
    setImportedFingerprints(new Set());
    setFailureByFingerprint({});
    setHasRun(false);
    setPemError(null);
    setPemSummary(null);
    setStep(0);
  };

  const isOpen = Boolean(popUp?.certificateImport?.isOpen);
  useEffect(() => {
    if (isOpen) resetAll();
  }, [isOpen]);

  useEffect(() => {
    setValue("linkedCaType", selectedProfile?.caType ?? undefined);
  }, [selectedProfileId, selectedProfile?.caType, setValue]);

  const toggleEntry = (fingerprint: string) => {
    if (importedFingerprints.has(fingerprint)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fingerprint)) next.delete(fingerprint);
      else next.add(fingerprint);
      return next;
    });
  };

  const importPem = async (values: FormData) => {
    setPemError(null);
    const trimmedPrivateKey = values.privateKeyPem?.trim();
    const trimmedChain = values.chainPem?.trim();
    const linkage = getCertificateImportReference(values.linkedCaType);
    const externalMetadata =
      linkage && values.providerReference ? linkage.parse(values.providerReference) : undefined;

    try {
      const { certificateId } = await importCertificate({
        certificatePem: values.certificatePem,
        ...(trimmedPrivateKey ? { privateKeyPem: trimmedPrivateKey } : {}),
        ...(trimmedChain ? { chainPem: trimmedChain } : {}),
        ...(values.profileId ? { profileId: values.profileId } : {}),
        ...(externalMetadata ? { externalMetadata } : {}),
        applicationId
      });

      handlePopUpToggle("certificateImport", false);
      createNotification({ text: "Successfully imported certificate", type: "success" });

      if (currentOrg && currentProject) {
        await navigate({
          to: "/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId",
          params: { orgId: currentOrg.id, projectId: currentProject.id, certificateId }
        });
      }
    } catch (error) {
      setHasRun(true);
      setPemError(
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not import this certificate."
      );
    }
  };

  const importKeystore = async () => {
    const externalMetadataByFingerprint = Object.fromEntries(
      entryReferences.flatMap(({ entry, reference: r }) => {
        const parsed = r?.parse(references[entry.fingerprintSha256] ?? "");
        return parsed ? [[entry.fingerprintSha256, parsed] as const] : [];
      })
    );

    const results = await importEntries({
      entries: selectedEntries,
      applicationId,
      profileIdByFingerprint: profileByFingerprint,
      externalMetadataByFingerprint
    });

    const succeeded = results.filter((result) => !result.error);
    const failed = results.filter((result) => result.error);

    setImportedFingerprints((prev) => {
      const next = new Set(prev);
      succeeded.forEach((result) => next.add(result.entry.fingerprintSha256));
      return next;
    });
    setFailureByFingerprint(
      Object.fromEntries(failed.map((result) => [result.entry.fingerprintSha256, result.error!]))
    );
    setSelected(new Set(failed.map((result) => result.entry.fingerprintSha256)));
    setHasRun(true);

    if (succeeded.length) {
      createNotification({
        text: `Imported ${succeeded.length} of ${results.length} certificate${results.length === 1 ? "" : "s"}`,
        type: "success"
      });
    }
  };

  const renderSourceStep = () => (
    <FieldGroup>
      <Field>
        <FieldLabel>Source Format</FieldLabel>
        <FieldContent>
          <Select
            value={format}
            onValueChange={(value) => {
              setFormat(value as ImportFormat);
              setPemError(null);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={ImportFormat.Pem}>PEM</SelectItem>
              <SelectItem value={ImportFormat.Keystore}>PKCS#12 Keystore</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            PEM takes the certificate, its chain and its private key as text. A PKCS#12 keystore is
            a single .p12 or .pfx file, and can hold more than one certificate.
          </FieldDescription>
        </FieldContent>
      </Field>

      {isKeystore ? (
        <>
          <Field data-invalid={Boolean(fileError)}>
            <FieldLabel>Keystore File</FieldLabel>
            <FieldContent>
              <FileDropzone
                accept=".p12,.pfx"
                description=".p12 or .pfx keystore, up to 1 MB"
                files={keystoreFiles}
                onFilesSelect={(files) => {
                  setKeystoreFiles(files.slice(0, 1));
                  discardKeystoreRead();
                }}
                onFileRemove={() => {
                  setKeystoreFiles([]);
                  discardKeystoreRead();
                }}
              />
              {fileError && <FieldError>{fileError}</FieldError>}
            </FieldContent>
          </Field>
          <Field data-invalid={Boolean(passwordError)}>
            <FieldLabel>Password</FieldLabel>
            <FieldContent>
              <Input
                type="password"
                autoComplete="off"
                value={keystorePassword}
                onChange={(e) => {
                  setKeystorePassword(e.target.value);
                  discardKeystoreRead();
                }}
                placeholder="Leave blank if the keystore has no password"
              />
              {passwordError ? (
                <FieldError>{passwordError}</FieldError>
              ) : (
                <FieldDescription>
                  Infisical opens the keystore in your browser to list what is inside.
                </FieldDescription>
              )}
            </FieldContent>
          </Field>
        </>
      ) : (
        <>
          <Controller
            control={control}
            name="certificatePem"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel>Leaf Certificate PEM</FieldLabel>
                <TextArea {...field} />
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="chainPem"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel>Certificate Chain PEM (optional)</FieldLabel>
                <TextArea {...field} />
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="privateKeyPem"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel>Private Key PEM (optional)</FieldLabel>
                <TextArea {...field} />
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
        </>
      )}
    </FieldGroup>
  );

  const renderEntriesTable = () => (
    <Table
      containerClassName="max-h-80 thin-scrollbar overflow-auto"
      style={{
        minWidth:
          ENTRY_BASE_WIDTH +
          (hasApplication ? ENTRY_PROFILE_WIDTH : 0) +
          (referenceColumnLabel ? ENTRY_REF_WIDTH : 0)
      }}
    >
      <TableHeader>
        <TableRow>
          <TableHead className={`w-12 ${STICKY_HEAD}`}>
            <Checkbox
              id="select-all-entries"
              variant="project"
              isChecked={
                Boolean(selectableEntries.length) && selected.size === selectableEntries.length
              }
              onCheckedChange={() =>
                setSelected((prev) =>
                  prev.size === selectableEntries.length
                    ? new Set()
                    : new Set(selectableEntries.map((entry) => entry.fingerprintSha256))
                )
              }
            />
          </TableHead>
          <TableHead className={`min-w-44 ${STICKY_HEAD}`}>SAN / CN</TableHead>
          <TableHead className={`w-20 ${STICKY_HEAD}`}>Private Key</TableHead>
          <TableHead className={`w-16 ${STICKY_HEAD}`}>Chain</TableHead>
          {hasApplication && (
            <TableHead className={`w-56 ${STICKY_HEAD}`}>Certificate Profile</TableHead>
          )}
          {referenceColumnLabel && (
            <TableHead className={`w-56 ${STICKY_HEAD}`}>{referenceColumnLabel}</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {selectableEntries.map((entry) => (
          <KeystoreEntryRow
            key={entry.fingerprintSha256}
            entry={entry}
            isImported={importedFingerprints.has(entry.fingerprintSha256)}
            isSelected={selected.has(entry.fingerprintSha256)}
            onToggle={() => toggleEntry(entry.fingerprintSha256)}
            showProfile={hasApplication}
            hasReferenceColumn={Boolean(referenceColumnLabel)}
            profileOptions={profileOptions}
            isProfilesLoading={isProfilesLoading}
            profileId={profileByFingerprint[entry.fingerprintSha256]}
            onProfileChange={(profileId) => {
              setProfileByFingerprint((prev) => {
                const next = { ...prev };
                if (profileId) next[entry.fingerprintSha256] = profileId;
                else delete next[entry.fingerprintSha256];
                return next;
              });
              setReferences((prev) => ({ ...prev, [entry.fingerprintSha256]: "" }));
            }}
            lastError={failureByFingerprint[entry.fingerprintSha256]}
            referenceValue={references[entry.fingerprintSha256]}
            onReferenceChange={(value) =>
              setReferences((prev) => ({ ...prev, [entry.fingerprintSha256]: value }))
            }
          />
        ))}
      </TableBody>
    </Table>
  );

  const renderProfileStep = () => (
    <FieldGroup>
      {hasApplication && !isKeystore && (
        <Field>
          <FieldLabel>Certificate Profile (optional)</FieldLabel>
          <FieldContent>
            <CertificateProfileSelect
              options={profileOptions}
              isLoading={isProfilesLoading}
              value={selectedProfileId}
              onChange={(profileId) => {
                setValue("profileId", profileId);
                setValue("providerReference", "");
              }}
            />
            <FieldDescription>
              Leave empty to track this certificate without renewal, reissue or revocation.
            </FieldDescription>
          </FieldContent>
        </Field>
      )}

      {reference && !isKeystore && (
        <Controller
          control={control}
          name="providerReference"
          render={({ field, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel>{reference.label}</FieldLabel>
              <FieldContent>
                <CertificateReferenceField
                  source={referenceSource}
                  value={field.value}
                  onChange={field.onChange}
                />
                <FieldDescription>{reference.description}</FieldDescription>
                {error && <FieldError>{error.message}</FieldError>}
              </FieldContent>
            </Field>
          )}
        />
      )}

      {isKeystore && selectableEntries.length > 0 && (
        <Field>
          <FieldLabel>{`${selectedEntries.length} certificate${selectedEntries.length === 1 ? "" : "s"} to import`}</FieldLabel>
          <FieldContent>{renderEntriesTable()}</FieldContent>
        </Field>
      )}
    </FieldGroup>
  );

  const renderResults = () => {
    const attempted = (entries ?? []).filter(
      (entry) =>
        importedFingerprints.has(entry.fingerprintSha256) ||
        failureByFingerprint[entry.fingerprintSha256]
    );
    return (
      <ItemGroup className="max-h-[28rem] thin-scrollbar gap-2 overflow-y-auto">
        {attempted.map((entry) => {
          const error = failureByFingerprint[entry.fingerprintSha256];
          return (
            <Item key={entry.fingerprintSha256} variant="outline" size="xs" role="listitem">
              <ItemMedia variant="icon">
                {error ? (
                  <CircleX className="text-danger" />
                ) : (
                  <CircleCheck className="text-success" />
                )}
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="truncate">{entryLabel(entry)}</ItemTitle>
                <ItemDescription className="mt-1 line-clamp-none whitespace-pre-line">
                  {error ?? "Imported"}
                </ItemDescription>
              </ItemContent>
            </Item>
          );
        })}
      </ItemGroup>
    );
  };

  const renderReviewTable = () => {
    const rows = isKeystore
      ? selectedEntries.map((entry) => ({
          key: entry.fingerprintSha256,
          name: entryLabel(entry),
          serialNumber: entry.serialNumber,
          hasChain: Boolean(entry.chainPem),
          hasPrivateKey: Boolean(entry.privateKeyPem),
          profileName: profileFor(entry.fingerprintSha256)?.slug,
          referenceValue: references[entry.fingerprintSha256]
        }))
      : [
          {
            key: "pem",
            name: pemSummary?.altNames || pemSummary?.commonName || pemSummary?.subject || "—",
            serialNumber: pemSummary?.serialNumber ?? "",
            hasChain: Boolean(getValues("chainPem")?.trim()),
            hasPrivateKey: Boolean(getValues("privateKeyPem")?.trim()),
            profileName: selectedProfile?.slug,
            referenceValue: getValues("providerReference")
          }
        ];

    const reviewReferenceLabel = isKeystore ? referenceColumnLabel : (reference?.label ?? null);

    return (
      <Table
        containerClassName="max-h-96 thin-scrollbar overflow-auto"
        style={{
          minWidth:
            REVIEW_BASE_WIDTH +
            (hasApplication ? REVIEW_PROFILE_WIDTH : 0) +
            (reviewReferenceLabel ? REVIEW_REF_WIDTH : 0)
        }}
      >
        <TableHeader>
          <TableRow>
            <TableHead className={`min-w-44 ${STICKY_HEAD}`}>SAN / CN</TableHead>
            <TableHead className={`w-44 ${STICKY_HEAD}`}>Serial Number</TableHead>
            <TableHead className={`w-16 ${STICKY_HEAD}`}>Chain</TableHead>
            <TableHead className={`w-20 ${STICKY_HEAD}`}>Private Key</TableHead>
            {hasApplication && (
              <TableHead className={`w-44 ${STICKY_HEAD}`}>Certificate Profile</TableHead>
            )}
            {reviewReferenceLabel && (
              <TableHead className={`w-40 ${STICKY_HEAD}`}>{reviewReferenceLabel}</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="max-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block truncate">{row.name}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-lg break-words">{row.name}</TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell className="max-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block truncate font-mono text-xs">{row.serialNumber}</span>
                  </TooltipTrigger>
                  <TooltipContent className="font-mono text-xs">{row.serialNumber}</TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Badge variant={row.hasChain ? "success" : "neutral"}>
                  {row.hasChain ? "Yes" : "No"}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={row.hasPrivateKey ? "success" : "neutral"}>
                  {row.hasPrivateKey ? "Yes" : "No"}
                </Badge>
              </TableCell>
              {hasApplication && (
                <TableCell className="max-w-0">
                  {row.profileName ? (
                    <span className="block truncate">{row.profileName}</span>
                  ) : (
                    <span className="text-muted/50 italic">None</span>
                  )}
                </TableCell>
              )}
              {reviewReferenceLabel && (
                <TableCell className="max-w-0">
                  <span className="block truncate font-mono text-xs">
                    {row.referenceValue || "—"}
                  </span>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const renderReviewStep = () => {
    if (isKeystore && hasRun) {
      return <ReviewSection title="Results">{renderResults()}</ReviewSection>;
    }

    if (!isKeystore && pemError) {
      return (
        <ReviewSection title="Import Failed">
          <Item variant="outline" size="xs" role="listitem">
            <ItemMedia variant="icon">
              <CircleX className="text-danger" />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemDescription className="line-clamp-none whitespace-pre-line">
                {pemError}
              </ItemDescription>
            </ItemContent>
          </Item>
        </ReviewSection>
      );
    }

    return (
      <ReviewSection title={isKeystore ? "Certificates" : "Certificate"}>
        {renderReviewTable()}
      </ReviewSection>
    );
  };

  const isSourceIncomplete = isKeystore && !keystoreFiles.length;
  const hasNothingToImport = isKeystore && selectedEntries.length === 0;

  const isImporting = isImportingPem || isImportingEntries || isSubmitting;

  const submitLabel = (() => {
    if (!isKeystore) return "Import";
    if (hasRun && selectedEntries.length) return `Retry ${selectedEntries.length}`;
    return `Import ${selectedEntries.length}`;
  })();

  const allKeystoreDone = isKeystore && hasRun && selectableEntries.length === 0;

  const clearLastRun = () => {
    if (isKeystore && !selectableEntries.length) return;
    setPemError(null);
    setHasRun(false);
  };

  const onSubmit = async () => {
    if (allKeystoreDone) {
      handlePopUpToggle("certificateImport", false);
      return;
    }
    if (isKeystore) {
      await importKeystore();
      return;
    }
    await handleSubmit(importPem, onFormInvalid)();
  };

  return (
    <CertificateWizardSheet
      isOpen={isOpen}
      onOpenChange={(open) => handlePopUpToggle("certificateImport", open)}
      icon={<Upload className="size-5" />}
      title="Import Certificate"
      description="Bring a certificate you already hold under Infisical management."
      steps={steps}
      activeStep={step}
      onStepChange={(index) => {
        clearLastRun();
        setStep(index);
      }}
      submitLabel={allKeystoreDone ? "Done" : submitLabel}
      onSubmit={onSubmit}
      onBack={() => {
        clearLastRun();
        goBack();
      }}
      onContinue={goNext}
      isSubmitting={isImporting}
      isSubmitDisabled={!allKeystoreDone && (hasNothingToImport || isMissingReference)}
      isContinuePending={isExtracting}
      isContinueDisabled={
        (currentStepKey === "source" && (isSourceIncomplete || isExtracting)) ||
        (currentStepKey === "profile" && (hasNothingToImport || isMissingReference))
      }
    >
      {currentStepKey === "source" && renderSourceStep()}
      {currentStepKey === "profile" && renderProfileStep()}
      {currentStepKey === "review" && renderReviewStep()}
    </CertificateWizardSheet>
  );
};
