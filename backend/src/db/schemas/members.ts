import { z } from "zod";

export const MemberSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  userId: z.string(),
  publicKey: z.string(),
  projects: z.string().array()
});

export type MemberProps = z.infer<typeof MemberSchema>;

export type MembersProp = MemberProps[];
