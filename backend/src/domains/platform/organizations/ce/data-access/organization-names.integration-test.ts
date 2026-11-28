import { randomUUID } from "node:crypto";

import { setupIntegration } from "@app/domains/lib/testing/integration";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";

import { OrganizationsModule } from "../module";

describe("OrganizationsService organization names", () => {
  const h = setupIntegration();

  const build = () => new OrganizationsModule({ db: h.db, ...accessControlServices(h.db) }).organizationsService;

  const orgTree = async () => {
    const root = await h.factories.organization();
    const sub = await h.factories.organization({ rootOrgId: root.id, parentOrgId: root.id });
    const other = await h.factories.organization();
    return { root, sub, other };
  };

  describe("OrganizationsService.listOrgTreeNames", () => {
    test("should list the whole tree and nothing else, whichever org of the tree is given", async () => {
      // Setup
      const { root, sub } = await orgTree();
      const organizations = build();

      // Action
      const [fromRoot, fromSub] = await Promise.all([
        organizations.listOrgTreeNames(root.id),
        organizations.listOrgTreeNames(sub.id)
      ]);

      // Assert
      const expected = [
        { id: root.id, name: root.name, rootOrgId: null },
        { id: sub.id, name: sub.name, rootOrgId: root.id }
      ];
      expect(fromRoot).toEqual(expect.arrayContaining(expected));
      expect(fromRoot).toHaveLength(2);
      expect(fromSub).toEqual(expect.arrayContaining(expected));
      expect(fromSub).toHaveLength(2);
    });

    test("should list nothing for an org that does not exist", async () => {
      // Action
      const names = await build().listOrgTreeNames(randomUUID());

      // Assert
      expect(names).toEqual([]);
    });
  });

  describe("OrganizationsService.listAllOrgNames", () => {
    test("should list every org on the instance, roots and sub-orgs", async () => {
      // Setup
      const { root, sub, other } = await orgTree();

      // Action
      const names = await build().listAllOrgNames();

      // Assert
      expect(names).toEqual(
        expect.arrayContaining([
          { id: root.id, name: root.name, rootOrgId: null },
          { id: sub.id, name: sub.name, rootOrgId: root.id },
          { id: other.id, name: other.name, rootOrgId: null }
        ])
      );
    });
  });

  describe("OrganizationsService.listRootOrganizations", () => {
    test("should list only root orgs whose name or slug matches, ignoring case", async () => {
      // Setup
      const tag = randomUUID().slice(0, 8);
      const byName = await h.factories.organization({ name: `Acme ${tag}`, slug: `a-${randomUUID()}` });
      const bySlug = await h.factories.organization({ name: `b-${randomUUID()}`, slug: `acme-${tag}` });
      await h.factories.organization({ name: `acme ${tag} sub`, rootOrgId: byName.id, parentOrgId: byName.id });

      // Action
      const page = await build().listRootOrganizations({ search: `ACME ${tag}`.toLowerCase(), limit: 10, offset: 0 });
      const slugPage = await build().listRootOrganizations({ search: `acme-${tag}`, limit: 10, offset: 0 });

      // Assert
      expect(page).toEqual({ organizations: [{ id: byName.id, name: byName.name, slug: byName.slug }], totalCount: 1 });
      expect(slugPage.organizations.map((org) => org.id)).toEqual([bySlug.id]);
    });

    test("should match % and _ in the search literally", async () => {
      // Setup
      const tag = randomUUID().slice(0, 8);
      const percent = await h.factories.organization({ name: `${tag} 50%` });
      await h.factories.organization({ name: `${tag} 500` });
      await h.factories.organization({ name: `${tag} 5x0` });

      // Action
      const [percentPage, underscorePage] = await Promise.all([
        build().listRootOrganizations({ search: `${tag} 50%`, limit: 10, offset: 0 }),
        build().listRootOrganizations({ search: `${tag} 5_0`, limit: 10, offset: 0 })
      ]);

      // Assert
      expect(percentPage.organizations.map((org) => org.id)).toEqual([percent.id]);
      expect(underscorePage).toEqual({ organizations: [], totalCount: 0 });
    });

    test("should page by name and count every match, not just the page", async () => {
      // Setup
      const tag = randomUUID().slice(0, 8);
      await h.factories.organization({ name: `${tag} c` });
      const a = await h.factories.organization({ name: `${tag} a` });
      const b = await h.factories.organization({ name: `${tag} b` });

      // Action
      const page = await build().listRootOrganizations({ search: tag, limit: 2, offset: 0 });
      const next = await build().listRootOrganizations({ search: tag, limit: 2, offset: 1 });

      // Assert
      expect(page.organizations.map((org) => org.id)).toEqual([a.id, b.id]);
      expect(page.totalCount).toBe(3);
      expect(next.organizations.map((org) => org.name)).toEqual([`${tag} b`, `${tag} c`]);
    });
  });
});
