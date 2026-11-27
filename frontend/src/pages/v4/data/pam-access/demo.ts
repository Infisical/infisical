import ms from "ms";

import {
  PamAccessGrantStatus,
  PamAccessRequestStatus,
  PamAccessStatus,
  PamAccessType,
  PamAccountType,
  PamApproverType,
  PamHeartbeatStatus,
  PamRotationStatus,
  type TPamAccessRequest,
  type TPamAccountRotation,
  type TPamMembersData
} from "@app/hooks/api/pam";

import { DEMO_PAM_PROJECT_ID } from "../access/fixtures";
import { createFixtureStore } from "../fixture-store";
import { accessRequestStore, accountStore } from "../pam/demo";
import {
  evaluateDemoAutoApproval,
  pamAccessApprovalsDemo,
  useDemoAutoApprovalInputs
} from "./approvals/demo";
import type { PamAccessAdapter } from "./contract";

const TERRAFORM_IDENTITY_ID = "1f6c3e9b-7a24-4d0e-8b51-c2e9a7d40f36";
const loadedAt = Date.now();
const ago = (minutes: number) => new Date(loadedAt - minutes * 60_000).toISOString();

const member = (
  membershipId: string,
  target: { userId?: string; groupId?: string; identityId?: string },
  role: string,
  expiresAt: string | null = null
) => ({
  membershipId,
  ...target,
  role,
  isActive: true,
  expiresAt,
  createdAt: ago(60 * 24 * 30)
});

const seedMembers = (scope: "account" | "folder", id: string): TPamMembersData =>
  scope === "folder"
    ? {
        users: [
          member(`${id}-u1`, { userId: "u-sarah" }, "admin"),
          member(`${id}-u2`, { userId: "u-marcus" }, "operator"),
          member(`${id}-u3`, { userId: "u-hana" }, "connector", ago(-60 * 24 * 6))
        ],
        groups: [member(`${id}-g1`, { groupId: "g-platform" }, "connector")],
        identities: [member(`${id}-i1`, { identityId: TERRAFORM_IDENTITY_ID }, "auditor")]
      }
    : {
        users: [member(`${id}-u1`, { userId: "u-priya" }, "connector")],
        groups: [],
        identities: []
      };

type MemberKind = keyof TPamMembersData;
const memberStore = createFixtureStore<Record<string, TPamMembersData>>({});
const keyOf = (scope: "account" | "folder", id: string) => `${scope}:${id}`;
const membersOf = (scope: "account" | "folder", id: string) =>
  memberStore.get()[keyOf(scope, id)] ?? seedMembers(scope, id);

const useMembers = (scope: "account" | "folder", id: string) => {
  const all = memberStore.use();
  return {
    data: id ? (all[keyOf(scope, id)] ?? seedMembers(scope, id)) : undefined,
    isPending: false,
    error: null
  };
};

const targetKey = { users: "userId", groups: "groupId", identities: "identityId" } as const;

const changeMembers = (
  scope: "account" | "folder",
  id: string,
  kind: MemberKind,
  targetId: string,
  change: (list: TPamMembersData[MemberKind]) => TPamMembersData[MemberKind]
) => {
  const current = membersOf(scope, id);
  memberStore.update((all) => ({
    ...all,
    [keyOf(scope, id)]: { ...current, [kind]: change(current[kind]) }
  }));
  return { targetId };
};

const addMember = (
  scope: "account" | "folder",
  id: string,
  kind: MemberKind,
  targetId: string,
  role: string,
  expiry?: string | null
) => {
  if (membersOf(scope, id)[kind].some((entry) => entry[targetKey[kind]] === targetId))
    throw new Error("Already a member");
  const expiryMs = expiry ? ms(expiry as Parameters<typeof ms>[0]) : undefined;
  return changeMembers(scope, id, kind, targetId, (list) => [
    ...list,
    {
      membershipId: crypto.randomUUID(),
      [targetKey[kind]]: targetId,
      role,
      isActive: true,
      expiresAt:
        typeof expiryMs === "number" ? new Date(Date.now() + expiryMs).toISOString() : null,
      createdAt: new Date().toISOString()
    }
  ]);
};

const updateMember = (
  scope: "account" | "folder",
  id: string,
  kind: MemberKind,
  targetId: string,
  role: string
) =>
  changeMembers(scope, id, kind, targetId, (list) =>
    list.map((entry) => (entry[targetKey[kind]] === targetId ? { ...entry, role } : entry))
  );

const removeMember = (
  scope: "account" | "folder",
  id: string,
  kind: MemberKind,
  targetId: string
) =>
  changeMembers(scope, id, kind, targetId, (list) =>
    list.filter((entry) => entry[targetKey[kind]] !== targetId)
  );

const mutation =
  <TVariables, TData>(run: (variables: TVariables) => TData) =>
  () => ({ isPending: false, mutateAsync: async (variables: TVariables) => run(variables) });

const rotationStore = createFixtureStore<Record<string, TPamAccountRotation>>({});
const rotationOf = (accountId: string): TPamAccountRotation => {
  const stored = rotationStore.get()[accountId];
  if (stored) return stored;
  const account = accountStore.get().find(({ id }) => id === accountId);
  const failing = account?.heartbeatStatus === PamHeartbeatStatus.InvalidCredentials;
  return {
    enabled: true,
    intervalSeconds: 86400,
    passwordRequirements: {
      length: 32,
      required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 0 }
    },
    rotationAccountId: null,
    rotationAccountName: null,
    lastRotatedAt: failing ? ago(60 * 24 * 3) : ago(60 * 5),
    rotationStatus: failing ? PamRotationStatus.Failed : PamRotationStatus.Success,
    lastRotationError: failing ? "Authentication failed for the rotation account" : null,
    isReady: true,
    sharedIdentity: []
  };
};

const setAccount = (
  accountId: string,
  change: Partial<ReturnType<typeof accountStore.get>[number]>
) =>
  accountStore.update((current) =>
    current.map((account) => (account.id === accountId ? { ...account, ...change } : account))
  );

export const pamAccessDemo: PamAccessAdapter = {
  ...pamAccessApprovalsDemo,
  useAccountMembers: (accountId) => useMembers("account", accountId),
  useFolderMembers: (folderId) => useMembers("folder", folderId),
  useResourceRoles: () => ({
    data: [
      { slug: "admin", name: "Admin", description: "Manage members, policies and accounts" },
      { slug: "operator", name: "Operator", description: "Connect and rotate credentials" },
      { slug: "connector", name: "Connector", isDefault: true, description: "Launch sessions" },
      { slug: "auditor", name: "Auditor", description: "View sessions and audit logs" }
    ],
    isPending: false,
    error: null
  }),
  useProductGroups: () => ({
    data: [
      member("pg-platform", { groupId: "g-platform" }, "member"),
      member("pg-security", { groupId: "g-security" }, "member")
    ],
    isPending: false,
    error: null
  }),
  useAddAccountUser: mutation(({ accountId, userId, role, expiry }) =>
    addMember("account", accountId, "users", userId, role, expiry)
  ),
  useAddAccountGroup: mutation(({ accountId, groupId, role, expiry }) =>
    addMember("account", accountId, "groups", groupId, role, expiry)
  ),
  useAddAccountIdentity: mutation(({ accountId, identityId, role, expiry }) =>
    addMember("account", accountId, "identities", identityId, role, expiry)
  ),
  useUpdateAccountUser: mutation(({ accountId, userId, role }) =>
    updateMember("account", accountId, "users", userId, role)
  ),
  useUpdateAccountGroup: mutation(({ accountId, groupId, role }) =>
    updateMember("account", accountId, "groups", groupId, role)
  ),
  useUpdateAccountIdentity: mutation(({ accountId, identityId, role }) =>
    updateMember("account", accountId, "identities", identityId, role)
  ),
  useRemoveAccountUser: mutation(({ accountId, userId }) =>
    removeMember("account", accountId, "users", userId)
  ),
  useRemoveAccountGroup: mutation(({ accountId, groupId }) =>
    removeMember("account", accountId, "groups", groupId)
  ),
  useRemoveAccountIdentity: mutation(({ accountId, identityId }) =>
    removeMember("account", accountId, "identities", identityId)
  ),
  useAddFolderUser: mutation(({ folderId, userId, role, expiry }) =>
    addMember("folder", folderId, "users", userId, role, expiry)
  ),
  useAddFolderGroup: mutation(({ folderId, groupId, role, expiry }) =>
    addMember("folder", folderId, "groups", groupId, role, expiry)
  ),
  useAddFolderIdentity: mutation(({ folderId, identityId, role, expiry }) =>
    addMember("folder", folderId, "identities", identityId, role, expiry)
  ),
  useUpdateFolderUser: mutation(({ folderId, userId, role }) =>
    updateMember("folder", folderId, "users", userId, role)
  ),
  useUpdateFolderGroup: mutation(({ folderId, groupId, role }) =>
    updateMember("folder", folderId, "groups", groupId, role)
  ),
  useUpdateFolderIdentity: mutation(({ folderId, identityId, role }) =>
    updateMember("folder", folderId, "identities", identityId, role)
  ),
  useRemoveFolderUser: mutation(({ folderId, userId }) =>
    removeMember("folder", folderId, "users", userId)
  ),
  useRemoveFolderGroup: mutation(({ folderId, groupId }) =>
    removeMember("folder", folderId, "groups", groupId)
  ),
  useRemoveFolderIdentity: mutation(({ folderId, identityId }) =>
    removeMember("folder", folderId, "identities", identityId)
  ),

  useHeartbeat: (accountId) => {
    const account = accountStore.use().find(({ id }) => id === accountId);
    if (!account) return { data: undefined, isPending: false, error: null };
    const status = account.heartbeatStatus ?? null;
    return {
      data: {
        enabled: Boolean(account.heartbeatEnabled),
        intervalSeconds: account.heartbeatEnabled ? 3600 : null,
        status,
        lastCheckedAt: status ? ago(12) : null,
        lastHealthyAt: status === PamHeartbeatStatus.Healthy ? ago(12) : ago(60 * 26),
        nextCheckAt: account.heartbeatEnabled ? ago(-48) : null,
        templateName: account.templateName ?? "Default",
        lastMessage:
          status === PamHeartbeatStatus.InvalidCredentials
            ? "Password authentication failed for the stored credentials"
            : null
      },
      isPending: false,
      error: null
    };
  },
  useCheckHeartbeat: mutation(({ accountId }) => {
    setAccount(accountId, { heartbeatStatus: PamHeartbeatStatus.Healthy });
    return { heartbeatStatus: PamHeartbeatStatus.Healthy };
  }),
  useRotation: (accountId) => {
    rotationStore.use();
    return { data: accountId ? rotationOf(accountId) : undefined, isPending: false, error: null };
  },
  useRotationCandidates: (accountId) => {
    const accounts = accountStore.use();
    const account = accounts.find(({ id }) => id === accountId);
    const peers = accounts.filter(
      (entry) => entry.id !== accountId && entry.accountType === account?.accountType
    );
    const folders = [...new Set(peers.map(({ folderId }) => folderId))];
    return {
      data: folders.map((folderId) => {
        const inFolder = peers.filter((entry) => entry.folderId === folderId);
        return {
          folderId,
          folderName: inFolder[0]?.folderName ?? null,
          accounts: inFolder.map(({ id, name }) => ({
            id,
            name,
            host: `${name}.internal.acme.dev`
          }))
        };
      }),
      isPending: false,
      error: null
    };
  },
  useUpdateRotation: mutation(({ accountId, rotationAccountId }) => {
    const name = accountStore.get().find(({ id }) => id === rotationAccountId)?.name ?? null;
    rotationStore.update((all) => ({
      ...all,
      [accountId]: { ...rotationOf(accountId), rotationAccountId, rotationAccountName: name }
    }));
    return {};
  }),
  useRotateNow: mutation(({ accountId }) => {
    rotationStore.update((all) => ({
      ...all,
      [accountId]: {
        ...rotationOf(accountId),
        lastRotatedAt: new Date().toISOString(),
        rotationStatus: PamRotationStatus.Success,
        lastRotationError: null
      }
    }));
    return {};
  }),
  useDependencies: (accountId) => {
    const account = accountStore.use().find(({ id }) => id === accountId);
    if (!account) return { data: [], isPending: false, error: null };
    return {
      data: [
        {
          id: `${accountId}-d1`,
          type: "windows-service",
          name: `${account.name}-sync`,
          machine: "app-01.corp.acme.dev",
          data: null,
          rotationStatus: PamRotationStatus.Success,
          lastRotatedAt: ago(60 * 5),
          lastRotationMessage: null
        },
        {
          id: `${accountId}-d2`,
          type: "scheduled-task",
          name: "nightly-export",
          machine: "batch-02.corp.acme.dev",
          data: null,
          rotationStatus: PamRotationStatus.Failed,
          lastRotatedAt: ago(60 * 5),
          lastRotationMessage: "The task scheduler on batch-02 refused the new credentials"
        }
      ],
      isPending: false,
      error: null
    };
  },

  useRevealCredentials: mutation(({ accountId }) => {
    const account = accountStore.get().find(({ id }) => id === accountId);
    if (!account) throw new Error("Account not found");
    return {
      accountType: account.accountType as PamAccountType,
      credentials: {
        username: `svc_${account.name.replace(/-/g, "_")}`,
        password: "example"
      }
    };
  }),
  useMfaChallenge: () => async () => "verified",
  useAccountApprovers: (accountId) => {
    const account = accountStore.use().find(({ id }) => id === accountId);
    const autoApprovalInputs = useDemoAutoApprovalInputs(account?.folderId);
    return {
      data: account?.requiresApproval
        ? {
            steps: [
              {
                requiredApprovals: 1,
                approvers: [
                  { type: PamApproverType.User, name: "Sarah Chen" },
                  { type: PamApproverType.Group, name: "security", memberCount: 2 }
                ]
              }
            ],
            autoApprovalInputs,
            autoApprovalOnly: false
          }
        : { steps: [], autoApprovalInputs: [], autoApprovalOnly: false },
      isPending: false,
      error: null
    };
  },
  useCreateAccessRequest: mutation(
    ({ accountId, duration, reason, accessType, breakGlass, autoApprovalInputs }) => {
      const account = accountStore.get().find(({ id }) => id === accountId);
      if (!account) throw new Error("Account not found");
      const now = new Date().toISOString();
      const autoApproval =
        !breakGlass && account.requiresApproval && account.folderId
          ? evaluateDemoAutoApproval(account.folderId, autoApprovalInputs ?? [])
          : null;
      const approved =
        Boolean(breakGlass) || !account.requiresApproval || Boolean(autoApproval?.approvedAt);
      const grantMs = ms(duration as Parameters<typeof ms>[0]);
      const grantExpiresAt = approved
        ? new Date(Date.now() + (typeof grantMs === "number" ? grantMs : 3_600_000)).toISOString()
        : null;
      const request: TPamAccessRequest = {
        id: crypto.randomUUID(),
        projectId: DEMO_PAM_PROJECT_ID,
        policyId: "",
        requesterId: "u-sarah",
        requesterName: "Sarah Chen",
        requesterEmail: "sarah@acme.dev",
        type: "pam-access",
        status: approved ? PamAccessRequestStatus.Approved : PamAccessRequestStatus.Pending,
        justification: reason ?? null,
        currentStep: 1,
        requestData: {
          version: 1,
          requestData: { accountId, folderId: account.folderId, reason, duration, accessType }
        },
        expiresAt: null,
        scopeType: null,
        scopeId: null,
        createdAt: now,
        updatedAt: now,
        accountName: account.name,
        folderName: account.folderName ?? undefined,
        accessType,
        grantId: approved ? crypto.randomUUID() : null,
        grantExpiresAt,
        grantStatus: approved ? PamAccessGrantStatus.Active : null,
        isBreakGlass: Boolean(breakGlass),
        bypassReason: breakGlass ? (reason ?? null) : null,
        autoApprovedAt: approved && !breakGlass ? now : null,
        autoApproval
      };
      accessRequestStore.update((current) => [request, ...current]);
      const status = approved ? PamAccessStatus.Granted : PamAccessStatus.Pending;
      const pendingRequestId = approved ? null : request.id;
      setAccount(
        accountId,
        accessType === PamAccessType.Credential
          ? { credentialAccessStatus: status, credentialPendingRequestId: pendingRequestId }
          : { accessStatus: status, pendingRequestId, grantExpiresAt }
      );
      return { request };
    }
  ),
  useBreakGlass: mutation(({ requestId, bypassReason }) => {
    accessRequestStore.update((current) =>
      current.map((entry) =>
        entry.id === requestId
          ? {
              ...entry,
              status: PamAccessRequestStatus.Approved,
              isBreakGlass: true,
              bypassReason,
              grantStatus: PamAccessGrantStatus.Active
            }
          : entry
      )
    );
    accountStore.update((current) =>
      current.map((account) => {
        if (account.pendingRequestId === requestId)
          return { ...account, accessStatus: PamAccessStatus.Granted, pendingRequestId: null };
        if (account.credentialPendingRequestId === requestId)
          return {
            ...account,
            credentialAccessStatus: PamAccessStatus.Granted,
            credentialPendingRequestId: null
          };
        return account;
      })
    );
    return {};
  }),
  useCancelAccessRequest: mutation(({ requestId }) => {
    accessRequestStore.update((current) =>
      current.map((entry) =>
        entry.id === requestId ? { ...entry, status: PamAccessRequestStatus.Cancelled } : entry
      )
    );
    accountStore.update((current) =>
      current.map((account) => {
        if (account.pendingRequestId === requestId)
          return { ...account, accessStatus: PamAccessStatus.None, pendingRequestId: null };
        if (account.credentialPendingRequestId === requestId)
          return {
            ...account,
            credentialAccessStatus: PamAccessStatus.None,
            credentialPendingRequestId: null
          };
        return account;
      })
    );
    return {};
  }),
  useHasEnterpriseAlerting: () => ({ data: true, isPending: false, error: null })
};
