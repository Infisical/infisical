import { TActorInput } from "@app/lib/types";

export type TExportCertManagerProjectDTO = {
  sourceProjectId: string;
} & TActorInput;

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
