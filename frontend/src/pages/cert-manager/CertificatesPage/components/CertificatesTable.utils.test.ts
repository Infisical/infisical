import { describe, expect, it } from "vitest";

import {
  ApprovalPolicyType,
  CERTIFICATE_ACTION_POLICY_TYPES
} from "@app/hooks/api/approvalPolicies/types";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import { CertificateDeletionStatus, TCertificate } from "@app/hooks/api/certificates/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import {
  canRenewOnExistingKeyPair,
  CERTIFICATE_ACTION_APPROVALS,
  getApplicationCertificateAccess,
  getCertificateActionApproval,
  getCertificateActionMenuState,
  getCertificateDeletedBySummary,
  getCertificateDeletionToast,
  getCertificateDeletionWarning,
  getCertificateDisplayStatus,
  getPendingRequestLink,
  isRemovedFromSyncDestination
} from "./CertificatesTable.utils";

// Each rule is "<action>" on certificates, or "<action>:<subject>".
const abilityAllowing = (...rules: string[]) => ({
  can: (action: string, subjectType: string) =>
    rules.includes(subjectType === "certificates" ? action : `${action}:${subjectType}`)
});

describe("getApplicationCertificateAccess", () => {
  const applicationName = "payments";

  it("blocks every action for a project admin who is not on the application", () => {
    const access = getApplicationCertificateAccess({
      applicationName,
      permission: abilityAllowing("read", "list")
    });

    expect(access).toMatchObject({
      canRenew: false,
      canEdit: false,
      canDelete: false,
      canManagePkiSyncs: false
    });
    expect(access.managePkiSyncsBlockedReason).toBe(
      "You need the Admin role on payments to manage PKI syncs for this certificate."
    );
    expect(access.renewBlockedReason).toBe(
      "You need the Operator or Admin role on payments to renew this certificate."
    );
    expect(access.editMetadataBlockedReason).toBe(
      "You need the Operator or Admin role on payments to edit this certificate's metadata."
    );
    expect(access.revokeBlockedReason).toBe(
      "You need the Admin role on payments to revoke this certificate."
    );
    expect(access.deleteBlockedReason).toBe(
      "You need the Admin role on payments to delete this certificate."
    );
  });

  it("lets an operator renew but not revoke or delete", () => {
    const access = getApplicationCertificateAccess({
      applicationName,
      permission: abilityAllowing(
        "read",
        "list",
        "create",
        "edit",
        "import",
        "read:pki-syncs",
        "list:pki-syncs",
        "sync-certificates:pki-syncs"
      )
    });

    expect(access).toMatchObject({
      canRenew: true,
      canEdit: true,
      canDelete: false,
      canManagePkiSyncs: false
    });
    expect(access.managePkiSyncsBlockedReason).toBeDefined();
    expect(access.renewBlockedReason).toBeUndefined();
    expect(access.editBlockedReason).toBeUndefined();
    expect(access.editMetadataBlockedReason).toBeUndefined();
    expect(access.deleteBlockedReason).toBeDefined();
  });

  it("allows everything for an application admin", () => {
    const access = getApplicationCertificateAccess({
      applicationName,
      permission: abilityAllowing("read", "list", "create", "edit", "delete", "edit:pki-syncs")
    });

    expect(access).toEqual({
      canRenew: true,
      canEdit: true,
      hasDeletePermission: true,
      canDelete: true,
      canRevoke: true,
      canManagePkiSyncs: true
    });
  });

  it("keeps actions disabled without blaming a role while the ability loads", () => {
    const access = getApplicationCertificateAccess({ applicationName });

    expect(access).toEqual({
      canRenew: false,
      canEdit: false,
      hasDeletePermission: false,
      canDelete: false,
      canRevoke: false,
      canManagePkiSyncs: false
    });
  });

  describe("revoke", () => {
    const operator = abilityAllowing("read", "list", "create", "edit", "request-revocation");

    it("lets an operator request a revocation when a revocation policy covers the certificate", () => {
      const access = getApplicationCertificateAccess({
        applicationName,
        permission: operator,
        isRevocationApprovalRequired: true
      });

      expect(access.canRevoke).toBe(true);
      expect(access.canDelete).toBe(false);
      expect(access.revokeBlockedReason).toBeUndefined();
    });

    it("blocks an operator when no revocation policy covers the certificate", () => {
      const access = getApplicationCertificateAccess({
        applicationName,
        permission: operator,
        isRevocationApprovalRequired: false
      });

      expect(access.canRevoke).toBe(false);
      expect(access.revokeBlockedReason).toBe(
        "You need the Admin role on payments to revoke this certificate."
      );
    });

    it("blocks a member who can't request a revocation, even when a policy covers the certificate", () => {
      const access = getApplicationCertificateAccess({
        applicationName,
        permission: abilityAllowing("read", "list"),
        isRevocationApprovalRequired: true
      });

      expect(access.canRevoke).toBe(false);
      expect(access.revokeBlockedReason).toBe(
        "You need the Operator or Admin role on payments to revoke this certificate."
      );
    });

    it("lets an admin revoke whether or not a policy covers the certificate", () => {
      [true, false].forEach((isRevocationApprovalRequired) => {
        const access = getApplicationCertificateAccess({
          applicationName,
          permission: abilityAllowing("read", "list", "delete"),
          isRevocationApprovalRequired
        });

        expect(access.canRevoke).toBe(true);
        expect(access.revokeBlockedReason).toBeUndefined();
      });
    });
  });

  describe("delete", () => {
    const operator = abilityAllowing(
      "read",
      "list",
      "create",
      "edit",
      "request-revocation",
      "request-deletion"
    );

    it("lets an operator request a deletion when a deletion policy covers the certificate", () => {
      const access = getApplicationCertificateAccess({
        applicationName,
        permission: operator,
        isDeletionApprovalRequired: true
      });

      expect(access.canDelete).toBe(true);
      expect(access.hasDeletePermission).toBe(false);
      expect(access.canRevoke).toBe(false);
      expect(access.deleteBlockedReason).toBeUndefined();
    });

    it("blocks an operator when no deletion policy covers the certificate", () => {
      const access = getApplicationCertificateAccess({
        applicationName,
        permission: operator,
        isRevocationApprovalRequired: true
      });

      expect(access.canDelete).toBe(false);
      expect(access.canRevoke).toBe(true);
      expect(access.deleteBlockedReason).toBe(
        "You need the Admin role on payments to delete this certificate."
      );
    });

    it("blocks a member who can't request a deletion, even when a policy covers the certificate", () => {
      const access = getApplicationCertificateAccess({
        applicationName,
        permission: abilityAllowing("read", "list"),
        isDeletionApprovalRequired: true
      });

      expect(access.canDelete).toBe(false);
      expect(access.deleteBlockedReason).toBe(
        "You need the Operator or Admin role on payments to delete this certificate."
      );
    });

    it("lets an admin delete whether or not a policy covers the certificate", () => {
      [true, false].forEach((isDeletionApprovalRequired) => {
        const access = getApplicationCertificateAccess({
          applicationName,
          permission: abilityAllowing("read", "list", "delete"),
          isDeletionApprovalRequired
        });

        expect(access.canDelete).toBe(true);
        expect(access.hasDeletePermission).toBe(true);
        expect(access.deleteBlockedReason).toBeUndefined();
      });
    });
  });
});

describe("getPendingRequestLink", () => {
  it.each(CERTIFICATE_ACTION_POLICY_TYPES)(
    "opens a %s request from the Approval Requests inbox, not the legacy Approvals page",
    (policyType) => {
      const link = getPendingRequestLink(
        { id: "project-1", orgId: "org-1", type: ProjectType.CertificateManager },
        policyType,
        "request-1"
      );

      expect(link).toMatchObject({ params: { _splat: "approvals/request-1" } });
      expect(link.search).toEqual({ policyType, from: "root-requests" });
    }
  );
});

describe.each([
  {
    policyType: ApprovalPolicyType.CertRevocation,
    pendingLabel: "Revocation Pending",
    doneCertificate: { status: CertStatus.REVOKED, profileName: "web" }
  },
  {
    policyType: ApprovalPolicyType.CertDeletion,
    pendingLabel: "Deletion Pending",
    doneCertificate: {
      status: CertStatus.ACTIVE,
      deletedAt: "2026-11-01T09:00:00.000Z",
      profileName: "web"
    }
  }
] as const)(
  "getCertificateActionApproval for $policyType",
  ({ policyType, pendingLabel, doneCertificate }) => {
    const { pendingReason, replaceableReason } = CERTIFICATE_ACTION_APPROVALS[policyType];
    const certificate = { status: CertStatus.ACTIVE, profileName: "web" };
    const coveringProfiles = new Set(["web"]);
    const decidable = { approversCanNoLongerApprove: false };
    const undecidable = { approversCanNoLongerApprove: true };

    it("blocks the action while a policy covers the certificate's profile", () => {
      expect(
        getCertificateActionApproval({
          policyType,
          certificate,
          pendingRequest: decidable,
          policyProfileNames: coveringProfiles
        })
      ).toEqual({
        isApprovalRequired: true,
        isPending: true,
        pendingLabel,
        blockedReason: pendingReason,
        replacesRequestReason: undefined
      });
    });

    it("lets the action through and says it replaces a request its approvers can no longer approve", () => {
      expect(
        getCertificateActionApproval({
          policyType,
          certificate,
          pendingRequest: undecidable,
          policyProfileNames: coveringProfiles
        })
      ).toMatchObject({
        isPending: true,
        blockedReason: undefined,
        replacesRequestReason: replaceableReason
      });
    });

    it("shows the request but lets the action through once no policy covers the certificate", () => {
      [new Set(["api"]), undefined].forEach((policyProfileNames) => {
        [decidable, undecidable].forEach((pendingRequest) => {
          expect(
            getCertificateActionApproval({
              policyType,
              certificate,
              pendingRequest,
              policyProfileNames
            })
          ).toMatchObject({
            isApprovalRequired: false,
            isPending: true,
            blockedReason: undefined,
            replacesRequestReason: undefined
          });
        });
      });
    });

    it("doesn't require approval for a certificate without a profile", () => {
      expect(
        getCertificateActionApproval({
          policyType,
          certificate: { status: CertStatus.ACTIVE, profileName: null },
          policyProfileNames: coveringProfiles
        }).isApprovalRequired
      ).toBe(false);
    });

    it("ignores a request left on a certificate the action already happened to", () => {
      [decidable, undecidable].forEach((pendingRequest) => {
        expect(
          getCertificateActionApproval({
            policyType,
            certificate: doneCertificate,
            pendingRequest,
            policyProfileNames: coveringProfiles
          })
        ).toMatchObject({
          isPending: false,
          blockedReason: undefined,
          replacesRequestReason: undefined
        });
      });
    });

    it("does nothing without a pending request", () => {
      expect(
        getCertificateActionApproval({
          policyType,
          certificate,
          policyProfileNames: coveringProfiles
        })
      ).toMatchObject({
        isApprovalRequired: true,
        isPending: false,
        blockedReason: undefined,
        replacesRequestReason: undefined
      });
    });
  }
);

describe("getCertificateActionApproval across actions", () => {
  it("keeps showing a pending deletion on a certificate that was revoked", () => {
    expect(
      getCertificateActionApproval({
        policyType: ApprovalPolicyType.CertDeletion,
        certificate: { status: CertStatus.REVOKED, profileName: "web" },
        pendingRequest: { approversCanNoLongerApprove: false },
        policyProfileNames: new Set(["web"])
      }).isPending
    ).toBe(true);
  });
});

describe("getCertificateActionMenuState", () => {
  const applicationName = "payments";
  const operator = abilityAllowing("read", "list", "create", "edit", "request-deletion");
  const certificate = { status: CertStatus.ACTIVE, profileName: "web" };
  const deletionPolicyProfiles = new Set(["web"]);

  const deleteMenuFor = (pendingRequest?: { approversCanNoLongerApprove: boolean }) => {
    const approval = getCertificateActionApproval({
      policyType: ApprovalPolicyType.CertDeletion,
      certificate,
      pendingRequest,
      policyProfileNames: deletionPolicyProfiles
    });
    const access = getApplicationCertificateAccess({
      applicationName,
      permission: operator,
      isDeletionApprovalRequired: approval.isApprovalRequired
    });
    return getCertificateActionMenuState({
      canAct: access.canDelete,
      approval,
      accessBlockedReason: access.deleteBlockedReason
    });
  };

  it("offers Delete to an operator who can only request a deletion of a covered certificate", () => {
    expect(deleteMenuFor()).toEqual({
      isDisabled: false,
      isDisabledFocusable: false,
      reason: undefined
    });
  });

  it("blocks Delete while a deletion of the certificate is waiting for approval", () => {
    expect(deleteMenuFor({ approversCanNoLongerApprove: false })).toEqual({
      isDisabled: true,
      isDisabledFocusable: true,
      reason: CERTIFICATE_ACTION_APPROVALS[ApprovalPolicyType.CertDeletion].pendingReason
    });
  });

  it("offers Delete again when the pending request's approvers can no longer approve it", () => {
    expect(deleteMenuFor({ approversCanNoLongerApprove: true })).toEqual({
      isDisabled: false,
      isDisabledFocusable: false,
      reason: CERTIFICATE_ACTION_APPROVALS[ApprovalPolicyType.CertDeletion].replaceableReason
    });
  });

  it("names the missing role when the user can't take the action", () => {
    const access = getApplicationCertificateAccess({
      applicationName,
      permission: abilityAllowing("read", "list")
    });
    const approval = getCertificateActionApproval({
      policyType: ApprovalPolicyType.CertDeletion,
      certificate
    });

    expect(
      getCertificateActionMenuState({
        canAct: access.canDelete,
        approval,
        accessBlockedReason: access.deleteBlockedReason
      })
    ).toEqual({
      isDisabled: true,
      isDisabledFocusable: true,
      reason: "You need the Admin role on payments to delete this certificate."
    });
  });
});

describe("getCertificateDeletionToast", () => {
  it("says a held deletion hasn't happened yet", () => {
    expect(
      getCertificateDeletionToast({
        message: "",
        status: CertificateDeletionStatus.PendingApproval,
        serialNumber: "01",
        approvalRequestId: "request-1"
      })
    ).toBe("Deletion requested. The certificate isn't deleted until the request is approved.");
  });

  it("confirms a deletion that happened", () => {
    expect(getCertificateDeletionToast({ certificate: {} as TCertificate })).toBe(
      "Successfully deleted certificate"
    );
  });
});

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const deletedAt = "2026-10-20T14:38:27.000Z";

describe("getCertificateDisplayStatus", () => {
  it("reports a deleted certificate as deleted ahead of every other state", () => {
    expect(
      getCertificateDisplayStatus({ status: CertStatus.ACTIVE, notAfter: future, deletedAt }).status
    ).toBe(CertStatus.DELETED);
    expect(
      getCertificateDisplayStatus({ status: CertStatus.REVOKED, notAfter: future, deletedAt })
        .status
    ).toBe(CertStatus.DELETED);
    expect(
      getCertificateDisplayStatus({ status: CertStatus.ACTIVE, notAfter: past, deletedAt }).status
    ).toBe(CertStatus.DELETED);
    expect(
      getCertificateDisplayStatus({
        status: CertStatus.ACTIVE,
        notAfter: future,
        renewedByCertificateId: "next",
        deletedAt
      }).status
    ).toBe(CertStatus.DELETED);
  });

  it("keeps revoked > expired > renewed > active for certificates that were not deleted", () => {
    expect(getCertificateDisplayStatus({ status: CertStatus.REVOKED, notAfter: past }).status).toBe(
      CertStatus.REVOKED
    );
    expect(
      getCertificateDisplayStatus({
        status: CertStatus.ACTIVE,
        notAfter: past,
        renewedByCertificateId: "next"
      }).status
    ).toBe(CertStatus.EXPIRED);
    expect(
      getCertificateDisplayStatus({
        status: CertStatus.ACTIVE,
        notAfter: future,
        renewedByCertificateId: "next",
        deletedAt: null
      }).status
    ).toBe(CertStatus.RENEWED);
    expect(
      getCertificateDisplayStatus({ status: CertStatus.ACTIVE, notAfter: future }).status
    ).toBe(CertStatus.ACTIVE);
  });
});

describe("getCertificateDeletionWarning", () => {
  it("warns that an active certificate stays trusted unless it is revoked", () => {
    expect(
      getCertificateDeletionWarning(
        { status: CertStatus.ACTIVE, notAfter: future, hasPrivateKey: true },
        true
      )
    ).toContain("It stays trusted until");
  });

  it("tells the user to revoke first when the certificate cannot be revoked after deletion", () => {
    expect(
      getCertificateDeletionWarning({ status: CertStatus.ACTIVE, notAfter: future }, true, false)
    ).toContain("It can't be revoked once deleted, so revoke it first");
  });

  it("does not offer revocation when the issuer cannot revoke", () => {
    const warning = getCertificateDeletionWarning(
      { status: CertStatus.ACTIVE, notAfter: future },
      false
    );
    expect(warning).toContain("It stays valid until");
    expect(warning).not.toContain("revoke");
  });

  it("does not claim a private key is deleted when none is held", () => {
    expect(
      getCertificateDeletionWarning({
        status: CertStatus.ACTIVE,
        notAfter: past,
        hasPrivateKey: false
      })
    ).toBe("This removes the certificate. This cannot be undone.");
  });

  it("says nothing about trust for a revoked or expired certificate", () => {
    expect(
      getCertificateDeletionWarning({ status: CertStatus.REVOKED, notAfter: future }, true)
    ).not.toContain("trusted");
    expect(
      getCertificateDeletionWarning({ status: CertStatus.ACTIVE, notAfter: past }, true)
    ).not.toContain("trusted");
  });
});

describe("isRemovedFromSyncDestination", () => {
  it("is true only when Auto-Sync and removal are both on", () => {
    expect(
      isRemovedFromSyncDestination({
        isAutoSyncEnabled: true,
        syncOptions: { canRemoveCertificates: true }
      })
    ).toBe(true);
    expect(
      isRemovedFromSyncDestination({
        isAutoSyncEnabled: false,
        syncOptions: { canRemoveCertificates: true }
      })
    ).toBe(false);
    expect(
      isRemovedFromSyncDestination({
        isAutoSyncEnabled: true,
        syncOptions: { canRemoveCertificates: false }
      })
    ).toBe(false);
  });
});

describe("getCertificateDeletedBySummary", () => {
  it("names the actor that deleted the certificate", () => {
    expect(
      getCertificateDeletedBySummary({
        deletedByActorType: ActorType.USER,
        deletedByActorName: "John Smith"
      })
    ).toBe("John Smith");
  });

  it("falls back to the actor type when the actor no longer exists", () => {
    expect(
      getCertificateDeletedBySummary({
        deletedByActorType: ActorType.IDENTITY,
        deletedByActorName: null
      })
    ).toBe("A machine identity");
    expect(getCertificateDeletedBySummary({ deletedByActorType: ActorType.USER })).toBe("A user");
  });

  it("labels certificates deleted by the cleanup job", () => {
    expect(getCertificateDeletedBySummary({ deletedByActorType: ActorType.PLATFORM })).toBe(
      "Certificate cleanup"
    );
  });
});

describe("canRenewOnExistingKeyPair", () => {
  it("allows a certificate whose private key Infisical holds", () => {
    expect(canRenewOnExistingKeyPair({ hasPrivateKey: true })).toBe(true);
  });

  it("allows a certificate without its private key when it can renew from a stored CSR", () => {
    expect(canRenewOnExistingKeyPair({ hasPrivateKey: false, canRenewFromCsr: true })).toBe(true);
  });

  it("refuses a certificate without its private key that can't renew from a CSR", () => {
    expect(canRenewOnExistingKeyPair({ hasPrivateKey: false, canRenewFromCsr: false })).toBe(false);
    expect(canRenewOnExistingKeyPair({ hasPrivateKey: false })).toBe(false);
  });
});
