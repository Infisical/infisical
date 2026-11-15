import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Stack } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Snippet } from "@infisical/cipher/ui/snippet";
import * as x509 from "@peculiar/x509";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { differenceInCalendarDays, format } from "date-fns";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCertificateAuthorityActions } from "@app/context/ProjectPermissionContext/types";
import { downloadTxtFile } from "@app/helpers/download";
import {
  CaRenewalStatus,
  CaSigningConfigType,
  CaStatus,
  CaType,
  InternalCaType
} from "@app/hooks/api/ca/enums";
import type { TCaAutoRenewalConfig, TCaSigningConfig } from "@app/hooks/api/ca/queries";
import type { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";

import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import type { CaPlan, TCaCertificateVersion } from "../../data/certificate-authorities/contract";
import { orgHref, v4Path } from "../../links";
import { InstallCaCertificateSheet } from "../CertificateAuthoritiesPage/install/install-certificate-sheet";
import { CA_DOCS, caBlock, useCaScope } from "../CertificateAuthoritiesPage/scope";
import { CaStatusBadge, DeleteCaDialog } from "../CertificateAuthoritiesPage/shared";
import { CertManagerNotSetUp } from "../components/certificate";
import { CrossSignedCertificateCard } from "./cross-signed";
import { CaDetailsCard, SubjectCard } from "./details-card";
import { GenerateRootCertificateDialog, RenewCaDialog } from "./renew-dialogs";
import { RenewalCard } from "./renewal";
import { CrlList, RevocationCard } from "./revocation";
import { SigningConfigCard } from "./signing-config";

const routeId = v4Path("/organizations/$orgId/cert-manager/ca/$caId");

const RENEWS_THROUGH_PROVIDER = new Set([
  CaSigningConfigType.VENAFI,
  CaSigningConfigType.AZURE_ADCS
]);

const INSTALLING = "Certificate installation is in progress";

const ledeOf = (ca: TInternalCertificateAuthority) => {
  if (ca.status === CaStatus.PENDING_CERTIFICATE)
    return ca.configuration.type === InternalCaType.ROOT
      ? "Pending a certificate. Generate one to start issuing."
      : "Pending a certificate. Install a signed CA certificate to start issuing.";
  if (ca.status === CaStatus.DISABLED) return "Disabled. It doesn't issue certificates.";
  if (!ca.configuration.notAfter) return undefined;
  const left = differenceInCalendarDays(new Date(ca.configuration.notAfter), new Date());
  if (left < 0) return `Expired ${-left} days ago. Renew it to keep issuing.`;
  return `Valid for ${left} more ${left === 1 ? "day" : "days"}.`;
};

const validityOf = (pem: string) => {
  try {
    const cert = new x509.X509Certificate(pem);
    return `${format(cert.notBefore, "yyyy-MM-dd")} to ${format(cert.notAfter, "yyyy-MM-dd")}`;
  } catch {
    return undefined;
  }
};

const CaCertificateRow = ({
  cert,
  current,
  caName,
  readBlock
}: {
  cert: TCaCertificateVersion;
  current: boolean;
  caName: string;
  readBlock?: string;
}) => (
  <ListRow
    value={cert.serialNumber}
    label={`CA certificate ${cert.version}`}
    media={<Icon name="cert" />}
    title={`CA certificate ${cert.version}`}
    badge={
      current && (
        <Badge size="sm" tone="info">
          Current
        </Badge>
      )
    }
    description={<code>{cert.serialNumber}</code>}
    meta={validityOf(cert.certificate)}
    actions={
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" icon="more" iconOnly>
            {`CA certificate ${cert.version} options`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabledReason={readBlock}
            onSelect={() => downloadTxtFile(`${caName}-cert-${cert.version}.pem`, cert.certificate)}
          >
            <Icon name="download" />
            Download CA certificate
          </DropdownMenuItem>
          <DropdownMenuItem
            disabledReason={readBlock}
            onSelect={() =>
              downloadTxtFile(`${caName}-chain-${cert.version}.pem`, cert.certificateChain)
            }
          >
            <Icon name="download" />
            Download certificate chain
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    }
  />
);

type Popup = "renew" | "install" | "generate" | "delete";

type Block = (action: ProjectPermissionCertificateAuthorityActions) => string | undefined;

const renewPopup = (
  ca: TInternalCertificateAuthority,
  signingConfig?: TCaSigningConfig | null
): Popup =>
  ca.configuration.type !== InternalCaType.ROOT &&
  !ca.configuration.parentCaId &&
  !RENEWS_THROUGH_PROVIDER.has(signingConfig?.type as CaSigningConfigType)
    ? "install"
    : "renew";

const primaryAction = (
  ca: TInternalCertificateAuthority,
  block: Block,
  installing: string | undefined,
  signingConfig?: TCaSigningConfig | null
) => {
  if (ca.status === CaStatus.ACTIVE)
    return {
      label: "Renew CA",
      icon: "sync" as const,
      blocked: block(ProjectPermissionCertificateAuthorityActions.IssueCACertificate) ?? installing,
      popup: renewPopup(ca, signingConfig)
    };
  if (ca.status !== CaStatus.PENDING_CERTIFICATE) return null;
  if (ca.configuration.type === InternalCaType.ROOT)
    return {
      label: "Generate certificate",
      icon: "cert" as const,
      blocked: block(ProjectPermissionCertificateAuthorityActions.Create),
      popup: "generate" as const
    };
  return {
    label: "Install CA certificate",
    icon: "download" as const,
    blocked: block(ProjectPermissionCertificateAuthorityActions.Create) ?? installing,
    popup: "install" as const
  };
};

const useBreadcrumb = (org: string) => {
  const search = useSearch({ from: routeId });
  const fromProfile = search.from === "profile" && search.profileId;
  const { data: profile } = useV4Adapter("certificateAuthorities").useCertificateProfile({
    profileId: fromProfile ? (search.profileId ?? "") : ""
  });
  if (!fromProfile)
    return { label: "Certificate authorities", href: `${org}/certificate-authorities` };
  const query = new URLSearchParams({
    ...(search.profileFrom && { from: search.profileFrom }),
    ...(search.profileApplicationName && { applicationName: search.profileApplicationName })
  });
  return {
    label: profile?.slug ?? "Certificate profile",
    href: `${org}/certificate-profiles/${search.profileId}?${query}`
  };
};

const CaHeader = ({
  ca,
  org,
  block,
  renewal,
  signingConfig,
  onPopup
}: {
  ca: TInternalCertificateAuthority;
  org: string;
  block: Block;
  renewal?: TCaAutoRenewalConfig;
  signingConfig?: TCaSigningConfig | null;
  onPopup: (popup: Popup) => void;
}) => {
  const breadcrumb = useBreadcrumb(org);
  const installing =
    renewal?.lastRenewalStatus === CaRenewalStatus.PENDING ? INSTALLING : undefined;
  const primary = primaryAction(ca, block, installing, signingConfig);
  return (
    <PageHeader
      breadcrumb={[breadcrumb]}
      title={ca.name}
      badges={<CaStatusBadge status={ca.status} />}
      description={ledeOf(ca)}
      actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button layout="trigger" variant="outline" icon="more">
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                disabledReason={block(ProjectPermissionCertificateAuthorityActions.Delete)}
                onSelect={() => onPopup("delete")}
              >
                <Icon name="trash" />
                Delete CA
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {primary && (
            <Button
              variant="primary"
              icon={primary.icon}
              disabledReason={primary.blocked}
              onClick={() => onPopup(primary.popup)}
            >
              {primary.label}
            </Button>
          )}
        </>
      }
    />
  );
};

const CaCertificatesList = ({
  ca,
  readBlock
}: {
  ca: TInternalCertificateAuthority;
  readBlock?: string;
}) => {
  const { data: certificates = [], isPending } = useV4Adapter("certificateAuthorities").useCaCerts(
    ca.id
  );
  return (
    <List
      label="CA certificates"
      title="CA certificates"
      size="sm"
      loading={isPending}
      loadingRows={2}
      empty={
        <EmptyState
          size="sm"
          media="bare"
          icon="cert"
          title="No CA certificates installed"
          description={
            ca.configuration.type === InternalCaType.ROOT
              ? "Generate a certificate to start issuing."
              : "Install a CA certificate to start issuing."
          }
        />
      }
    >
      {certificates.map((cert, index) => (
        <CaCertificateRow
          key={cert.serialNumber}
          cert={cert}
          current={index === certificates.length - 1}
          caName={ca.name}
          readBlock={readBlock}
        />
      ))}
    </List>
  );
};

const IssuerUrlCard = ({ ca }: { ca: TInternalCertificateAuthority }) => {
  const { activeCaCertId } = ca.configuration;
  if (!activeCaCertId) return null;
  return (
    <Card
      variant="framed"
      title="CA certificate distribution"
      hint="Public URL that serves this CA's active certificate."
    >
      <Snippet
        label="CA issuer URL"
        value={`${window.origin}/api/v1/cert-manager/ca/internal/${ca.id}/certificates/${activeCaCertId}/der`}
        size="sm"
      />
    </Card>
  );
};

const CaPopups = ({
  ca,
  orgId,
  popup,
  signingConfig,
  onClose
}: {
  ca: TInternalCertificateAuthority;
  orgId: string;
  popup?: Popup;
  signingConfig?: TCaSigningConfig | null;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  return (
    <>
      <RenewCaDialog
        caId={ca.id}
        signingConfig={signingConfig}
        open={popup === "renew"}
        onClose={onClose}
      />
      <GenerateRootCertificateDialog caId={ca.id} open={popup === "generate"} onClose={onClose} />
      <InstallCaCertificateSheet
        caId={ca.id}
        open={popup === "install"}
        onOpenChange={(open) => !open && onClose()}
      />
      <DeleteCaDialog
        ca={popup === "delete" ? ca : undefined}
        onClose={onClose}
        onDeleted={() =>
          navigate({
            to: v4Path("/organizations/$orgId/cert-manager/certificate-authorities"),
            params: { orgId }
          })
        }
      />
    </>
  );
};

const CaDetail = ({
  ca,
  orgId,
  plan
}: {
  ca: TInternalCertificateAuthority;
  orgId: string;
  plan?: CaPlan;
}) => {
  const { permission } = useCaScope();
  const adapter = useV4Adapter("certificateAuthorities");
  const { parentCaId } = ca.configuration;
  const { data: parent } = adapter.useCa({
    caId: parentCaId ?? "",
    type: CaType.INTERNAL,
    options: { enabled: Boolean(parentCaId) }
  });
  const pendingCertificate = ca.status === CaStatus.PENDING_CERTIFICATE;
  const renewable = ca.status === CaStatus.ACTIVE || pendingCertificate;
  const { data: signingConfig } = adapter.useCaSigningConfig(ca.id, {
    enabled: !pendingCertificate
  });
  const { data: renewal } = adapter.useCaAutoRenewal(ca.id, { enabled: renewable });
  const [popup, setPopup] = useState<Popup>();
  const org = orgHref(orgId, "/cert-manager");
  const block: Block = (action) => caBlock(permission, action, ca.name);

  return (
    <Stack gap={24}>
      <CaHeader
        ca={ca}
        org={org}
        block={block}
        renewal={renewal}
        signingConfig={signingConfig}
        onPopup={setPopup}
      />
      <DetailLayout
        asideLabel="Certificate authority details"
        aside={
          <>
            <CaDetailsCard ca={ca} org={org} parentName={parent?.name} />
            {renewal && renewable && <RenewalCard ca={ca} renewal={renewal} />}
            {signingConfig && !pendingCertificate && (
              <SigningConfigCard ca={ca} config={signingConfig} />
            )}
            <SubjectCard ca={ca} />
          </>
        }
      >
        <CaCertificatesList
          ca={ca}
          readBlock={block(ProjectPermissionCertificateAuthorityActions.Read)}
        />
        <CrossSignedCertificateCard
          ca={ca}
          entitled={Boolean(plan?.pkiCrossSignedCa)}
          docs={CA_DOCS.crossSigned}
        />
        <IssuerUrlCard ca={ca} />
        <CrlList ca={ca} plan={plan} />
        <RevocationCard ca={ca} plan={plan} />
      </DetailLayout>
      <CaPopups
        ca={ca}
        orgId={orgId}
        popup={popup}
        signingConfig={signingConfig}
        onClose={() => setPopup(undefined)}
      />
    </Stack>
  );
};

const CaDetailScreen = ({
  orgId,
  ca,
  plan,
  loading,
  hasProject
}: {
  orgId: string;
  ca?: TInternalCertificateAuthority;
  plan?: CaPlan;
  loading: boolean;
  hasProject: boolean;
}) => {
  const { permission } = useCaScope();
  if (loading) return <Loader size="page" label="Loading certificate authority" />;
  if (!hasProject) return <CertManagerNotSetUp orgId={orgId} />;
  if (!ca)
    return (
      <EmptyState
        icon="building"
        title="Certificate authority not found"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/cert-manager/certificate-authorities")}>
              Back to certificate authorities
            </a>
          </Button>
        }
      />
    );
  if (caBlock(permission, ProjectPermissionCertificateAuthorityActions.Read, ca.name))
    return <AccessRestricted />;
  return <CaDetail ca={ca} orgId={orgId} plan={plan} />;
};

export const CertAuthDetailsByIDPage = () => {
  const { orgId, caId } = useParams({ from: routeId });
  const { hasProject, isPending: scopePending } = useCaScope();
  const adapter = useV4Adapter("certificateAuthorities");
  const { data: plan } = adapter.useCaPlan(orgId);
  const { data, isPending } = adapter.useCa({
    caId,
    type: CaType.INTERNAL,
    options: { enabled: hasProject }
  });
  const ca = data?.type === CaType.INTERNAL ? data : undefined;
  return (
    <>
      <PageTitle title={ca?.name ?? "Certificate Authority"} />
      <CaDetailScreen
        orgId={orgId}
        ca={ca}
        plan={plan}
        loading={scopePending || (hasProject && isPending)}
        hasProject={hasProject}
      />
    </>
  );
};
