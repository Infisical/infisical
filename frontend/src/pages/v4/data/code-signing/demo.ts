import { createMongoAbility } from "@casl/ability";

import {
  SignerPermissionActions,
  SignerPermissionSub
} from "@app/context/SignerPermissionContext/types";
import { parseDurationMs } from "@app/helpers/datetime";
import { SigningAlgorithm } from "@app/hooks/api/cmeks";
import {
  CertKeySource,
  SignerKeyAlgorithm,
  SignerMemberRole,
  SignerRequestStatus,
  SignerStatus,
  SigningActorType,
  SigningOperationStatus,
  type TEffectiveSignerMember,
  type TSigner,
  type TSignerMember,
  type TSignerPolicy,
  type TSignerRequest,
  type TSigningOperation
} from "@app/hooks/api/signers/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import { saved } from "../../access/toast";
import { createFixtureStore } from "../fixture-store";
import { demoMemberSeeds } from "../pki-applications/demo-store";
import type { CodeSigningAdapter } from "./contract";

const projectId = "internal-pki";
const ISSUING_CA = "8d2f4c61-3a7e-4b19-9f05-c6e1a2b7d438";
const RELEASE = "5b1f7c3a-8e2d-4a69-b0c4-9d6e3f2a1b85";
const FIRMWARE = "c3a8e041-6d7b-4f12-9e5c-2b4f8a0d6e93";
const MOBILE = "7e4d2a91-0c5b-4f38-a6e1-3b9d8c2f5a17";
const INSTALLER = "a2f60c3e-9b17-4d85-8e4a-6c1d0f7b3e29";

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 36e5).toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
const ok = <T>(data: T) => ({ data, isPending: false, error: null });
const missing = () => ({ data: undefined, isPending: false, error: null });

const signer = (id: string, name: string, extra: Partial<TSigner>): TSigner => ({
  id,
  projectId,
  name,
  description: null,
  status: SignerStatus.Active,
  caId: ISSUING_CA,
  commonName: "Acme Software, Inc.",
  certificateTtlDays: 365,
  certificateRenewBeforeDays: 14,
  keyAlgorithm: SignerKeyAlgorithm.RSA_2048,
  certificateKeySource: CertKeySource.Infisical,
  createdAt: hoursAgo(24 * 120),
  updatedAt: hoursAgo(24),
  ...extra
});

const signers = createFixtureStore<TSigner[]>([
  signer(RELEASE, "release-signer", {
    description: "Signs production release artifacts",
    certificateId: "c56e2a18-7d9f-4b03-8e61-4a0b5c3d9f72",
    keyAlgorithm: SignerKeyAlgorithm.ECDSA_P384,
    certificateCommonName: "Acme Software, Inc.",
    certificateSerialNumber: "B7:12:6D:E0:43:8A:F9:21",
    certificateNotAfter: daysFromNow(139),
    approvalPolicyName: "release-approvals",
    lastSignedAt: hoursAgo(20),
    createdAt: hoursAgo(24 * 226)
  }),
  signer(FIRMWARE, "firmware-signer", {
    description: "Signs device firmware images",
    certificateId: "f1d38b62-4c0a-4e97-b5d2-8a6e1c3f0b74",
    keyAlgorithm: SignerKeyAlgorithm.RSA_4096,
    certificateKeySource: CertKeySource.Hsm,
    certificateHsmConnectorId: "hsm-luna-primary",
    certificateCommonName: "Acme Devices Firmware",
    certificateSerialNumber: "4E:90:1A:C7:2B:65:D3:08",
    certificateNotAfter: daysFromNow(12),
    lastSignedAt: hoursAgo(46),
    createdAt: hoursAgo(24 * 180)
  }),
  signer(MOBILE, "mobile-app-prod", {
    description: "iOS and Android production bundles",
    status: SignerStatus.Pending,
    externalOrder: { provider: "digicert", orderId: 48213907, status: "pending" },
    createdAt: hoursAgo(3)
  }),
  signer(INSTALLER, "windows-installer", {
    status: SignerStatus.Failed,
    certificateFailureReason:
      "The CA rejected the request: the key algorithm is not allowed by the code signing template.",
    createdAt: hoursAgo(30)
  })
]);

const operationStatus = (index: number) => {
  if (index % 11 === 4) return SigningOperationStatus.Failed;
  if (index % 13 === 7) return SigningOperationStatus.Denied;
  return SigningOperationStatus.Success;
};

const operationsFor = (target: TSigner, count: number): TSigningOperation[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${target.id.slice(0, 8)}-op-${index}`,
    signerId: target.id,
    projectId,
    status: operationStatus(index),
    signingAlgorithm:
      target.keyAlgorithm === SignerKeyAlgorithm.ECDSA_P384
        ? SigningAlgorithm.ECDSA_SHA_384
        : SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256,
    dataHash: ((index + 7) * 2654435761).toString(16).padStart(16, "0").repeat(4).slice(0, 64),
    actorType: index % 3 === 0 ? SigningActorType.User : SigningActorType.Identity,
    actorId: index % 3 === 0 ? "user-maya-chen" : "identity-payments-deployer",
    actorName: index % 3 === 0 ? "Maya Chen" : "ci-release-bot",
    actorMembershipId: index % 3 === 0 ? "membership-maya" : null,
    clientMetadata: {
      tool: index % 2 ? "signtool.exe" : "jarsigner",
      hostname: index % 2 ? "win-build-agent-02" : "linux-build-07",
      osUsername: "svc-release",
      sourceIp: "203.0.113.10",
      command: index % 2 ? "signtool sign /fd SHA256 /kc release-signer Acme.exe" : undefined
    },
    errorMessage:
      index % 11 === 4 ? "The signing request timed out before the key responded." : null,
    createdAt: hoursAgo(20 + index * 7)
  }));

const operations = [...operationsFor(signers.get()[0], 38), ...operationsFor(signers.get()[1], 6)];

const member = (
  signerId: string,
  kind: "user" | "identity" | "group",
  actorId: string,
  name: string,
  role: SignerMemberRole,
  email?: string
): TSignerMember => ({
  membershipId: `${signerId.slice(0, 8)}-${actorId}`,
  signerId,
  actorUserId: kind === "user" ? actorId : null,
  actorIdentityId: kind === "identity" ? actorId : null,
  actorGroupId: kind === "group" ? actorId : null,
  role,
  createdAt: hoursAgo(24 * 90),
  updatedAt: hoursAgo(24 * 90),
  details: { name, email }
});

const members = createFixtureStore<TSignerMember[]>([
  member(RELEASE, "user", "u-sarah", "Sarah Lin", SignerMemberRole.Administrator, "sarah@acme.dev"),
  member(
    RELEASE,
    "user",
    "user-maya-chen",
    "Maya Chen",
    SignerMemberRole.Operator,
    "maya.chen@acme.dev"
  ),
  member(
    RELEASE,
    "user",
    "user-jonas-weber",
    "Jonas Weber",
    SignerMemberRole.Auditor,
    "jonas.weber@acme.dev"
  ),
  member(
    RELEASE,
    "identity",
    "identity-payments-deployer",
    "ci-release-bot",
    SignerMemberRole.Operator
  ),
  member(
    RELEASE,
    "group",
    "group-platform-security",
    "Platform Security",
    SignerMemberRole.Administrator
  ),
  member(
    FIRMWARE,
    "user",
    "u-sarah",
    "Sarah Lin",
    SignerMemberRole.Administrator,
    "sarah@acme.dev"
  ),
  member(MOBILE, "user", "u-sarah", "Sarah Lin", SignerMemberRole.Administrator, "sarah@acme.dev"),
  member(
    INSTALLER,
    "user",
    "u-sarah",
    "Sarah Lin",
    SignerMemberRole.Administrator,
    "sarah@acme.dev"
  )
]);

const noPolicy = (signerId: string): TSignerPolicy => ({
  id: `policy-${signerId}`,
  signerId,
  hasSteps: false,
  steps: [],
  constraints: { maxSignings: null, maxWindowDuration: null }
});

const policies = createFixtureStore<TSignerPolicy[]>([
  {
    id: `policy-${RELEASE}`,
    signerId: RELEASE,
    hasSteps: true,
    steps: [
      {
        stepNumber: 1,
        name: "Release lead",
        requiredApprovals: 1,
        approvers: [{ type: "user", id: "u-sarah" }]
      },
      {
        stepNumber: 2,
        name: "Platform Security",
        requiredApprovals: 1,
        approvers: [{ type: "group", id: "group-platform-security" }]
      }
    ],
    constraints: { maxSignings: 10, maxWindowDuration: "24h" }
  }
]);

const windowExpiry = (duration?: string) => {
  const span = parseDurationMs(duration);
  return span ? new Date(Date.now() + span).toISOString() : null;
};

const request = (
  id: string,
  extra: Partial<TSignerRequest> & Pick<TSignerRequest, "status">
): TSignerRequest => ({
  id,
  projectId,
  organizationId: "demo",
  policyId: `policy-${RELEASE}`,
  requesterId: "user-maya-chen",
  requesterName: "Maya Chen",
  requesterEmail: "maya.chen@acme.dev",
  type: "cert-code-signing",
  justification: null,
  currentStep: 1,
  requestData: null,
  scopeId: RELEASE,
  createdAt: hoursAgo(5),
  updatedAt: hoursAgo(5),
  ...extra
});

const requests = createFixtureStore<TSignerRequest[]>([
  request("2f9c1d7a-5e3b-4a80-9c6d-1b4e7f0a2d58", {
    status: SignerRequestStatus.Pending,
    justification: "Sign the 4.12.0 desktop installer for Friday's release"
  }),
  request("8a3e6b12-0d4f-4c97-b5a1-7e2c9f0d3b64", {
    status: SignerRequestStatus.Approved,
    accessStatus: SignerRequestStatus.Approved,
    grantStatus: "active",
    requesterId: null,
    machineIdentityId: "identity-payments-deployer",
    requesterName: "ci-release-bot",
    justification: "Nightly build signing",
    maxSignings: 10,
    usedSignings: 3,
    expiresAt: daysFromNow(0.6),
    createdAt: hoursAgo(9)
  }),
  request("c7d2a95e-3f18-4b6c-8e0a-5d9b1f4c2e73", {
    status: SignerRequestStatus.Approved,
    accessStatus: SignerRequestStatus.Expired,
    grantStatus: "expired",
    maxSignings: 5,
    usedSignings: 5,
    expiresAt: hoursAgo(30),
    createdAt: hoursAgo(60)
  }),
  request("e1b84f3c-7a29-4d05-9b6e-0c3f8a2d7e91", {
    status: SignerRequestStatus.Cancelled,
    accessStatus: SignerRequestStatus.Cancelled,
    grantStatus: "revoked",
    expiresAt: hoursAgo(80),
    createdAt: hoursAgo(100)
  })
]);

const fullAccess = createMongoAbility<[SignerPermissionActions, SignerPermissionSub.Signer]>(
  Object.values(SignerPermissionActions).map((action) => ({
    action,
    subject: SignerPermissionSub.Signer
  }))
);

const page = <T>(rows: T[], offset = 0, limit = 25) => rows.slice(offset, offset + limit);

const announce =
  <TVariables, TData>(
    message: string | ((variables: TVariables) => string),
    run: (variables: TVariables) => TData
  ) =>
  () => ({
    mutateAsync: async (variables: TVariables) => {
      const data = run(variables);
      if (message) saved(typeof message === "string" ? message : message(variables));
      return data;
    },
    isPending: false
  });

const requireSigner = (signerId: string) => {
  const found = signers.get().find((entry) => entry.id === signerId);
  if (!found) throw new Error("Signer not found");
  return found;
};

const patchSigner = (signerId: string, patch: Partial<TSigner>) => {
  signers.update((rows) =>
    rows.map((entry) =>
      entry.id === signerId ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry
    )
  );
  return requireSigner(signerId);
};

const kindOf = (entry: TSignerMember) => {
  if (entry.actorUserId) return "user";
  if (entry.actorIdentityId) return "identity";
  return "group";
};

const addMember = (
  signerId: string,
  kind: "user" | "identity" | "group",
  actorId: string,
  role: SignerMemberRole
) => {
  const seeds = {
    user: demoMemberSeeds.users,
    identity: demoMemberSeeds.identities,
    group: demoMemberSeeds.groups
  }[kind];
  const seed = seeds.find((entry) => entry.id === actorId);
  const created = member(signerId, kind, actorId, seed?.name ?? actorId, role);
  members.update((rows) => [...rows, created]);
  return created;
};

const setRole = (signerId: string, actorId: string, role: SignerMemberRole) =>
  members.update((rows) =>
    rows.map((entry) =>
      entry.signerId === signerId &&
      [entry.actorUserId, entry.actorIdentityId, entry.actorGroupId].includes(actorId)
        ? { ...entry, role }
        : entry
    )
  );

const removeMember = (signerId: string, actorId: string) =>
  members.update((rows) =>
    rows.filter(
      (entry) =>
        entry.signerId !== signerId ||
        ![entry.actorUserId, entry.actorIdentityId, entry.actorGroupId].includes(actorId)
    )
  );

const DEMO_CERTIFICATE = [
  "-----BEGIN CERTIFICATE-----",
  "DEMO-ONLY-CODE-SIGNING-CERTIFICATE-NOT-A-REAL-CERTIFICATE",
  "-----END CERTIFICATE-----"
].join("\n");

export const codeSigningDemo: CodeSigningAdapter = {
  useSubscription: () => ok({ pkiCodeSigning: true, hsm: true } as SubscriptionPlan),
  useSigners: ({ offset, limit, search }) => {
    const rows = signers
      .use()
      .filter((entry) => !search || entry.name.toLowerCase().includes(search.trim().toLowerCase()));
    return ok({ signers: page(rows, offset, limit), totalCount: rows.length });
  },
  useSigner: (signerId) => {
    const found = signers.use().find((entry) => entry.id === signerId);
    return found ? ok(found) : missing();
  },
  useSignerPermission: () => ok({ permission: fullAccess }),
  useSigningOperations: ({ signerId, offset, limit, status }) => {
    const rows = operations.filter(
      (entry) => entry.signerId === signerId && (!status || entry.status === status)
    );
    return ok({ operations: page(rows, offset, limit), totalCount: rows.length });
  },
  useSigningOperation: (signerId, operationId) => {
    const operation = operations.find(
      (entry) => entry.signerId === signerId && entry.id === operationId
    );
    const owner = signers.use().find((entry) => entry.id === signerId);
    return operation && owner ? ok({ operation, signerName: owner.name }) : missing();
  },
  useSignerMembers: ({ signerId, kind }) =>
    ok({
      memberships: members
        .use()
        .filter((entry) => entry.signerId === signerId && kindOf(entry) === kind)
    }),
  useEffectiveSignerMembers: ({ signerId, kind }) => {
    const rows = members.use().filter((entry) => entry.signerId === signerId);
    const direct: TEffectiveSignerMember[] = rows
      .filter((entry) => kindOf(entry) === kind)
      .map((entry) => ({
        actorUserId: entry.actorUserId ?? null,
        actorIdentityId: entry.actorIdentityId ?? null,
        role: entry.role,
        viaGroupIds: [],
        isDirect: true,
        details: entry.details ?? null
      }));
    return ok({ members: direct });
  },
  useSignerPolicy: (signerId) =>
    ok(policies.use().find((entry) => entry.signerId === signerId) ?? noPolicy(signerId)),
  useSignerRequests: ({ signerId, statuses, offset, limit }) => {
    const filterStatus = (entry: TSignerRequest) => {
      if (!statuses?.length) return true;
      const access = entry.accessStatus ?? entry.status;
      return statuses.some(
        (status) =>
          (status === "pending" && access === SignerRequestStatus.Pending) ||
          (status === "approved" && access === SignerRequestStatus.Approved) ||
          (status === "expired" && access === SignerRequestStatus.Expired) ||
          (status === "revoked" && access === SignerRequestStatus.Cancelled)
      );
    };
    const rows = requests
      .use()
      .filter((entry) => entry.scopeId === signerId)
      .filter(filterStatus);
    return ok({ requests: page(rows, offset, limit), totalCount: rows.length });
  },
  useSignerCertificate: (signerId, enabled) => {
    const found = signers.use().find((entry) => entry.id === signerId);
    if (!enabled || !found?.certificateId) return missing();
    return ok({
      certificatePem: DEMO_CERTIFICATE,
      serialNumber: found.certificateSerialNumber ?? "",
      signerName: found.name
    });
  },
  useMemberCandidates: () => ({
    users: ok([
      { value: "u-sarah", label: "Sarah Lin" },
      ...demoMemberSeeds.users.map(({ id, name }) => ({ value: id, label: name }))
    ]),
    identities: ok(demoMemberSeeds.identities.map(({ id, name }) => ({ value: id, label: name }))),
    groups: ok(demoMemberSeeds.groups.map(({ id, name }) => ({ value: id, label: name })))
  }),
  useHsmConnectorKeys: (connectorId, label, enabled) => {
    if (!enabled || !connectorId || !label) return { ...missing(), isFetching: false };
    return { ...ok([{ keyId: "0a1b2c", keyAlgorithm: "RSA_3072" }]), isFetching: false };
  },
  useDigiCertOrders: () => ok([]),
  useCreateSigner: announce("Signer created successfully", (dto) => {
    const created = signer(crypto.randomUUID(), dto.name, {
      description: dto.description ?? null,
      caId: dto.caId,
      commonName: dto.commonName,
      certificateTtlDays: dto.certificateTtlDays,
      certificateRenewBeforeDays: dto.certificateRenewBeforeDays ?? null,
      keyAlgorithm: dto.keyAlgorithm,
      status: SignerStatus.Pending,
      createdAt: new Date().toISOString()
    });
    signers.update((rows) => [created, ...rows]);
    const seeds = {
      user: demoMemberSeeds.users,
      identity: demoMemberSeeds.identities,
      group: demoMemberSeeds.groups
    };
    const added = (dto.members ?? []).map(({ kind, id, role }) => {
      const seed: { name: string; email?: string | null } | undefined = seeds[kind].find(
        (entry) => entry.id === id
      );
      return member(created.id, kind, id, seed?.name ?? id, role, seed?.email ?? undefined);
    });
    members.update((rows) => [...rows, ...added]);
    if (dto.approvalPolicy?.steps.length) {
      const { steps, constraints } = dto.approvalPolicy;
      policies.update((rows) => [
        ...rows,
        {
          id: `policy-${created.id}`,
          signerId: created.id,
          hasSteps: true,
          steps: steps.map(
            ({ stepNumber, name, requiredApprovals, approverUserIds, approverGroupIds }) => ({
              stepNumber,
              name,
              requiredApprovals,
              approvers: [
                ...approverUserIds.map((id) => ({ type: "user" as const, id })),
                ...(approverGroupIds ?? []).map((id) => ({ type: "group" as const, id }))
              ]
            })
          ),
          constraints: {
            maxSignings: constraints?.maxSignings ?? null,
            maxWindowDuration: constraints?.maxWindowDuration ?? null
          }
        }
      ]);
    }
    return created;
  }),
  useUpdateSigner: announce("Signer updated successfully", ({ signerId, ...patch }) =>
    patchSigner(signerId, patch)
  ),
  useDeleteSigner: announce("Signer deleted successfully", ({ signerId }) => {
    const found = requireSigner(signerId);
    signers.update((rows) => rows.filter((entry) => entry.id !== signerId));
    return found;
  }),
  useEnableSigner: announce("Signer enabled", ({ signerId }) =>
    patchSigner(signerId, { status: SignerStatus.Active })
  ),
  useDisableSigner: announce("Signer disabled", ({ signerId }) =>
    patchSigner(signerId, { status: SignerStatus.Disabled })
  ),
  useReissueSignerCertificate: announce("Certificate reissue started", ({ signerId, caId }) =>
    patchSigner(signerId, { caId, status: SignerStatus.Pending, certificateFailureReason: null })
  ),
  useImportSignerCertificate: announce(
    "Signer switched to the order's certificate",
    ({ signerId }) => patchSigner(signerId, { status: SignerStatus.Active })
  ),
  useCheckSignerCertificateImport: announce("", () => ({ hsmKeyId: null })),
  useCheckSignerIssuance: announce("Issuance still pending. Checked just now.", (signerId) =>
    requireSigner(signerId)
  ),
  useAddUserMembers: announce("Members added", ({ signerId, userIds = [], role }) =>
    userIds.map((userId) => addMember(signerId, "user", userId, role))
  ),
  useAddIdentityMember: announce("", ({ signerId, identityId, role }) =>
    addMember(signerId, "identity", identityId, role)
  ),
  useAddGroupMember: announce("", ({ signerId, groupId, role }) =>
    addMember(signerId, "group", groupId, role)
  ),
  useUpdateUserRole: announce("Role updated", ({ signerId, userId, role }) =>
    setRole(signerId, userId, role)
  ),
  useUpdateIdentityRole: announce("Role updated", ({ signerId, identityId, role }) =>
    setRole(signerId, identityId, role)
  ),
  useUpdateGroupRole: announce("Role updated", ({ signerId, groupId, role }) =>
    setRole(signerId, groupId, role)
  ),
  useRemoveUserMember: announce("Member removed", ({ signerId, userId }) =>
    removeMember(signerId, userId)
  ),
  useRemoveIdentityMember: announce("Member removed", ({ signerId, identityId }) =>
    removeMember(signerId, identityId)
  ),
  useRemoveGroupMember: announce("Member removed", ({ signerId, groupId }) =>
    removeMember(signerId, groupId)
  ),
  useUpdateSignerPolicy: announce("Approval policy saved", ({ signerId, steps, constraints }) => {
    const next: TSignerPolicy = {
      id: `policy-${signerId}`,
      signerId,
      hasSteps: steps.length > 0,
      steps: steps.map((step) => ({
        stepNumber: step.stepNumber,
        name: step.name,
        requiredApprovals: step.requiredApprovals,
        approvers: [
          ...step.approverUserIds.map((id) => ({ type: "user" as const, id })),
          ...(step.approverGroupIds ?? []).map((id) => ({ type: "group" as const, id }))
        ]
      })),
      constraints: {
        maxSignings: constraints?.maxSignings ?? null,
        maxWindowDuration: constraints?.maxWindowDuration ?? null
      }
    };
    policies.update((rows) => [...rows.filter((entry) => entry.signerId !== signerId), next]);
    return next;
  }),
  useRequestToSign: announce(
    "Request sent",
    ({ signerId, justification, requestedSignings, requestedWindowDuration }) =>
      requests.update((rows) => [
        request(crypto.randomUUID(), {
          status: SignerRequestStatus.Pending,
          scopeId: signerId,
          requesterId: "u-sarah",
          requesterName: "Sarah Lin",
          justification,
          maxSignings: requestedSignings ?? null,
          requestData: { version: 1, requestData: { requestedWindowDuration } },
          createdAt: new Date().toISOString()
        }),
        ...rows
      ])
  ),
  usePreApproveSigning: announce(
    "Signing pre-approved",
    ({
      signerId,
      granteeUserId,
      granteeIdentityId,
      justification,
      requestedSignings,
      requestedWindowDuration
    }) =>
      requests.update((rows) => [
        request(crypto.randomUUID(), {
          status: SignerRequestStatus.Approved,
          accessStatus: SignerRequestStatus.Approved,
          grantStatus: "active",
          scopeId: signerId,
          requesterId: granteeUserId ?? null,
          machineIdentityId: granteeIdentityId ?? null,
          justification,
          maxSignings: requestedSignings ?? null,
          usedSignings: 0,
          requestData: { version: 1, requestData: { requestedWindowDuration } },
          expiresAt: windowExpiry(requestedWindowDuration),
          createdAt: new Date().toISOString()
        }),
        ...rows
      ])
  ),
  useRevokeSignerRequest: announce("Request revoked", ({ requestId }) =>
    requests.update((rows) =>
      rows.map((entry) =>
        entry.id === requestId
          ? {
              ...entry,
              status: SignerRequestStatus.Cancelled,
              accessStatus: SignerRequestStatus.Cancelled,
              grantStatus: entry.grantStatus ? "revoked" : null
            }
          : entry
      )
    )
  )
};
