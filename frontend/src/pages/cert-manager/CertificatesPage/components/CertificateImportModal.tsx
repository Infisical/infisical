import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  useExtractPkcs12,
  useGetCert,
  useImportCertificate,
  useImportPkcs12Entries
} from "@app/hooks/api";
import { TPkcs12Entry } from "@app/hooks/api/certificates/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

const MAX_KEYSTORE_BYTES = 1024 * 1024;

const schema = z.object({
  certificatePem: z.string().trim().min(1, "Certificate PEM is required"),
  privateKeyPem: z.string().trim().optional(),
  chainPem: z.string().trim().optional()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["certificateImport"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["certificateImport"]>,
    state?: boolean
  ) => void;
  applicationId?: string;
};

type TCertificateDetails = {
  serialNumber: string;
  certificate: string;
  certificateChain?: string;
  privateKey?: string;
};

type TImportOutcome = {
  subject: string;
  error?: string;
};

// Reading the file in one go and spreading it into String.fromCharCode overflows the call stack
// around a megabyte, which is inside the size we accept.
const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
};

const entryLabel = (entry: TPkcs12Entry) => entry.commonName || entry.alias || entry.subject;

export const CertificateImportModal = ({ popUp, handlePopUpToggle, applicationId }: Props) => {
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const { data: cert } = useGetCert(
    (popUp?.certificateImport?.data as { serialNumber: string })?.serialNumber || ""
  );

  const { mutateAsync: importCertificate } = useImportCertificate();
  const { mutateAsync: extractPkcs12, isPending: isExtracting } = useExtractPkcs12();
  const { mutateAsync: importEntries, isPending: isImportingEntries } = useImportPkcs12Entries();

  const [keystoreFiles, setKeystoreFiles] = useState<File[]>([]);
  const [keystorePassword, setKeystorePassword] = useState("");
  const [keystoreError, setKeystoreError] = useState<string | null>(null);
  const [entries, setEntries] = useState<TPkcs12Entry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<TImportOutcome[] | null>(null);
  const [format, setFormat] = useState<"pem" | "pkcs12">("pem");

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  // Prefilling from a keystore calls reset(values), which makes those values the form's new
  // defaults — so a bare reset() would restore the previous keystore's certificate and private key
  // instead of clearing them.
  const clearFields = () => reset({ certificatePem: "", chainPem: "", privateKeyPem: "" });

  const resetAll = () => {
    clearFields();
    setCertificateDetails(null);
    setKeystoreFiles([]);
    setKeystorePassword("");
    setKeystoreError(null);
    setEntries(null);
    setSelected(new Set());
    setOutcomes(null);
    setFormat("pem");
  };

  const onFormSubmit = async ({ certificatePem, privateKeyPem, chainPem }: FormData) => {
    const trimmedPrivateKey = privateKeyPem?.trim();
    const trimmedChain = chainPem?.trim();
    const { serialNumber, certificate, certificateChain, privateKey } = await importCertificate({
      certificatePem,
      ...(trimmedPrivateKey ? { privateKeyPem: trimmedPrivateKey } : {}),
      ...(trimmedChain ? { chainPem: trimmedChain } : {}),
      applicationId
    });

    clearFields();

    setCertificateDetails({
      serialNumber,
      certificate,
      certificateChain,
      privateKey
    });

    createNotification({
      text: "Successfully imported certificate",
      type: "success"
    });
  };

  const handleExtract = async () => {
    const file = keystoreFiles[0];
    if (!file) return;

    setKeystoreError(null);

    if (file.size > MAX_KEYSTORE_BYTES) {
      setKeystoreError(
        "This file is larger than 1 MB, which is bigger than any keystore we expect."
      );
      return;
    }

    try {
      const result = await extractPkcs12({
        pkcs12: toBase64(await file.arrayBuffer()),
        password: keystorePassword,
        applicationId
      });

      setEntries(result.entries);
      setSelected(new Set(result.entries.map((entry) => entry.fingerprintSha256)));
    } catch (err) {
      setKeystoreError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not read this keystore."
      );
    }
  };

  const handleImportSelected = async () => {
    if (!entries) return;

    const results = await importEntries({
      entries: entries.filter((entry) => selected.has(entry.fingerprintSha256)),
      applicationId
    });

    setOutcomes(
      results.map((result) => ({ subject: entryLabel(result.entry), error: result.error }))
    );

    const imported = results.filter((result) => !result.error).length;
    if (imported) {
      createNotification({
        text: `Imported ${imported} of ${results.length} certificates`,
        type: "success"
      });
    }
  };

  const toggleEntry = (fingerprint: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fingerprint)) next.delete(fingerprint);
      else next.add(fingerprint);
      return next;
    });
  };

  const isOpen = Boolean(popUp?.certificateImport?.isOpen);
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    // Radix fires onOpenChange only for interactions it owns, so a dialog closed by one of our own
    // buttons never reaches the handler below. Clearing on the way in covers every close path.
    if (isOpen && !wasOpen.current) resetAll();
    wasOpen.current = isOpen;
  });

  const pemFieldsDisabled = Boolean(cert);

  const renderPemFields = () => (
    <FieldGroup>
      <Controller
        control={control}
        defaultValue=""
        name="certificatePem"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel>Leaf Certificate PEM</FieldLabel>
            <TextArea {...field} disabled={pemFieldsDisabled} />
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
      <Controller
        control={control}
        defaultValue=""
        name="chainPem"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel>Certificate Chain PEM (optional)</FieldLabel>
            <TextArea {...field} disabled={pemFieldsDisabled} />
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
      <Controller
        control={control}
        defaultValue=""
        name="privateKeyPem"
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel>Private Key PEM (optional)</FieldLabel>
            <TextArea {...field} disabled={pemFieldsDisabled} />
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
    </FieldGroup>
  );

  const failures = outcomes?.filter((outcome) => outcome.error) ?? [];

  // Every entry the user selected gets a row, and every row carries a description, so a success and
  // a failure are the same shape and nothing is left to infer.
  const renderOutcomes = () => (
    <ItemGroup className="gap-2">
      {outcomes?.map((outcome, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Item key={index} variant="outline" size="xs" role="listitem">
          <ItemMedia variant="icon">
            {outcome.error ? (
              <CircleX className="text-danger" />
            ) : (
              <CircleCheck className="text-success" />
            )}
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="truncate">{outcome.subject}</ItemTitle>
            <ItemDescription>{outcome.error ?? "Imported"}</ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );

  const renderEntriesTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox
              id="select-all-entries"
              variant="project"
              isChecked={Boolean(entries?.length) && selected.size === entries?.length}
              onCheckedChange={() =>
                setSelected((prev) =>
                  prev.size === entries?.length
                    ? new Set()
                    : new Set(entries?.map((entry) => entry.fingerprintSha256))
                )
              }
            />
          </TableHead>
          <TableHead>Subject</TableHead>
          <TableHead className="w-40">Key</TableHead>
          <TableHead className="w-24">Chain</TableHead>
          <TableHead className="w-44">Expires</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries?.map((entry) => (
          <TableRow
            key={entry.fingerprintSha256}
            className="cursor-pointer"
            onClick={() => toggleEntry(entry.fingerprintSha256)}
          >
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Checkbox
                id={entry.fingerprintSha256}
                variant="project"
                isChecked={selected.has(entry.fingerprintSha256)}
                onCheckedChange={() => toggleEntry(entry.fingerprintSha256)}
              />
            </TableCell>
            <TableCell className="max-w-0">
              <div className="truncate">{entryLabel(entry)}</div>
            </TableCell>
            <TableCell>{entry.privateKeyPem ? entry.keyAlgorithm : "—"}</TableCell>
            <TableCell>
              {entry.chainWarning ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 text-warning">
                      <TriangleAlert className="size-3.5" />0
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{entry.chainWarning}</TooltipContent>
                </Tooltip>
              ) : (
                (entry.chainPem?.split("BEGIN CERTIFICATE").length ?? 1) - 1
              )}
            </TableCell>
            <TableCell>{new Date(entry.notAfter).toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const renderKeystorePicker = () => (
    <FieldGroup>
      <Field data-invalid={Boolean(keystoreError)}>
        <FieldLabel>Keystore file</FieldLabel>
        <FileDropzone
          accept=".p12,.pfx"
          description=".p12 or .pfx keystore, up to 1 MB"
          files={keystoreFiles}
          onFilesSelect={(files) => {
            setKeystoreFiles(files.slice(0, 1));
            setKeystoreError(null);
          }}
          onFileRemove={() => {
            setKeystoreFiles([]);
            setKeystoreError(null);
          }}
        />
      </Field>
      <Field>
        <FieldLabel>Password</FieldLabel>
        <Input
          type="password"
          autoComplete="off"
          value={keystorePassword}
          onChange={(e) => setKeystorePassword(e.target.value)}
          placeholder="Leave blank if the keystore has no password"
        />
      </Field>
      {/* The failure can belong to either field above (a file we cannot read, a password that does
          not open it), so it is reported once for the pair rather than under one of them. */}
      {keystoreError && (
        <Field data-invalid>
          <FieldError>{keystoreError}</FieldError>
        </Field>
      )}
      <div>
        <Button
          variant="project"
          isDisabled={!keystoreFiles.length || isExtracting}
          isPending={isExtracting}
          onClick={handleExtract}
        >
          Read keystore
        </Button>
      </div>
    </FieldGroup>
  );

  const renderBody = () => {
    if (certificateDetails) {
      return (
        <CertificateContent
          serialNumber={certificateDetails.serialNumber}
          certificate={certificateDetails.certificate}
          certificateChain={certificateDetails.certificateChain}
          privateKey={certificateDetails.privateKey}
        />
      );
    }

    if (outcomes) return renderOutcomes();

    // Viewing an existing certificate reuses this dialog, and there is nothing to import then.
    if (cert) return renderPemFields();

    return (
      <Tabs value={format} onValueChange={(value) => setFormat(value as "pem" | "pkcs12")}>
        <TabsList className="mb-2">
          <TabsTrigger value="pem">PEM</TabsTrigger>
          <TabsTrigger value="pkcs12">PKCS#12</TabsTrigger>
        </TabsList>
        <TabsContent value="pem">
          <form id="import-pem-form" onSubmit={handleSubmit(onFormSubmit)}>
            {renderPemFields()}
          </form>
        </TabsContent>
        <TabsContent value="pkcs12">
          {/* One presentation whether the keystore holds one pair or five. The certificates are
              never pushed into the PEM fields: nobody reviews base64, and the table says what each
              certificate actually is. A keystore with nothing importable is refused by the
              endpoint, so there is no empty state to render. */}
          {entries ? renderEntriesTable() : renderKeystorePicker()}
        </TabsContent>
      </Tabs>
    );
  };

  const headerContent = () => {
    if (cert) return { title: "View Certificate", description: null };
    if (certificateDetails)
      return { title: "Certificate Imported", description: "Copy or download it before closing." };
    if (outcomes) {
      const imported = outcomes.length - failures.length;
      return {
        title: "Import Results",
        description: `${imported} of ${outcomes.length} certificate${outcomes.length === 1 ? "" : "s"} imported.`
      };
    }
    if (entries)
      return {
        title: "Review & Import",
        description: `${entries.length} certificate${entries.length === 1 ? "" : "s"} found in this keystore. Choose which to import.`
      };
    return {
      title: "Import Certificate",
      description: "Import an existing certificate from PEM files or a PKCS#12 keystore."
    };
  };

  const renderFooter = () => {
    if (certificateDetails || cert) return null;

    // The keystore step has its own action in the body, and no form for a submit button to target.
    if (format === "pkcs12" && !entries) return null;

    if (outcomes) {
      return (
        <DialogFooter>
          <Button variant="project" onClick={() => handlePopUpToggle("certificateImport", false)}>
            Done
          </Button>
        </DialogFooter>
      );
    }

    if (entries) {
      return (
        <DialogFooter>
          <Button variant="outline" onClick={() => handlePopUpToggle("certificateImport", false)}>
            Cancel
          </Button>
          <Button
            variant="project"
            isDisabled={!selected.size || isImportingEntries}
            isPending={isImportingEntries}
            onClick={handleImportSelected}
          >
            {`Import ${selected.size} selected`}
          </Button>
        </DialogFooter>
      );
    }

    return (
      <DialogFooter>
        <Button variant="outline" onClick={() => handlePopUpToggle("certificateImport", false)}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="import-pem-form"
          variant="project"
          isPending={isSubmitting}
          isDisabled={isSubmitting}
        >
          Import
        </Button>
      </DialogFooter>
    );
  };

  const header = headerContent();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => handlePopUpToggle("certificateImport", nextOpen)}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{header.title}</DialogTitle>
          {header.description && <DialogDescription>{header.description}</DialogDescription>}
        </DialogHeader>
        {renderBody()}
        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
};
