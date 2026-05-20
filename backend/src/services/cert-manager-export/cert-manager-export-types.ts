import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export type TExportCertManagerProjectDTO = {
  sourceProjectId: string;
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};

export type TExportCertManagerProjectResult = {
  sourceProjectId: string;
  destinationProjectId: string;
  exportedCertificateAuthorities: number;
  renamedCertificateAuthorities: { originalName: string; newName: string }[];
  exportedCertificatePolicies: number;
  renamedCertificatePolicies: { originalName: string; newName: string }[];
  exportedCertificateProfiles: number;
  skippedCertificateProfiles: number;
  renamedCertificateProfiles: { originalSlug: string; newSlug: string }[];
};
