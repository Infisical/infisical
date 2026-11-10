import crypto from "node:crypto";

import { describeGrantDataAccessContract } from "./grant-data-access-contract";
import { InMemoryAccessControlDataAccess } from "./in-memory-access-control-data-access";

describeGrantDataAccessContract("in memory", () => {
  const id = () => crypto.randomUUID();
  let built: InMemoryAccessControlDataAccess | undefined;
  return {
    build: async () => {
      built = new InMemoryAccessControlDataAccess();
      return built;
    },
    newOrg: async () => id(),
    newProject: async () => id(),
    newUser: async () => id(),
    newIdentity: async () => id()
  };
});
