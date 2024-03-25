import { z } from "zod";

export const MemberSchema = z.object({
  id: z.string(),
  inviteEmail: z.string().nullable(),
  orgId: z.string(),
  role: z.string(),
  roleId: z.string().nullable(),
  status: z.string(),
  projects: z.array(z.string()).nullable(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  userId: z.string(),
  publicKey: z.string()
});

export type MemberProps = z.infer<typeof MemberSchema>;

export type MembersProp = MemberProps[];
