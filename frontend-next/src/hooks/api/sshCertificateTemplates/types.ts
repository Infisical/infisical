export enum SshCertTemplateStatus {
  ACTIVE = "active",
  DISABLED = "disabled"
}

export type TSshCertificateTemplate = {
  id: string;
  sshCaId: string;
  status: SshCertTemplateStatus;
  name: string;
  ttl: string;
  maxTTL: string;
  allowedUsers: string[];
  allowedHosts: string[];
  allowUserCertificates: boolean;
  allowHostCertificates: boolean;
  allowCustomKeyIds: boolean;
};

export type TCreateSshCertificateTemplateDTO = {
  sshCaId: string;
  name: string;
  ttl: string;
  maxTTL: string;
  allowedUsers: string[];
  allowedHosts: string[];
  allowUserCertificates: boolean;
  allowHostCertificates: boolean;
  allowCustomKeyIds: boolean;
};

export type TUpdateSshCertificateTemplateDTO = {
  id: string;
  status?: SshCertTemplateStatus;
  name?: string;
  ttl?: string;
  maxTTL?: string;
  allowedUsers?: string[];
  allowedHosts?: string[];
  allowUserCertificates?: boolean;
  allowHostCertificates?: boolean;
  allowCustomKeyIds?: boolean;
};

export type TDeleteSshCertificateTemplateDTO = {
  id: string;
};
