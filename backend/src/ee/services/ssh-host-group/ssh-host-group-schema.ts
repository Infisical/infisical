import { SshHostGroupsSchema } from "@app/db/schemas/ssh-host-groups";

export const sanitizedSshHostGroup = SshHostGroupsSchema.pick({
  id: true,
  projectId: true,
  name: true
});
