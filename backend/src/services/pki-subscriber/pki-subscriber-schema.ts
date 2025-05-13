import { PkiSubscribersSchema } from "@app/db/schemas";

export const sanitizedPkiSubscriber = PkiSubscribersSchema.pick({
  id: true,
  projectId: true,
  caId: true,
  name: true,
  commonName: true,
  status: true,
  subjectAlternativeNames: true,
  ttl: true,
  keyUsages: true,
  extendedKeyUsages: true
});
