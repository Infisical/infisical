import { randomUUID } from "node:crypto";

import { InMemoryInstanceConfigCoreDataAccess } from "./in-memory-instance-config-core-data-access";
import { describeInstanceConfigDataAccessContract } from "./instance-config-data-access-contract";

let inMemory = new InMemoryInstanceConfigCoreDataAccess();

describeInstanceConfigDataAccessContract("in memory", () => ({
  build: async () => {
    inMemory = new InMemoryInstanceConfigCoreDataAccess();
    return inMemory;
  },
  addSamlOrg: async () => {
    const org = { id: randomUUID(), slug: `org-${randomUUID()}` };
    inMemory.state.addOrg(org.id, { slug: org.slug, authEnforced: false, authMethod: "saml" });
    return org;
  }
}));
