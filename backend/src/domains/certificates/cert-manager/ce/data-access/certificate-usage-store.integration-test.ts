import { randomUUID } from "node:crypto";

import { setupIntegration } from "@app/domains/lib/testing/integration";
import { Meter } from "@app/domains/platform/license/ce/module";
import { usageCounter } from "@app/domains/platform/license/ce/testing/usage-counter";
import { OrganizationsProjectsModule } from "@app/domains/platform/organizations-projects/ce/module";

import { CertManagerModule } from "../module";
import { seedPkiOrgs } from "../testing/pki-fixture";

describe("CertManagerModule usage counters", () => {
  const h = setupIntegration();

  const build = () => {
    const { organizationsProjectsService } = new OrganizationsProjectsModule({ db: h.db });
    return { module: new CertManagerModule({ db: h.db, organizationsProjectsService }) };
  };

  const count = ({ module }: ReturnType<typeof build>, meter: Meter, orgId: string | null) =>
    usageCounter(module.usageCounters, meter).count(orgId);

  test("should count internal CAs across the root org's tree", async () => {
    // Setup
    const pki = await seedPkiOrgs(h.db, h.factories);
    await pki.internalCa(pki.rootProject.id);
    await pki.internalCa(pki.subProject.id);
    const built = build();

    // Action
    const cas = await count(built, Meter.InternalCas, pki.root.id);

    // Assert
    expect(cas).toBe(2);
  });

  test("should exclude expired, revoked and code-signing certificates from active certificates", async () => {
    // Setup
    const pki = await seedPkiOrgs(h.db, h.factories);
    await pki.certificate(pki.rootProject.id, "live.test");
    await pki.certificate(pki.rootProject.id, "expired.test", { expired: true });
    await pki.certificate(pki.rootProject.id, "revoked.test", { revoked: true });
    await pki.signer(pki.rootProject.id, "signing.test");
    const built = build();

    // Action
    const active = await count(built, Meter.ActiveCerts, pki.root.id);

    // Assert
    expect(active).toBe(1);
  });

  test("should count a name once across the tree, and wildcards as a subset", async () => {
    // Setup
    const pki = await seedPkiOrgs(h.db, h.factories);
    await pki.certificate(pki.rootProject.id, "same.test");
    await pki.certificate(pki.subProject.id, "same.test");
    await pki.certificate(pki.subProject.id, "*.wild.test");
    const built = build();

    // Action
    const [active, wildcard] = await Promise.all([
      count(built, Meter.ActiveCerts, pki.root.id),
      count(built, Meter.WildcardCerts, pki.root.id)
    ]);

    // Assert
    expect([active, wildcard]).toEqual([2, 1]);
  });

  test("should count nothing for an unrelated org, and every org when no org is given", async () => {
    // Setup
    const pki = await seedPkiOrgs(h.db, h.factories);
    await pki.certificate(pki.rootProject.id, "only.test");
    const built = build();

    // Action
    const [unrelated, instance] = await Promise.all([
      count(built, Meter.ActiveCerts, randomUUID()),
      count(built, Meter.ActiveCerts, null)
    ]);

    // Assert
    expect(unrelated).toBe(0);
    expect(instance).toBeGreaterThanOrEqual(1);
  });

  test("should report a name as active only in the tree that holds it", async () => {
    // Setup
    const pki = await seedPkiOrgs(h.db, h.factories);
    const other = await seedPkiOrgs(h.db, h.factories);
    await pki.certificate(pki.subProject.id, "held.test");
    const built = build();

    // Action
    const [inTree, elsewhere] = await Promise.all([
      built.module.certManagerService.isCertificateQuotaKeyActive(pki.root.id, "held.test"),
      built.module.certManagerService.isCertificateQuotaKeyActive(other.root.id, "held.test")
    ]);

    // Assert
    expect([inTree, elsewhere]).toEqual([true, false]);
  });

  test("should attribute each active name to one org in the tree", async () => {
    // Setup
    const pki = await seedPkiOrgs(h.db, h.factories);
    await pki.certificate(pki.rootProject.id, "a.test");
    await pki.certificate(pki.subProject.id, "a.test");
    await pki.certificate(pki.subProject.id, "b.test");
    const built = build();

    // Action
    const rows = await built.module.certManagerService.getActiveCertificateOrgBreakdown(pki.root.id);

    // Assert
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(2);
  });
});
