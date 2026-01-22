import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const ProjectTemplateGroupMembershipsSchema = z.object({
  id: z.string().uuid(),
  projectTemplateId: z.string().uuid(),
  groupId: z.string().uuid(),
  roles: z.string().array(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type TProjectTemplateGroupMemberships = z.infer<typeof ProjectTemplateGroupMembershipsSchema>;
export type TProjectTemplateGroupMembershipsInsert = Omit<
  z.input<typeof ProjectTemplateGroupMembershipsSchema>,
  TImmutableDBKeys
>;
export type TProjectTemplateGroupMembershipsUpdate = Partial<
  Omit<z.input<typeof ProjectTemplateGroupMembershipsSchema>, TImmutableDBKeys>
>;
