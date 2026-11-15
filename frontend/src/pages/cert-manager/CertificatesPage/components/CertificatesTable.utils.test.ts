import { describe, expect, it } from "vitest";

import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { CertStatus } from "@app/hooks/api/certificates/enums";

import {
  canRenewOnExistingKeyPair,
  getApplicationCertificateAccess,
  getCertificateDeletedBySummary,
  getCertificateDeletionWarning,
  getCertificateDisplayStatus,
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
      canDelete: true,
      canManagePkiSyncs: true
    });
  });

  it("keeps actions disabled without blaming a role while the ability loads", () => {
    const access = getApplicationCertificateAccess({ applicationName });

    expect(access).toEqual({
      canRenew: false,
      canEdit: false,
      canDelete: false,
      canManagePkiSyncs: false
    });
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
