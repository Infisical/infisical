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
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TCertificatePolicy } from "@app/hooks/api/certificatePolicies/types";

import { useProjectPermission } from "../../access/permissions";
import { saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { DeletePolicyDialog } from "../components/delete-dialogs";
import {
  CRITICALITY_LABELS,
  domainComponentChain,
  extensionLabel,
  formatValidity,
  hasEnforcement,
  POLICY_DOCS,
  POLICY_STATE_LABELS,
  type PolicyState,
  SAN_LABELS,
  type SanType,
  SUBJECT_LABELS,
  type SubjectType,
  usageLabel
} from "../components/policy-model";
import { CertificatePolicySheet } from "../components/policy-sheet";

const routeId = v4Path("/organizations/$orgId/cert-manager/certificate-policies/$policyId");

const timestamp = (value: string) => format(new Date(value), "MMM d, yyyy 'at' h:mm a");

const STATE_TONE = { required: "ok", allowed: "info", denied: "bad" } as const;

type RuleValues = { allowed?: string[]; required?: string[]; denied?: string[] };

const isEmptyRule = (rule: RuleValues) =>
  !rule.allowed?.length && !rule.required?.length && !rule.denied?.length;

const Values = ({
  values,
  format: formatValue = (value: string) => value,
  mono
}: {
  values: string[];
  format?: (value: string) => string;
  mono?: boolean;
}) => (
  <Inline gap={4}>
    {values.map((value) => (
      <Badge key={value} tone="outline" mono={mono}>
        {formatValue(value)}
      </Badge>
    ))}
  </Inline>
);

const RuleValueList = ({
  rule,
  format: formatValue,
  mono
}: {
  rule: RuleValues;
  format?: (value: string) => string;
  mono?: boolean;
}) => (
  <Stack gap={8}>
    {(["required", "allowed", "denied"] as const)
      .filter((state) => rule[state]?.length)
      .map((state) => (
        <Inline key={state} gap={8} align="center">
          <SmallText muted>{POLICY_STATE_LABELS[state]}</SmallText>
          <Values values={rule[state] ?? []} format={formatValue} mono={mono} />
        </Inline>
      ))}
  </Stack>
);

const ruleId = (rule: RuleValues & { oid: string }) =>
  [rule.oid, rule.required, rule.allowed, rule.denied].flat().join(":");

const NoneAllowed = ({ children }: { children: string }) => <SmallText muted>{children}</SmallText>;

const validityItemsOf = (policy: TCertificatePolicy): DataListItem[] => {
  const maxValidity = policy.validity?.max;
  const { basicConstraints } = policy;
  const isCA = basicConstraints?.isCA as PolicyState | undefined;
  return [
    ...(maxValidity ? ([["Maximum validity", formatValidity(maxValidity)]] as const) : []),
    ...(isCA
      ? ([
          [
            "CA certificate",
            <Badge key="ca" tone={STATE_TONE[isCA]}>
              {POLICY_STATE_LABELS[isCA]}
            </Badge>
          ]
        ] as const)
      : []),
    ...(basicConstraints?.maxPathLength !== undefined && basicConstraints?.maxPathLength !== null
      ? ([["Maximum path length", String(basicConstraints.maxPathLength)]] as const)
      : [])
  ];
};

const usageItemsOf = (policy: TCertificatePolicy): DataListItem[] => {
  return [
    ...(policy.keyUsages
      ? ([
          [
            "Key usages",
            isEmptyRule(policy.keyUsages) ? (
              <NoneAllowed key="ku">None allowed</NoneAllowed>
            ) : (
              <RuleValueList key="ku" rule={policy.keyUsages} format={usageLabel} />
            )
          ]
        ] as const)
      : []),
    ...(policy.extendedKeyUsages
      ? ([
          [
            "Extended key usages",
            isEmptyRule(policy.extendedKeyUsages) ? (
              <NoneAllowed key="eku">None allowed</NoneAllowed>
            ) : (
              <RuleValueList key="eku" rule={policy.extendedKeyUsages} format={usageLabel} />
            )
          ]
        ] as const)
      : [])
  ];
};

const SubjectCard = ({ rules }: { rules: NonNullable<TCertificatePolicy["subject"]> }) => (
  <Card variant="framed" title="Subject attributes">
    {rules.length ? (
      <DataList
        variant="props"
        items={rules.map((rule) => {
          const isDomain = rule.type === "domain_component";
          return [
            SUBJECT_LABELS[rule.type as SubjectType] ?? rule.type,
            <RuleValueList
              key={rule.type}
              rule={rule}
              mono={isDomain}
              format={isDomain ? (value) => domainComponentChain(value, " ") : undefined}
            />
          ] as const;
        })}
      />
    ) : (
      <NoneAllowed>
        Certificates issued under this policy cannot include any subject attributes.
      </NoneAllowed>
    )}
  </Card>
);

const SanCard = ({ rules }: { rules: NonNullable<TCertificatePolicy["sans"]> }) => (
  <Card variant="framed" title="Subject alternative names">
    {rules.length ? (
      <DataList
        variant="props"
        items={rules.map(
          (rule) =>
            [
              SAN_LABELS[rule.type as SanType] ?? rule.type,
              <RuleValueList key={rule.type} rule={rule} mono />
            ] as const
        )}
      />
    ) : (
      <NoneAllowed>
        Certificates issued under this policy cannot include any subject alternative names.
      </NoneAllowed>
    )}
  </Card>
);

const AlgorithmsCard = ({
  signatures,
  keyAlgorithms
}: {
  signatures: string[];
  keyAlgorithms: string[];
}) => (
  <Card variant="framed" title="Algorithms">
    <DataList
      variant="props"
      items={[
        ...(signatures.length
          ? ([["Signature algorithms", <Values key="sig" values={signatures} />]] as const)
          : []),
        ...(keyAlgorithms.length
          ? ([["Key algorithms", <Values key="key" values={keyAlgorithms} />]] as const)
          : [])
      ]}
    />
  </Card>
);

const ExtensionsCard = ({
  rules
}: {
  rules: NonNullable<TCertificatePolicy["customExtensions"]>;
}) => (
  <Card variant="framed" title="Custom extensions">
    {rules.length ? (
      <DataList
        variant="props"
        items={rules.map(
          (rule) =>
            [
              <Stack key={`label-${ruleId(rule)}`} gap={2}>
                {extensionLabel(rule.oid, rule.label)}
                <SmallText muted>
                  <code>{rule.oid}</code>
                </SmallText>
              </Stack>,
              <Stack key={`value-${ruleId(rule)}`} gap={8}>
                {rule.critical && (
                  <div>
                    <Badge tone="soft">{CRITICALITY_LABELS[rule.critical]}</Badge>
                  </div>
                )}
                <RuleValueList rule={rule} mono />
              </Stack>
            ] as const
        )}
      />
    ) : (
      <NoneAllowed>
        Certificates issued under this policy cannot include any custom extensions.
      </NoneAllowed>
    )}
  </Card>
);

const Sections = ({ policy }: { policy: TCertificatePolicy }) => {
  if (!hasEnforcement(policy))
    return (
      <Card variant="framed" title="No restrictions">
        <EmptyState
          size="sm"
          icon="shield"
          title="This policy enforces no constraints"
          description="Certificates issued under it can use any subject attributes, subject alternative names, algorithms, key usages, and validity period. Edit the policy to add restrictions."
        />
      </Card>
    );

  const validityItems = validityItemsOf(policy);
  const subjectRules = policy.subject?.filter((rule) => !isEmptyRule(rule));
  const sanRules = policy.sans?.filter((rule) => !isEmptyRule(rule));
  const signatures = policy.algorithms?.signature ?? [];
  const keyAlgorithms = policy.algorithms?.keyAlgorithm ?? [];
  const usageItems = usageItemsOf(policy);
  return (
    <>
      {validityItems.length > 0 && (
        <Card variant="framed" title="Validity and constraints">
          <DataList variant="props" items={validityItems} />
        </Card>
      )}
      {subjectRules && <SubjectCard rules={subjectRules} />}
      {sanRules && <SanCard rules={sanRules} />}
      {usageItems.length > 0 && (
        <Card variant="framed" title="Key usages">
          <DataList variant="props" items={usageItems} />
        </Card>
      )}
      {(signatures.length > 0 || keyAlgorithms.length > 0) && (
        <AlgorithmsCard signatures={signatures} keyAlgorithms={keyAlgorithms} />
      )}
      {policy.customExtensions && <ExtensionsCard rules={policy.customExtensions} />}
    </>
  );
};

const PolicyDetail = ({
  orgId,
  projectId,
  policy
}: {
  orgId: string;
  projectId: string;
  policy: TCertificatePolicy;
}) => {
  const go = useGo();
  const search = useSearch({ from: routeId });
  const { permission } = useProjectPermission(projectId);
  const fromProfile = search.from === "profile" && search.profileId ? search.profileId : "";
  const { data: sourceProfile } = useV4Adapter("pkiPolicies").useProfile({
    profileId: fromProfile
  });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const listHref = orgHref(orgId, "/cert-manager/certificate-policies");
  const profileQuery = new URLSearchParams({
    ...(search.profileFrom ? { from: search.profileFrom } : {}),
    ...(search.profileApplicationName ? { applicationName: search.profileApplicationName } : {})
  }).toString();
  const crumb = fromProfile
    ? {
        label: sourceProfile?.slug ?? "Certificate profile",
        link: go.link(
          orgHref(
            orgId,
            `/cert-manager/certificate-profiles/${fromProfile}${profileQuery ? `?${profileQuery}` : ""}`
          )
        )
      }
    : { label: "Certificate policies", link: go.link(listHref) };
  const blocked = (action: ProjectPermissionCertificatePolicyActions) =>
    permission.can(action, subject(ProjectPermissionSub.CertificatePolicies, { name: policy.name }))
      ? undefined
      : RESTRICTED;
  const editBlocked = blocked(ProjectPermissionCertificatePolicyActions.Edit);
  const deleteBlocked = blocked(ProjectPermissionCertificatePolicyActions.Delete);

  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[crumb]}
        title={policy.name}
        badges={<DocumentationLink href={POLICY_DOCS} subject="Certificate policies" />}
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
                    navigator.clipboard?.writeText(policy.id).catch(() => undefined);
                    saved("Policy ID copied");
                  }}
                >
                  <Icon name="copy" />
                  Copy policy ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={Boolean(deleteBlocked)}
                  description={deleteBlocked}
                  onSelect={() => setDeleting(true)}
                >
                  <Icon name="trash" />
                  Delete policy
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="primary"
              icon="pencil"
              disabledReason={editBlocked}
              onClick={() => setEditing(true)}
            >
              Edit policy
            </Button>
          </>
        }
      />
      <DetailLayout
        asideLabel="Certificate policy details"
        aside={
          <Card variant="framed" title="Details">
            <DataList
              variant="props"
              density="compact"
              items={[
                ["Policy ID", <code key="id">{policy.id}</code>],
                ...(policy.description ? ([["Description", policy.description]] as const) : []),
                ...(policy.createdAt ? ([["Created", timestamp(policy.createdAt)]] as const) : []),
                ...(policy.updatedAt
                  ? ([["Last updated", timestamp(policy.updatedAt)]] as const)
                  : [])
              ]}
            />
          </Card>
        }
      >
        <Stack gap={16}>
          <Sections policy={policy} />
        </Stack>
      </DetailLayout>
      {editing && (
        <CertificatePolicySheet
          projectId={projectId}
          policy={policy}
          onClose={() => setEditing(false)}
        />
      )}
      <DeletePolicyDialog
        policy={deleting ? policy : undefined}
        onClose={() => setDeleting(false)}
        onDeleted={() => go(listHref)}
      />
    </Stack>
  );
};

const Page = () => {
  const { orgId, policyId } = useParams({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const { permission, isPending: isCheckingAccess } = useProjectPermission(projectId ?? "");
  const { data: policy, isPending } = useV4Adapter("pkiPolicies").usePolicy({ policyId });
  if (isResolving || (projectId && (isCheckingAccess || isPending)))
    return <Loader size="page" label="Loading certificate policy" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  if (!policy)
    return (
      <EmptyState
        icon="shield"
        title="Certificate policy not found"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/cert-manager/certificate-policies")}>
              Back to certificate policies
            </a>
          </Button>
        }
      />
    );
  if (
    !permission.can(
      ProjectPermissionCertificatePolicyActions.Read,
      subject(ProjectPermissionSub.CertificatePolicies, { name: policy.name })
    )
  )
    return <AccessRestricted requirement="Read certificate policies" />;
  return <PolicyDetail orgId={orgId} projectId={projectId} policy={policy} />;
};

export const CertificatePolicyDetailsByIDPage = () => (
  <>
    <PageTitle title="Certificate Policy" />
    <Page />
  </>
);
