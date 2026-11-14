import { randomUUID } from "node:crypto";

import { InMemoryPlatformRows } from "../testing/in-memory-platform-rows";
import { InMemoryProjectKeyStore } from "../testing/in-memory-project-key-store";
import { describeProjectKeyStoreContract } from "../testing/project-key-store-contract";

describeProjectKeyStoreContract("in-memory", async () => {
  const rows = new InMemoryPlatformRows();
  return {
    store: new InMemoryProjectKeyStore(rows),
    newProject: async () => {
      const projectId = randomUUID();
      const orgId = randomUUID();
      rows.addProject(projectId, orgId);
      return { projectId, orgId };
    },
    newKmsKeyId: async () => randomUUID(),
    scheduleDeletion: async (projectId) => {
      const project = rows.projects.get(projectId)!;
      rows.projects.set(projectId, { ...project, deleteAfter: new Date() });
    }
  };
});
