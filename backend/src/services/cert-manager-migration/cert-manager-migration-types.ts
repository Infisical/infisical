import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export type TMigrateCertManagerProjectDTO = {
  sourceProjectId: string;
  destinationProjectId: string;
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};

export type TMigrateCertManagerProjectResult = {
  sourceProjectId: string;
  destinationProjectId: string;
  migratedCertificateAuthorities: number;
  renamedCertificateAuthorities: { originalName: string; newName: string }[];
  migratedCertificatePolicies: number;
  renamedCertificatePolicies: { originalName: string; newName: string }[];
  migratedCertificateProfiles: number;
  skippedCertificateProfiles: number;
  renamedCertificateProfiles: { originalSlug: string; newSlug: string }[];
};
