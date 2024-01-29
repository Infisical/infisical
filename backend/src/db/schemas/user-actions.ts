// Code generated by automation script, DO NOT EDIT.
// Automated by pulling database and generating zod schema
// To update. Just run npm run generate:schema
// Written by akhilmhdh.

import { z } from "zod";

import { TImmutableDBKeys } from "./models";

export const UserActionsSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  userId: z.string().uuid(),
});

export type TUserActions = z.infer<typeof UserActionsSchema>;
export type TUserActionsInsert = Omit<TUserActions, TImmutableDBKeys>;
export type TUserActionsUpdate = Partial<Omit<TUserActions, TImmutableDBKeys>>;
