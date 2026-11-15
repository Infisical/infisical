import { useId, useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Textarea } from "@infisical/cipher/ui/textarea";
import * as x509 from "@peculiar/x509";
import { differenceInCalendarDays, format } from "date-fns";

import { CrossSignedCertificatesUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { ProjectPermissionCertificateAuthorityActions } from "@app/context/ProjectPermissionContext/types";
import { downloadTxtFile } from "@app/helpers/download";
import { CaStatus } from "@app/hooks/api/ca/enums";
import type {
  TCaCrossSignedCertificate,
  TInternalCertificateAuthority
} from "@app/hooks/api/ca/types";

import { errorMessage, failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license/useUpgradeGate";
import { caBlock, useCaScope } from "../CertificateAuthoritiesPage/scope";

const EXPIRY_WARNING_DAYS = 30;
const PEM_CERTIFICATE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

const utcDate = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

const parse = (pem: string) => {
  try {
    return new x509.X509Certificate(pem);
  } catch {
    return null;
  }
};

const commonName = (name: x509.Name, fallback: string) => name.getField("CN")[0] ?? fallback;

const summarize = (crossSigned: TCaCrossSignedCertificate) => {
  const cert = new x509.X509Certificate(crossSigned.certificate);
  const chain = crossSigned.certificateChain.match(PEM_CERTIFICATE) ?? [];
  const topPem = chain[chain.length - 1];
  const top = topPem ? new x509.X509Certificate(topPem) : null;
  const notBefore = new Date(crossSigned.notBefore);
  const notAfter = new Date(crossSigned.notAfter);
  const now = new Date();
  const issuerName = commonName(cert.issuerName, crossSigned.issuer);
  const topName = top ? commonName(top.subjectName, top.subject) : null;
  return {
    issuerName,
    chainRootName: top && top.subject !== cert.issuer ? topName : null,
    trustedRootName: topName ?? issuerName,
    notBefore,
    notAfter,
    daysLeft: differenceInCalendarDays(notAfter, now),
    isExpired: notAfter <= now,
    isNotYetValid: notBefore > now
  };
};

type Summary = ReturnType<typeof summarize>;

const expiresIn = (days: number) => {
  if (days <= 0) return "Expires today";
  return days === 1 ? "Expires in 1 day" : `Expires in ${days} days`;
};

const statusOf = (summary: Summary) => {
  const root = summary.trustedRootName;
  if (summary.isExpired)
    return {
      tone: "bad" as const,
      label: "Expired",
      alert: {
        title: `Expired on ${utcDate(summary.notAfter)}`,
        body: `Clients that only trust ${root} no longer trust certificates from this CA and the CAs under it, including ones already issued. Import a new cross-signed certificate, then renew the certificates those clients use.`
      }
    };
  if (summary.isNotYetValid) {
    const from = utcDate(summary.notBefore);
    return {
      tone: "warn" as const,
      label: `Not valid until ${from}`,
      alert: {
        title: "Not valid yet",
        body: `New certificates from this CA and the CAs under it carry it from ${from}. Until then, clients that only trust ${root} won't trust them.`
      }
    };
  }
  if (summary.daysLeft <= EXPIRY_WARNING_DAYS)
    return {
      tone: "warn" as const,
      label: expiresIn(summary.daysLeft),
      alert: {
        title: "Replace before it expires",
        body: `It expires on ${utcDate(summary.notAfter)}. After that, clients that only trust ${root} stop trusting certificates from this CA and the CAs under it, including ones already issued. Replace it, then renew certificates that are valid past that date.`
      }
    };
  return { tone: "ok" as const, label: "Active", alert: null };
};

const check = (certificatePem: string, chainPem: string, caPem: string, caName: string) => {
  const cert = parse(certificatePem);
  const ca = parse(caPem);
  if (!cert || !ca) return null;
  const firstChainPem = chainPem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/
  )?.[0];
  const firstChain = firstChainPem ? parse(firstChainPem) : null;
  const sameSubject = cert.subject === ca.subject;
  const sameKey = cert.publicKey.equal(ca.publicKey);
  const issuerName = cert.issuerName.getField("CN")[0] ?? cert.issuer;
  const notAfter = utcDate(cert.notAfter);
  const notYetValid = cert.notBefore > new Date();
  const isCa = Boolean(cert.getExtension(x509.BasicConstraintsExtension)?.ca);
  const signer = () => {
    if (cert.equal(ca))
      return {
        passed: false,
        text: "This is the CA's own certificate. Import the cross-signed certificate your old CA signed."
      };
    if (cert.notAfter <= new Date()) return { passed: false, text: `Expired on ${notAfter}` };
    return {
      passed: true,
      text: notYetValid
        ? `Signed by ${issuerName}, valid from ${utcDate(cert.notBefore)} until ${notAfter}`
        : `Signed by ${issuerName}, valid until ${notAfter}`
    };
  };
  const items: { passed: boolean; text: string; fixedByCsr?: boolean }[] = [
    ...((certificatePem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length > 1
      ? [
          {
            passed: false,
            text: "Paste only the cross-signed certificate here. Put the rest in Certificate chain."
          }
        ]
      : []),
    sameSubject
      ? { passed: true, text: `Same subject as ${caName}` }
      : { passed: false, text: "Different subject", fixedByCsr: true },
    sameKey
      ? { passed: true, text: `Same key as ${caName}` }
      : { passed: false, text: "Different key", fixedByCsr: true },
    isCa
      ? { passed: true, text: "CA certificate" }
      : {
          passed: false,
          text: "Not a CA certificate. Have the old CA sign the CSR as a CA certificate."
        },
    signer(),
    ...(firstChain && firstChain.subject !== cert.issuer
      ? [
          {
            passed: false,
            text: `Certificate chain doesn't start with ${issuerName}, the CA that signed this certificate`
          }
        ]
      : [])
  ];
  return {
    items,
    matchingCa: sameSubject && sameKey,
    notYetValidFrom: notYetValid ? utcDate(cert.notBefore) : null,
    fixedByCsr: items.some((item) => !item.passed && item.fixedByCsr),
    passed: items.every((item) => item.passed)
  };
};

const CsrDialog = ({
  ca,
  open,
  onClose
}: {
  ca: TInternalCertificateAuthority;
  open: boolean;
  onClose: () => void;
}) => {
  const {
    data: csr,
    isPending,
    error
  } = useV4Adapter("certificateAuthorities").useCaCsr(ca.id, undefined, { enabled: open });
  const subject = useMemo(() => (csr ? new x509.Pkcs10CertificateRequest(csr).subject : ""), [csr]);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate CSR</DialogTitle>
          <DialogDescription>Have your old CA sign this CSR as a CA certificate.</DialogDescription>
        </DialogHeader>
        {isPending && !error && <Loader label="Generating CSR" />}
        {Boolean(error) && (
          <Alert tone="bad" title="Couldn't generate a CSR">
            {errorMessage(error) ?? "Try again."}
          </Alert>
        )}
        {csr && (
          <Stack gap={16}>
            <DataList
              variant="props"
              density="compact"
              items={[["Subject", <code key="subject">{subject}</code>]]}
            />
            <Field label="CSR" wide>
              <Snippet label="CSR" value={csr} maxLines={8} size="sm" />
            </Field>
          </Stack>
        )}
        <DialogFooter>
          <Button
            variant="primary"
            icon="download"
            disabledReason={csr ? undefined : "The CSR isn't ready yet"}
            onClick={() => csr && downloadTxtFile(`${ca.name}.csr`, csr)}
          >
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type CheckResult = NonNullable<ReturnType<typeof check>>;

const checkTitle = (result: CheckResult, caName: string, hasChain: boolean) => {
  if (result.passed) return hasChain ? "Ready to import" : "Add the certificate chain to import";
  return result.matchingCa
    ? "This certificate can't be imported"
    : `This certificate isn't for ${caName}`;
};

const importBlock = (result: CheckResult | null, hasChain: boolean, serverError?: string) => {
  if (!result?.passed) return "Paste a cross-signed certificate that passes every check";
  if (!hasChain) return "Add the certificate chain";
  return serverError ? "Fix the certificate and try again" : undefined;
};

const CheckAlert = ({
  result,
  caName,
  hasChain
}: {
  result: CheckResult;
  caName: string;
  hasChain: boolean;
}) => (
  <Alert tone={result.passed ? "ok" : "bad"} title={checkTitle(result, caName, hasChain)}>
    <Stack gap={4}>
      {result.fixedByCsr && <span>Have the old CA sign the CSR from this CA.</span>}
      {result.items.map((item) => (
        <Inline key={item.text} gap={8} align="center">
          <Icon name={item.passed ? "check" : "x"} />
          {item.text}
        </Inline>
      ))}
    </Stack>
  </Alert>
);

const ImportFeedback = ({
  serverError,
  unreadable,
  result,
  replacing,
  caName,
  hasChain
}: {
  serverError?: string;
  unreadable: boolean;
  result: CheckResult | null;
  replacing: boolean;
  caName: string;
  hasChain: boolean;
}) => {
  if (serverError)
    return (
      <Alert tone="bad" title="Couldn't import this certificate">
        {serverError}
      </Alert>
    );
  if (unreadable)
    return (
      <Alert tone="bad" title="Couldn't read this certificate">
        Paste a PEM certificate that starts with -----BEGIN CERTIFICATE-----.
      </Alert>
    );
  if (!result) return null;
  const from = result.passed && replacing ? result.notYetValidFrom : null;
  return (
    <>
      <CheckAlert result={result} caName={caName} hasChain={hasChain} />
      {from && (
        <Alert tone="warn" title={`Not valid until ${from}`}>
          {`Replacing removes the current cross-signed certificate now. Until ${from}, new certificates from this CA and the CAs under it won't carry one, so clients that only trust the old root won't trust them.`}
        </Alert>
      )}
    </>
  );
};

const ImportFields = ({
  certificate,
  chain,
  prefilled,
  onCertificateChange,
  onChainChange
}: {
  certificate: string;
  chain: string;
  prefilled: boolean;
  onCertificateChange: (value: string) => void;
  onChainChange: (value: string) => void;
}) => (
  <>
    <Field label="Cross-signed certificate" wide>
      <Textarea
        value={certificate}
        mono
        rows={6}
        spellCheck={false}
        placeholder="-----BEGIN CERTIFICATE-----"
        onChange={(event) => onCertificateChange(event.target.value)}
      />
    </Field>
    <Field
      label="Certificate chain"
      description={
        prefilled
          ? "Prefilled with the current chain. Replace it if a different CA signed the new certificate."
          : "The old CA's certificates, from the CA that signed the cross-signed certificate up to its root."
      }
      wide
    >
      <Textarea
        value={chain}
        mono
        rows={4}
        spellCheck={false}
        placeholder="-----BEGIN CERTIFICATE-----"
        onChange={(event) => onChainChange(event.target.value)}
      />
    </Field>
  </>
);

const useCrossSignedDraft = (
  ca: TInternalCertificateAuthority,
  replacing: boolean,
  currentChain?: string
) => {
  const { data: caCert } = useV4Adapter("certificateAuthorities").useCaCert(ca.id);
  const initialChain = replacing ? (currentChain ?? "") : "";
  const [certificate, setCertificate] = useState("");
  const [chain, setChain] = useState<string>();
  const [serverError, setServerError] = useState<string>();
  const chainValue = chain ?? initialChain;
  const certificateText = certificate.trim();
  const chainText = chainValue.trim();
  const result = useMemo(
    () =>
      certificateText && caCert
        ? check(certificateText, chainText, caCert.certificate, ca.name)
        : null,
    [certificateText, chainText, caCert, ca.name]
  );
  const reset = () => {
    setCertificate("");
    setChain(undefined);
    setServerError(undefined);
  };
  return {
    certificate,
    chainValue,
    certificateText,
    chainText,
    result,
    unreadable: Boolean(certificateText && caCert && !result),
    dirty: Boolean(certificate) || chainValue !== initialChain,
    serverError,
    setServerError,
    setCertificate: (value: string) => {
      setServerError(undefined);
      setCertificate(value);
    },
    setChain: (value: string) => {
      setServerError(undefined);
      setChain(value);
    },
    reset
  };
};

const ImportDialog = ({
  ca,
  replacing,
  currentChain,
  open,
  onClose
}: {
  ca: TInternalCertificateAuthority;
  replacing: boolean;
  currentChain?: string;
  open: boolean;
  onClose: () => void;
}) => {
  const importCert = useV4Adapter("certificateAuthorities").useImportCaCrossSignedCert();
  const formId = useId();
  const draft = useCrossSignedDraft(ca, replacing, currentChain);
  const [discarding, setDiscarding] = useState(false);
  const action = replacing ? "Replace" : "Import";

  const close = () => {
    draft.reset();
    onClose();
  };

  const requestClose = () => (draft.dirty ? setDiscarding(true) : close());

  const submit = async () => {
    draft.setServerError(undefined);
    try {
      await importCert.mutateAsync({
        caId: ca.id,
        certificate: draft.certificateText,
        certificateChain: draft.chainText
      });
      saved(`Cross-signed certificate ${replacing ? "replaced" : "imported"}`);
      close();
    } catch (error) {
      draft.setServerError(errorMessage(error) ?? "Check the certificate and try again.");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && !importCert.isPending && requestClose()}>
        <DialogContent pending={importCert.isPending}>
          <DialogHeader>
            <DialogTitle>{`${action} cross-signed certificate`}</DialogTitle>
            <DialogDescription>
              Paste the certificate your old CA signed from this CA&apos;s CSR.
            </DialogDescription>
          </DialogHeader>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <ImportFields
                certificate={draft.certificate}
                chain={draft.chainValue}
                prefilled={replacing && Boolean(currentChain)}
                onCertificateChange={draft.setCertificate}
                onChainChange={draft.setChain}
              />
              <ImportFeedback
                serverError={draft.serverError}
                unreadable={draft.unreadable}
                result={draft.result}
                replacing={replacing}
                caName={ca.name}
                hasChain={Boolean(draft.chainText)}
              />
            </Stack>
          </form>
          <DialogFooter>
            <Button
              variant="primary"
              type="submit"
              form={formId}
              loading={importCert.isPending}
              disabledReason={importBlock(
                draft.result,
                Boolean(draft.chainText),
                draft.serverError
              )}
            >
              {action}
            </Button>
            <Button variant="outline" disabled={importCert.isPending} onClick={requestClose}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        open={discarding}
        onOpenChange={setDiscarding}
        onDiscard={() => {
          setDiscarding(false);
          close();
        }}
        description="The certificate you pasted will be lost."
      />
    </>
  );
};

const RemoveDialog = ({
  ca,
  trustedRootName,
  open,
  onClose
}: {
  ca: TInternalCertificateAuthority;
  trustedRootName: string;
  open: boolean;
  onClose: () => void;
}) => {
  const remove = useV4Adapter("certificateAuthorities").useDeleteCaCrossSignedCert();
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" pending={remove.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove cross-signed certificate?</AlertDialogTitle>
          <AlertDialogDescription>
            {`Clients that only trust ${trustedRootName} won't trust new certificates from ${ca.name} or the CAs under it. Certificates already issued don't change.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={remove.isPending}
            onClick={async (event) => {
              event.preventDefault();
              try {
                await remove.mutateAsync({ caId: ca.id });
                saved("Cross-signed certificate removed");
                onClose();
              } catch (error) {
                failed("Could not remove the cross-signed certificate", error);
              }
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

type Popup = "csr" | "import" | "remove";

const useCrossSignedBlocks = (ca: TInternalCertificateAuthority) => {
  const { permission } = useCaScope();
  const active = ca.status === CaStatus.ACTIVE;
  const inactive = active ? undefined : "Enable this CA first";
  const csrBlock =
    inactive ??
    (caBlock(permission, ProjectPermissionCertificateAuthorityActions.Create, ca.name) &&
      "You don't have permission to generate a CSR for this CA");
  const manageBlock =
    caBlock(permission, ProjectPermissionCertificateAuthorityActions.IssueCACertificate, ca.name) ??
    caBlock(permission, ProjectPermissionCertificateAuthorityActions.Edit, ca.name);
  return { csrBlock: csrBlock || undefined, manageBlock, replaceBlock: inactive ?? manageBlock };
};

type Blocks = ReturnType<typeof useCrossSignedBlocks>;

const CrossSignedMenu = ({
  ca,
  crossSigned,
  blocks,
  onOpen
}: {
  ca: TInternalCertificateAuthority;
  crossSigned: TCaCrossSignedCertificate;
  blocks: Blocks;
  onOpen: (popup: Popup) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" icon="more" iconOnly>
        Cross-signed certificate options
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        onSelect={() => downloadTxtFile(`${ca.name}-cross-signed.pem`, crossSigned.certificate)}
      >
        <Icon name="download" />
        Download certificate
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() =>
          downloadTxtFile(`${ca.name}-cross-signed-chain.pem`, crossSigned.certificateChain)
        }
      >
        <Icon name="download" />
        Download certificate chain
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabledReason={blocks.csrBlock} onSelect={() => onOpen("csr")}>
        <Icon name="file" />
        Generate CSR
      </DropdownMenuItem>
      <DropdownMenuItem disabledReason={blocks.replaceBlock} onSelect={() => onOpen("import")}>
        <Icon name="upload" />
        Replace
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabledReason={blocks.manageBlock}
        onSelect={() => onOpen("remove")}
      >
        <Icon name="trash" />
        Remove
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const CrossSignedEmpty = ({
  blocks,
  onOpen
}: {
  blocks: Blocks;
  onOpen: (popup: Popup) => void;
}) => (
  <EmptyState
    size="sm"
    media="bare"
    icon="cert"
    title="No cross-signed certificate"
    description="Have your old CA sign a copy of this CA's certificate so clients that only trust the old CA accept its certificates."
    actions={
      <>
        <Button
          variant="outline"
          icon="file"
          disabledReason={blocks.csrBlock}
          onClick={() => onOpen("csr")}
        >
          Generate CSR
        </Button>
        <Button
          variant="primary"
          icon="upload"
          disabledReason={blocks.manageBlock}
          onClick={() => onOpen("import")}
        >
          Import certificate
        </Button>
      </>
    }
  />
);

const CrossSignedSummary = ({
  crossSigned,
  summary
}: {
  crossSigned: TCaCrossSignedCertificate;
  summary: Summary;
}) => {
  const status = statusOf(summary);
  return (
    <Stack gap={16}>
      {status.alert && (
        <Alert tone={status.tone} title={status.alert.title}>
          {status.alert.body}
        </Alert>
      )}
      <DataList
        variant="props"
        density="compact"
        items={[
          ["Signed by", summary.issuerName, { span: "half" }],
          [
            "Status",
            <Badge key="status" size="sm" tone={status.tone} dot>
              {status.label}
            </Badge>,
            { span: "half" }
          ],
          ["Not before", format(summary.notBefore, "yyyy-MM-dd"), { span: "half" }],
          ["Not after", format(summary.notAfter, "yyyy-MM-dd"), { span: "half" }],
          ["Serial number", <code key="serial">{crossSigned.serialNumber.toUpperCase()}</code>],
          ...(summary.chainRootName ? [["Chain root", summary.chainRootName] as const] : [])
        ]}
      />
    </Stack>
  );
};

const CrossSignedBody = ({
  crossSigned,
  summary,
  isPending,
  error,
  blocks,
  onOpen
}: {
  crossSigned?: TCaCrossSignedCertificate | null;
  summary: Summary | null;
  isPending: boolean;
  error: unknown;
  blocks: Blocks;
  onOpen: (popup: Popup) => void;
}) => {
  if (isPending) return <Loader label="Loading cross-signed certificate" />;
  if (error)
    return (
      <Alert tone="bad" title="Couldn't load the cross-signed certificate">
        {errorMessage(error) ?? "Try again."}
      </Alert>
    );
  if (!crossSigned || !summary) return <CrossSignedEmpty blocks={blocks} onOpen={onOpen} />;
  return <CrossSignedSummary crossSigned={crossSigned} summary={summary} />;
};

export const CrossSignedCertificateCard = ({
  ca,
  entitled,
  docs
}: {
  ca: TInternalCertificateAuthority;
  entitled: boolean;
  docs: string;
}) => {
  const {
    data: crossSigned,
    isPending,
    error
  } = useV4Adapter("certificateAuthorities").useCaCrossSignedCert(ca.id, true);
  const blocks = useCrossSignedBlocks(ca);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [popup, setPopup] = useState<Popup>();
  const summary = useMemo(() => (crossSigned ? summarize(crossSigned) : null), [crossSigned]);
  if (ca.status !== CaStatus.ACTIVE && !crossSigned) return null;

  const open = (next: Popup) => {
    if (next === "import" && !entitled) {
      openUpgradeGate({
        intent: CrossSignedCertificatesUpgradeIntent,
        paywallKey: "cert-manager.cross-signed-certificates"
      });
      return;
    }
    setPopup(next);
  };

  return (
    <>
      <Card
        variant="framed"
        title="Cross-signed certificate"
        badges={
          !entitled && (
            <Badge size="sm" tone="info">
              Enterprise
            </Badge>
          )
        }
        hint="Keeps clients that trust your old CA working while you migrate."
        action={
          crossSigned ? (
            <CrossSignedMenu ca={ca} crossSigned={crossSigned} blocks={blocks} onOpen={open} />
          ) : (
            <Button variant="link" size="sm" asChild>
              <a href={docs} target="_blank" rel="noreferrer">
                Docs
              </a>
            </Button>
          )
        }
      >
        <CrossSignedBody
          crossSigned={crossSigned}
          summary={summary}
          isPending={isPending}
          error={error}
          blocks={blocks}
          onOpen={open}
        />
      </Card>
      <CsrDialog ca={ca} open={popup === "csr"} onClose={() => setPopup(undefined)} />
      <ImportDialog
        key={crossSigned?.serialNumber ?? "none"}
        ca={ca}
        replacing={Boolean(crossSigned)}
        currentChain={crossSigned?.certificateChain}
        open={popup === "import"}
        onClose={() => setPopup(undefined)}
      />
      <RemoveDialog
        ca={ca}
        trustedRootName={summary?.trustedRootName ?? "the old root"}
        open={popup === "remove"}
        onClose={() => setPopup(undefined)}
      />
      {upgradeGate}
    </>
  );
};
