import { SshHostGroupsSchema } from "@app/db/schemas";

export const sanitizedSshHostGroup = SshHostGroupsSchema.pick({
  id: true,
  projectId: true,
  name: true
});
