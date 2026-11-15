import { useState } from "react";
import { subject } from "@casl/ability";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { SmallText } from "@infisical/cipher/ui/text";
import { useParams, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";

import { PageTitle } from "@app/components/PageTitle";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { EXTERNAL_CA_TYPE_NAME_MAP } from "@app/hooks/api/ca/constants";
import {
  IssuerType,
  type TCertificateProfileDefaults,
  type TCertificateProfileWithDetails
} from "@app/hooks/api/certificateProfiles/types";

import { useProjectPermission } from "../../access/permissions";
import { saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { DeleteProfileDialog } from "../components/delete-dialogs";
import {
  extensionLabel,
  PROFILE_DOCS,
  SAN_LABELS,
  type SanType,
  usageLabel
} from "../components/policy-model";
import { CertificateProfileSheet } from "../components/profile-sheet";

const routeId = v4Path("/organizations/$orgId/cert-manager/certificate-profiles/$profileId");

const timestamp = (value: string) => format(new Date(value), "MMM d, yyyy 'at' h:mm a");

const Values = ({ values, mono }: { values: string[]; mono?: boolean }) => (
  <Inline gap={4}>
    {values.map((value) => (
      <Badge key={value} tone="outline" mono={mono}>
        {value}
      </Badge>
    ))}
  </Inline>
);

const SUBJECT_ROWS: [keyof TCertificateProfileDefaults, string][] = [
  ["commonName", "Common name (CN)"],
  ["organization", "Organization (O)"],
  ["organizationalUnit", "Organizational unit (OU)"],
  ["country", "Country (C)"],
  ["state", "State or province (ST)"],
  ["locality", "Locality (L)"]
];

const Defaults = ({ defaults }: { defaults?: TCertificateProfileDefaults | null }) => {
  const crypto: DataListItem[] = [
    ...(defaults?.ttlDays ? ([["Time to live", `${defaults.ttlDays} days`]] as const) : []),
    ...(defaults?.keyAlgorithm
      ? ([["Key algorithm", <Values key="key" values={[defaults.keyAlgorithm]} />]] as const)
      : []),
    ...(defaults?.signatureAlgorithm
      ? ([
          ["Signature algorithm", <Values key="sig" values={[defaults.signatureAlgorithm]} />]
        ] as const)
      : [])
  ];
  const usages: DataListItem[] = [
    ...(defaults?.keyUsages?.length
      ? ([["Key usages", <Values key="ku" values={defaults.keyUsages.map(usageLabel)} />]] as const)
      : []),
    ...(defaults?.extendedKeyUsages?.length
      ? ([
          [
            "Extended key usages",
            <Values key="eku" values={defaults.extendedKeyUsages.map(usageLabel)} />
          ]
        ] as const)
      : [])
  ];
  const constraints: DataListItem[] = defaults?.basicConstraints
    ? [
        ["CA certificate", defaults.basicConstraints.isCA ? "Yes" : "No"],
        ...(defaults.basicConstraints.pathLength !== undefined &&
        defaults.basicConstraints.pathLength !== null
          ? ([["Maximum path length", String(defaults.basicConstraints.pathLength)]] as const)
          : [])
      ]
    : [];
  const subjectItems: DataListItem[] = [
    ...SUBJECT_ROWS.flatMap(([field, label]) => {
      const value = defaults?.[field];
      return typeof value === "string" && value ? ([[label, value]] as const) : [];
    }),
    ...(defaults?.domainComponents?.length
      ? ([
          ["Domain components (DC)", <Values key="dc" values={defaults.domainComponents} mono />]
        ] as const)
      : [])
  ];
  const sans: DataListItem[] = (defaults?.subjectAltNames ?? []).map(
    (san) =>
      [
        SAN_LABELS[san.type as SanType] ?? san.type,
        <code key={`${san.type}-${san.value}`}>{san.value}</code>
      ] as const
  );
  const extensions: DataListItem[] = (defaults?.customExtensions ?? []).map(
    (extension) =>
      [
        <Stack key={`label-${extension.oid}`} gap={2}>
          {extensionLabel(extension.oid, extension.label)}
          <SmallText muted>
            <code>{extension.oid}</code>
          </SmallText>
        </Stack>,
        <Inline key={`value-${extension.oid}`} gap={8} align="center">
          {extension.value ? (
            <code>{extension.value}</code>
          ) : (
            <SmallText muted>Supplied by the request</SmallText>
          )}
          {extension.critical && <Badge tone="soft">Critical</Badge>}
        </Inline>
      ] as const
  );
  const sections = [
    { title: "Cryptography", items: crypto },
    { title: "Key usages", items: usages },
    { title: "Basic constraints", items: constraints },
    { title: "Subject", items: subjectItems },
    { title: "Subject alternative names", items: sans },
    { title: "Custom extensions", items: extensions }
  ].filter((section) => section.items.length);

  if (!sections.length)
    return (
      <Card variant="framed" title="Defaults">
        <EmptyState
          size="sm"
          icon="file-key"
          title="No defaults"
          description="Requests from this profile get no pre-filled values."
        />
      </Card>
    );
  return (
    <>
      {sections.map((section) => (
        <Card key={section.title} variant="framed" title={section.title}>
          <DataList variant="props" items={section.items} />
        </Card>
      ))}
    </>
  );
};

const issuerItemsOf = ({
  orgId,
  profile,
  authorities,
  backQuery
}: {
  orgId: string;
  profile: TCertificateProfileWithDetails;
  authorities: { id: string; name: string }[];
  backQuery: string;
}): DataListItem[] => {
  const isSelfSigned = profile.issuerType === IssuerType.SELF_SIGNED;
  const ca = profile.certificateAuthority;
  const isInternalCa = !isSelfSigned && !ca?.isExternal;
  const caName = authorities.find((entry) => entry.id === profile.caId)?.name ?? ca?.name;
  return isSelfSigned
    ? [["Source", "Self-signed"]]
    : [
        ["Source", ca?.isExternal ? "External CA" : "Internal CA"],
        ...(ca?.isExternal && ca.externalType
          ? ([
              ["External type", EXTERNAL_CA_TYPE_NAME_MAP[ca.externalType] ?? ca.externalType]
            ] as const)
          : []),
        [
          "Certificate authority",
          isInternalCa && profile.caId ? (
            <a key="ca" href={orgHref(orgId, `/cert-manager/ca/${profile.caId}?${backQuery}`)}>
              {caName ?? profile.caId}
            </a>
          ) : (
            (caName ?? "None")
          )
        ]
      ];
};

const ProfileDetail = ({
  orgId,
  projectId,
  profile
}: {
  orgId: string;
  projectId: string;
  profile: TCertificateProfileWithDetails;
}) => {
  const go = useGo();
  const search = useSearch({ from: routeId });
  const { permission } = useProjectPermission(projectId);
  const { data: authorities = [] } = useV4Adapter("certificates").useCertificateAuthorities();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fromApplication = search.from === "application" ? search.applicationName : undefined;
  const backHref = fromApplication
    ? orgHref(orgId, `/cert-manager/applications/${encodeURIComponent(fromApplication)}`)
    : orgHref(orgId, "/cert-manager/certificate-profiles");
  const backQuery = new URLSearchParams({
    from: "profile",
    profileId: profile.id,
    ...(search.from ? { profileFrom: search.from } : {}),
    ...(search.applicationName ? { profileApplicationName: search.applicationName } : {})
  }).toString();
  const blocked = (action: ProjectPermissionCertificateProfileActions) =>
    permission.can(
      action,
      subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })
    )
      ? undefined
      : RESTRICTED;
  const editBlocked = blocked(ProjectPermissionCertificateProfileActions.Edit);
  const deleteBlocked = blocked(ProjectPermissionCertificateProfileActions.Delete);
  const issuerItems = issuerItemsOf({ orgId, profile, authorities, backQuery });
  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[
          {
            label: fromApplication ?? "Certificate profiles",
            link: go.link(backHref)
          }
        ]}
        title={profile.slug}
        badges={<DocumentationLink href={PROFILE_DOCS} subject="Certificate profiles" />}
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
                  onSelect={() => {
                    navigator.clipboard?.writeText(profile.id).catch(() => undefined);
                    saved("Profile ID copied");
                  }}
                >
                  <Icon name="copy" />
                  Copy profile ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={Boolean(deleteBlocked)}
                  description={deleteBlocked}
                  onSelect={() => setDeleting(true)}
                >
                  <Icon name="trash" />
                  Delete profile
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="primary"
              icon="pencil"
              disabledReason={editBlocked}
              onClick={() => setEditing(true)}
            >
              Edit profile
            </Button>
          </>
        }
      />
      <DetailLayout
        asideLabel="Certificate profile details"
        aside={
          <Stack gap={16}>
            <Card variant="framed" title="Details">
              <DataList
                variant="props"
                density="compact"
                items={[
                  ["Profile ID", <code key="id">{profile.id}</code>],
                  ...(profile.description ? ([["Description", profile.description]] as const) : []),
                  ...(profile.createdAt
                    ? ([["Created", timestamp(profile.createdAt)]] as const)
                    : []),
                  ...(profile.updatedAt
                    ? ([["Last updated", timestamp(profile.updatedAt)]] as const)
                    : [])
                ]}
              />
            </Card>
            <Card variant="framed" title="Issuer">
              <DataList variant="props" density="compact" items={issuerItems} />
            </Card>
            <Card variant="framed" title="Certificate policy">
              <DataList
                variant="props"
                density="compact"
                items={[
                  [
                    "Policy",
                    <a
                      key="policy"
                      href={orgHref(
                        orgId,
                        `/cert-manager/certificate-policies/${profile.certificatePolicyId}?${backQuery}`
                      )}
                    >
                      {profile.certificatePolicy?.name ?? profile.certificatePolicyId}
                    </a>
                  ],
                  ...(profile.certificatePolicy?.description
                    ? ([["Description", profile.certificatePolicy.description]] as const)
                    : [])
                ]}
              />
            </Card>
          </Stack>
        }
      >
        <Stack gap={16}>
          <Defaults defaults={profile.defaults} />
        </Stack>
      </DetailLayout>
      {editing && (
        <CertificateProfileSheet
          projectId={projectId}
          profile={profile}
          mode="edit"
          onClose={() => setEditing(false)}
        />
      )}
      <DeleteProfileDialog
        profile={deleting ? profile : undefined}
        onClose={() => setDeleting(false)}
        onDeleted={() => go(backHref)}
      />
    </Stack>
  );
};

const Page = () => {
  const { orgId, profileId } = useParams({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const { permission, isPending: isCheckingAccess } = useProjectPermission(projectId ?? "");
  const { data: profile, isPending } = useV4Adapter("pkiPolicies").useProfile({ profileId });
  if (isResolving || (projectId && (isCheckingAccess || isPending)))
    return <Loader size="page" label="Loading certificate profile" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  if (!profile)
    return (
      <EmptyState
        icon="file-key"
        title="Certificate profile not found"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/cert-manager/certificate-profiles")}>
              Back to certificate profiles
            </a>
          </Button>
        }
      />
    );
  if (
    !permission.can(
      ProjectPermissionCertificateProfileActions.Read,
      subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })
    )
  )
    return <AccessRestricted requirement="Read certificate profiles" />;
  return <ProfileDetail orgId={orgId} projectId={projectId} profile={profile} />;
};

export const CertificateProfileDetailsByIDPage = () => (
  <>
    <PageTitle title="Certificate Profile" />
    <Page />
  </>
);
