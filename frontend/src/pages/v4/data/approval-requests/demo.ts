import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApproverType,
  EnforcementLevel,
  type TApprovalPolicy
} from "@app/hooks/api/approvalPolicies/types";
import {
  ApprovalRequestApprovalDecision,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  type ApprovalRequestStep,
  type CertRequestRequestData,
  type CodeSigningRequestData,
  type TApprovalRequest
} from "@app/hooks/api/approvalRequests/types";
import {
  EnrollmentType,
  IssuerType,
  type TCertificateProfileWithDetails
} from "@app/hooks/api/certificateProfiles/types";
import type { TCertificateRequestDetails } from "@app/hooks/api/certificates/types";
import { CodeSigningScopeField } from "@app/hooks/api/signers/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { ApprovalApplication, ApprovalRequestsAdapter, ApproverDirectory } from "./contract";

const projectId = "internal-pki";
const ago = (hours: number) => new Date(Date.now() - hours * 36e5).toISOString();
const result = <T>(data: T) => ({ data, isPending: false, error: null });

const me = "u-sarah";
const directory: ApproverDirectory = {
  users: [
    { id: me, label: "Sarah Lin" },
    { id: "u-marcus", label: "Marcus Okonkwo" },
    { id: "u-priya", label: "Priya Raman" },
    { id: "u-devon", label: "Devon Hart" }
  ],
  groups: [
    { id: "g-security", label: "Security team" },
    { id: "g-platform", label: "Platform" }
  ]
};
const people: Record<string, { name: string; email: string }> = {
  [me]: { name: "Sarah Lin", email: "sarah@acme.dev" },
  "u-marcus": { name: "Marcus Okonkwo", email: "marcus@acme.dev" },
  "u-priya": { name: "Priya Raman", email: "priya@acme.dev" },
  "u-devon": { name: "Devon Hart", email: "devon@acme.dev" }
};

const applications: ApprovalApplication[] = [
  { id: "app-payments", name: "payments" },
  { id: "app-edge", name: "edge-gateway" }
];

const issuingCa = { id: "8d2f4c61-3a7e-4b19-9f05-c6e1a2b7d438", name: "Acme Issuing CA G2" };
const profiles: TCertificateProfileWithDetails[] = [
  { id: "4a6c2e81-0b3d-4f57-8e19-7d2a5c0f3b64", slug: "tls-server" },
  { id: "b9e03d57-6f21-4c8a-91d4-2e7b8a6c0f15", slug: "mtls-client" }
].map(({ id, slug }) => ({
  id,
  slug,
  projectId,
  caId: issuingCa.id,
  certificatePolicyId: `policy-${slug}`,
  enrollmentType: EnrollmentType.API,
  issuerType: IssuerType.CA,
  createdAt: "2025-09-01T00:00:00Z",
  updatedAt: "2025-09-01T00:00:00Z",
  certificateAuthority: { ...issuingCa, status: "active", isExternal: false }
}));
const [tlsServer, mtlsClient] = profiles;

type StepSeed = {
  name?: string;
  required?: number;
  status: ApprovalRequestStepStatus;
  approvers: { type: ApproverType; id: string }[];
  decisions?: { userId: string; decision: ApprovalRequestApprovalDecision; comment?: string }[];
};

const steps = (requestId: string, seeds: StepSeed[]): ApprovalRequestStep[] =>
  seeds.map((seed, index) => {
    const id = `${requestId}-step-${index + 1}`;
    return {
      id,
      requestId,
      name: seed.name ?? null,
      requiredApprovals: seed.required ?? 1,
      notifyApprovers: true,
      stepNumber: index + 1,
      status: seed.status,
      approvers: seed.approvers,
      approvals: (seed.decisions ?? []).map((decision, at) => ({
        id: `${id}-approval-${at + 1}`,
        stepId: id,
        approverUserId: decision.userId,
        decision: decision.decision,
        comment: decision.comment ?? null,
        createdAt: ago(2),
        updatedAt: ago(2)
      })),
      createdAt: ago(30),
      updatedAt: ago(2)
    };
  });

const certRequest = ({
  id,
  status,
  requesterId,
  hoursAgo,
  commonName,
  profile,
  applicationId,
  altNames = [],
  stepSeeds,
  ttl = "90d"
}: {
  id: string;
  status: ApprovalRequestStatus;
  requesterId: string;
  hoursAgo: number;
  commonName: string;
  profile: TCertificateProfileWithDetails;
  applicationId?: string;
  altNames?: string[];
  stepSeeds: StepSeed[];
  ttl?: string;
}): TApprovalRequest => {
  const requestData: CertRequestRequestData = {
    profileId: profile.id,
    profileName: profile.slug,
    certificateRequestId: `creq-${id}`,
    certificateRequest: {
      commonName,
      altNames: [commonName, ...altNames].map((value) => ({ type: "dns_name", value })),
      keyAlgorithm: "EC_prime256v1",
      signatureAlgorithm: "ECDSA-SHA256",
      keyUsages: ["digital_signature", "key_encipherment"],
      extendedKeyUsages: [profile === mtlsClient ? "client_auth" : "server_auth"],
      validity: { ttl }
    }
  };
  return {
    id,
    projectId,
    policyId: applicationId ? "pol-client-certs" : "pol-prod-tls",
    scopeType: applicationId ? ApprovalPolicyScope.PkiApplication : ApprovalPolicyScope.Project,
    scopeId: applicationId ?? projectId,
    type: ApprovalPolicyType.CertRequest,
    status,
    requesterId,
    requesterName: people[requesterId].name,
    requesterEmail: people[requesterId].email,
    justification: null,
    expiresAt: null,
    requestData: { version: 1, requestData },
    steps: steps(id, stepSeeds),
    canBreakGlass: false,
    isBreakGlass: false,
    createdAt: ago(hoursAgo),
    updatedAt: ago(hoursAgo)
  };
};

const signingRequest = ({
  id,
  status,
  requesterId,
  hoursAgo,
  signerName,
  justification,
  data,
  stepSeeds
}: {
  id: string;
  status: ApprovalRequestStatus;
  requesterId: string;
  hoursAgo: number;
  signerName: string;
  justification?: string;
  data?: Partial<CodeSigningRequestData>;
  stepSeeds: StepSeed[];
}): TApprovalRequest => ({
  id,
  projectId,
  policyId: "pol-release-signing",
  scopeType: ApprovalPolicyScope.Project,
  scopeId: projectId,
  type: ApprovalPolicyType.CertCodeSigning,
  status,
  requesterId,
  requesterName: people[requesterId].name,
  requesterEmail: people[requesterId].email,
  justification: justification ?? null,
  expiresAt: null,
  requestData: {
    version: 1,
    requestData: {
      signerId: `signer-${signerName}`,
      approvalPolicyId: "pol-release-signing",
      signerName,
      justification,
      ...data
    }
  },
  steps: steps(id, stepSeeds),
  canBreakGlass: false,
  isBreakGlass: false,
  createdAt: ago(hoursAgo),
  updatedAt: ago(hoursAgo)
});

const security = { type: ApproverType.Group, id: "g-security" };
const marcus = { type: ApproverType.User, id: "u-marcus" };
const sarah = { type: ApproverType.User, id: me };
const { Approved, Rejected } = ApprovalRequestApprovalDecision;
const { Completed, InProgress, Pending } = ApprovalRequestStepStatus;

const requests: TApprovalRequest[] = [
  certRequest({
    id: "a1f0c2d4-5b6e-4c7d-8e9f-0a1b2c3d4e51",
    status: ApprovalRequestStatus.Pending,
    requesterId: "u-priya",
    hoursAgo: 0.2,
    commonName: "api.payments.acme.dev",
    altNames: ["checkout.payments.acme.dev"],
    profile: tlsServer,
    applicationId: "app-payments",
    stepSeeds: [
      { name: "Security review", status: InProgress, approvers: [security] },
      { name: "Service owner", status: Pending, approvers: [marcus] }
    ]
  }),
  certRequest({
    id: "a1f0c2d4-5b6e-4c7d-8e9f-0a1b2c3d4e52",
    status: ApprovalRequestStatus.Pending,
    requesterId: me,
    hoursAgo: 3,
    commonName: "gateway.edge.acme.dev",
    profile: tlsServer,
    applicationId: "app-edge",
    stepSeeds: [{ status: InProgress, approvers: [marcus] }]
  }),
  certRequest({
    id: "a1f0c2d4-5b6e-4c7d-8e9f-0a1b2c3d4e53",
    status: ApprovalRequestStatus.Pending,
    requesterId: "u-devon",
    hoursAgo: 20,
    commonName: "Acme Partner Issuing CA",
    profile: tlsServer,
    ttl: "1y",
    stepSeeds: [
      {
        name: "Security review",
        status: Completed,
        approvers: [security],
        decisions: [{ userId: me, decision: Approved, comment: "Path length looks right." }]
      },
      {
        name: "PKI owners",
        required: 2,
        status: InProgress,
        approvers: [sarah, marcus],
        decisions: [{ userId: me, decision: Approved }]
      }
    ]
  }),
  certRequest({
    id: "a1f0c2d4-5b6e-4c7d-8e9f-0a1b2c3d4e54",
    status: ApprovalRequestStatus.Approved,
    requesterId: "u-priya",
    hoursAgo: 52,
    commonName: "billing-worker",
    profile: mtlsClient,
    applicationId: "app-payments",
    stepSeeds: [
      {
        status: Completed,
        approvers: [security],
        decisions: [
          { userId: "u-marcus", decision: Approved, comment: "Matches the billing rollout." }
        ]
      }
    ]
  }),
  certRequest({
    id: "a1f0c2d4-5b6e-4c7d-8e9f-0a1b2c3d4e55",
    status: ApprovalRequestStatus.Rejected,
    requesterId: "u-devon",
    hoursAgo: 75,
    commonName: "*.acme.dev",
    profile: tlsServer,
    stepSeeds: [
      {
        status: ApprovalRequestStepStatus.Rejected,
        approvers: [marcus],
        decisions: [
          {
            userId: "u-marcus",
            decision: Rejected,
            comment: "Wildcards need a named owner. Request the hosts you need instead."
          }
        ]
      }
    ]
  }),
  certRequest({
    id: "a1f0c2d4-5b6e-4c7d-8e9f-0a1b2c3d4e56",
    status: ApprovalRequestStatus.Cancelled,
    requesterId: me,
    hoursAgo: 120,
    commonName: "staging.edge.acme.dev",
    profile: tlsServer,
    applicationId: "app-edge",
    stepSeeds: [{ status: InProgress, approvers: [marcus] }]
  }),
  certRequest({
    id: "a1f0c2d4-5b6e-4c7d-8e9f-0a1b2c3d4e57",
    status: ApprovalRequestStatus.Expired,
    requesterId: "u-priya",
    hoursAgo: 300,
    commonName: "ledger.payments.acme.dev",
    profile: tlsServer,
    stepSeeds: [{ status: InProgress, approvers: [security] }]
  }),
  signingRequest({
    id: "b2e1d3c5-6f7a-4d8e-9fa0-1b2c3d4e5f61",
    status: ApprovalRequestStatus.Pending,
    requesterId: "u-devon",
    hoursAgo: 1,
    signerName: "desktop-release",
    justification: "Sign the 4.2.0 desktop installer.",
    data: {
      requestedWindowDuration: "4h",
      requestedSignings: 10,
      scope: {
        [CodeSigningScopeField.Command]: "signtool sign /fd SHA256 /tr http://ts.acme.dev Acme.msi",
        [CodeSigningScopeField.Hostname]: "build-runner-07",
        [CodeSigningScopeField.OsUsername]: "ci"
      }
    },
    stepSeeds: [{ name: "Release managers", status: InProgress, approvers: [sarah, marcus] }]
  }),
  signingRequest({
    id: "b2e1d3c5-6f7a-4d8e-9fa0-1b2c3d4e5f62",
    status: ApprovalRequestStatus.Pending,
    requesterId: me,
    hoursAgo: 5,
    signerName: "firmware",
    data: { requestedSignings: 1 },
    stepSeeds: [{ status: InProgress, approvers: [sarah, marcus] }]
  }),
  signingRequest({
    id: "b2e1d3c5-6f7a-4d8e-9fa0-1b2c3d4e5f63",
    status: ApprovalRequestStatus.Approved,
    requesterId: "u-priya",
    hoursAgo: 30,
    signerName: "desktop-release",
    data: { requestedWindowDuration: "1h" },
    stepSeeds: []
  }),
  signingRequest({
    id: "b2e1d3c5-6f7a-4d8e-9fa0-1b2c3d4e5f64",
    status: ApprovalRequestStatus.Rejected,
    requesterId: "u-devon",
    hoursAgo: 96,
    signerName: "firmware",
    stepSeeds: [
      {
        status: ApprovalRequestStepStatus.Rejected,
        approvers: [marcus],
        decisions: [{ userId: "u-marcus", decision: Rejected, comment: "No release is scheduled." }]
      }
    ]
  })
];

const policy = (partial: Partial<TApprovalPolicy> & Pick<TApprovalPolicy, "id" | "name">) =>
  ({
    projectId,
    type: ApprovalPolicyType.CertRequest,
    maxRequestTtl: null,
    conditions: { version: 1, conditions: [{ profileNames: [tlsServer.slug] }] },
    constraints: { version: 1, constraints: {} },
    steps: [],
    bypassForMachineIdentities: false,
    enforcementLevel: EnforcementLevel.Hard,
    bypassers: [],
    scopeType: null,
    scopeId: null,
    createdAt: ago(24 * 40),
    updatedAt: ago(24 * 12),
    ...partial
  }) as TApprovalPolicy;

const policies: TApprovalPolicy[] = [
  policy({
    id: "c3f2e4d6-7a8b-4e9f-a0b1-2c3d4e5f6a71",
    name: "Production TLS",
    maxRequestTtl: "7d",
    bypassForMachineIdentities: true,
    steps: [
      {
        name: "Security review",
        requiredApprovals: 1,
        notifyApprovers: true,
        approvers: [security]
      },
      { name: "Service owner", requiredApprovals: 1, notifyApprovers: true, approvers: [marcus] }
    ]
  }),
  policy({
    id: "c3f2e4d6-7a8b-4e9f-a0b1-2c3d4e5f6a72",
    name: "Client certificates",
    scopeType: ApprovalPolicyScope.PkiApplication,
    scopeId: "app-payments",
    createdAt: ago(24 * 5),
    conditions: {
      version: 1,
      conditions: [{ profileNames: ["mtls-client", "tls-server", "code-signing", "partner-mtls"] }]
    },
    steps: [{ name: null, requiredApprovals: 2, notifyApprovers: true, approvers: [sarah, marcus] }]
  })
];

const certificateRequests: Record<string, Partial<TCertificateRequestDetails>> = {
  "creq-a1f0c2d4-5b6e-4c7d-8e9f-0a1b2c3d4e51": {
    organization: "Acme Corp",
    organizationalUnit: "Payments",
    country: "CA",
    state: "British Columbia",
    locality: "Vancouver",
    metadata: [
      { key: "team", value: "payments" },
      { key: "ticket", value: "PAY-4821" }
    ],
    customExtensions: [
      {
        oid: "1.3.6.1.4.1.311.20.2",
        critical: false,
        value: "WebServer",
        displayValue: "WebServer"
      }
    ]
  },
  "creq-a1f0c2d4-5b6e-4c7d-8e9f-0a1b2c3d4e53": {
    organization: "Acme Corp",
    country: "CA",
    domainComponents: ["acme", "dev"],
    basicConstraints: { isCA: true, pathLength: 0 }
  }
};

const store = createFixtureStore({ requests, policies });

const decide = (
  requestId: string,
  decision: ApprovalRequestApprovalDecision,
  comment?: string
): TApprovalRequest => {
  store.update((state) => ({
    ...state,
    requests: state.requests.map((request) => {
      if (request.id !== requestId) return request;
      const current = request.steps.findIndex((step) => step.status === InProgress);
      if (current < 0) return request;
      const now = new Date().toISOString();
      const nextSteps = request.steps.map((step, index) => {
        if (index !== current) return step;
        const approvals = [
          ...step.approvals,
          {
            id: `${step.id}-approval-${step.approvals.length + 1}`,
            stepId: step.id,
            approverUserId: me,
            decision,
            comment: comment ?? null,
            createdAt: now,
            updatedAt: now
          }
        ];
        const approved = approvals.filter((entry) => entry.decision === Approved).length;
        let status: ApprovalRequestStepStatus = step.status;
        if (decision === Rejected) status = ApprovalRequestStepStatus.Rejected;
        else if (approved >= step.requiredApprovals) status = Completed;
        return { ...step, approvals, status };
      });
      const advanced = nextSteps.map((step, index) =>
        index === current + 1 && nextSteps[current].status === Completed
          ? { ...step, status: InProgress, startedAt: now }
          : step
      );
      let status: ApprovalRequestStatus = request.status;
      if (decision === Rejected) status = ApprovalRequestStatus.Rejected;
      else if (advanced.every((step) => step.status === Completed))
        status = ApprovalRequestStatus.Approved;
      return { ...request, steps: advanced, status, updatedAt: now };
    })
  }));
  return store.get().requests.find((request) => request.id === requestId)!;
};

const setStatus = (requestId: string, status: ApprovalRequestStatus) => {
  store.update((state) => ({
    ...state,
    requests: state.requests.map((request) =>
      request.id === requestId ? { ...request, status } : request
    )
  }));
  return store.get().requests.find((request) => request.id === requestId)!;
};

export const approvalRequestsDemo: ApprovalRequestsAdapter = {
  useViewer: () => result({ isAdmin: true, groupIds: ["g-security"] }),
  useRequests: ({ policyType }) => {
    const state = store.use();
    return result(state.requests.filter((request) => request.type === policyType));
  },
  useRequest: ({ requestId, policyType }) => {
    const state = store.use();
    return result(
      state.requests.find((request) => request.id === requestId && request.type === policyType)
    );
  },
  usePolicies: ({ policyType }) => {
    const state = store.use();
    return result(state.policies.filter((entry) => entry.type === policyType));
  },
  useApprovers: () => result(directory),
  useApplications: (applicationIds) =>
    result(applications.filter((application) => applicationIds.includes(application.id))),
  useApplication: (applicationId) =>
    result(applications.find((application) => application.id === applicationId)),
  useProfile: (profileId) => result(profiles.find((profile) => profile.id === profileId)),
  useCertificateRequest: (requestId) => {
    const extra = certificateRequests[requestId];
    return result(
      extra
        ? ({
            status: "pending_approval",
            createdAt: ago(1),
            updatedAt: ago(1),
            ...extra
          } as TCertificateRequestDetails)
        : undefined
    );
  },
  useApprove: fixtureMutation(({ requestId, comment }) => decide(requestId, Approved, comment)),
  useReject: fixtureMutation(({ requestId, comment }) => decide(requestId, Rejected, comment)),
  useCancel: fixtureMutation(({ requestId }) =>
    setStatus(requestId, ApprovalRequestStatus.Cancelled)
  ),
  useUpdatePolicy: fixtureMutation(({ policyId, policyType: _type, ...changes }) => {
    store.update((state) => ({
      ...state,
      policies: state.policies.map((entry) =>
        entry.id === policyId
          ? ({
              ...entry,
              ...changes,
              conditions: changes.conditions
                ? { version: 1, conditions: changes.conditions }
                : entry.conditions,
              constraints: changes.constraints
                ? { version: 1, constraints: changes.constraints }
                : entry.constraints,
              updatedAt: new Date().toISOString()
            } as TApprovalPolicy)
          : entry
      )
    }));
    return store.get().policies.find((entry) => entry.id === policyId)!;
  }),
  useDeletePolicy: fixtureMutation(({ policyId }) => {
    store.update((state) => ({
      ...state,
      policies: state.policies.filter((entry) => entry.id !== policyId)
    }));
    return policyId;
  })
};
