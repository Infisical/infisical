import {
  BarChart3Icon,
  BellIcon,
  BoxIcon,
  CableIcon,
  ChevronsLeftRightEllipsisIcon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  FileCheckIcon,
  FileClockIcon,
  FileKeyIcon,
  FileStackIcon,
  FingerprintIcon,
  FolderArchiveIcon,
  FolderIcon,
  FolderInputIcon,
  HexagonIcon,
  IdCardIcon,
  ImportIcon,
  InboxIcon,
  KeyIcon,
  KeyRoundIcon,
  LayersIcon,
  LockIcon,
  type LucideIcon,
  PenLineIcon,
  PuzzleIcon,
  RadarIcon,
  RadioIcon,
  RefreshCwIcon,
  ScaleIcon,
  ScrollTextIcon,
  SearchIcon,
  ServerIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  StampIcon,
  TableIcon,
  TagIcon,
  UndoIcon,
  UserCheckIcon,
  UsersIcon,
  UsersRoundIcon,
  WebhookIcon
} from "lucide-react";

import { ProjectPermissionSub } from "@app/context";

/**
 * Presentation for every project CASL subject (`ProjectPermissionSub`).
 *
 * A policy group is a kind of thing a role can act on. That is not the same as
 * a Secret Manager overview resource (see `SecretManagerResources`) and not a
 * billing entitlement.
 *
 * Color classes are full Tailwind literals so the compiler can emit them.
 */
export const ProjectPermissionSubjectFamily = {
  SecretManagerResource: "secret-manager-resource",
  SecretManager: "secret-manager",
  ProjectAdmin: "project-admin",
  CertificateManager: "certificate-manager",
  Kms: "kms",
  SecretScanning: "secret-scanning"
} as const;

export type ProjectPermissionSubjectFamily =
  (typeof ProjectPermissionSubjectFamily)[keyof typeof ProjectPermissionSubjectFamily];

export type PermissionSubjectColor = {
  token:
    | "folder"
    | "secret"
    | "dynamic-secret"
    | "import"
    | "secret-rotation"
    | "proxied-service"
    | null;
  textClassName: string;
  tileClassName: string;
};

export type ProjectPermissionSubjectPresentation = {
  family: ProjectPermissionSubjectFamily;
  Icon: LucideIcon;
  color: PermissionSubjectColor;
};

export const PERMISSION_SUBJECT_ACCENT_COLOR = {
  token: null,
  textClassName: "text-accent",
  tileClassName: "border-accent/10 bg-accent/15 text-accent"
} as const satisfies PermissionSubjectColor;

export const PERMISSION_SUBJECT_FOLDER_COLOR = {
  token: "folder",
  textClassName: "text-folder",
  tileClassName: "border-folder/10 bg-folder/15 text-folder"
} as const satisfies PermissionSubjectColor;

export const PERMISSION_SUBJECT_DYNAMIC_SECRET_COLOR = {
  token: "dynamic-secret",
  textClassName: "text-dynamic-secret",
  tileClassName: "border-dynamic-secret/10 bg-dynamic-secret/15 text-dynamic-secret"
} as const satisfies PermissionSubjectColor;

export const PERMISSION_SUBJECT_SECRET_ROTATION_COLOR = {
  token: "secret-rotation",
  textClassName: "text-secret-rotation",
  tileClassName: "border-secret-rotation/10 bg-secret-rotation/15 text-secret-rotation"
} as const satisfies PermissionSubjectColor;

export const PERMISSION_SUBJECT_SECRET_IMPORT_COLOR = {
  token: "import",
  textClassName: "text-import",
  tileClassName: "border-import/10 bg-import/15 text-import"
} as const satisfies PermissionSubjectColor;

export const PERMISSION_SUBJECT_PROXIED_SERVICE_COLOR = {
  token: "proxied-service",
  textClassName: "text-proxied-service",
  tileClassName: "border-proxied-service/10 bg-proxied-service/15 text-proxied-service"
} as const satisfies PermissionSubjectColor;

export const PERMISSION_SUBJECT_SECRET_COLOR = {
  token: "secret",
  textClassName: "text-secret",
  tileClassName: "border-secret/10 bg-secret/15 text-secret"
} as const satisfies PermissionSubjectColor;

export const PERMISSION_SUBJECT_HONEY_TOKEN_COLOR = {
  token: null,
  textClassName: "text-yellow-700",
  tileClassName: "border-yellow-700/10 bg-yellow-700/15 text-yellow-700"
} as const satisfies PermissionSubjectColor;

const present = (
  family: ProjectPermissionSubjectFamily,
  Icon: LucideIcon,
  color: PermissionSubjectColor = PERMISSION_SUBJECT_ACCENT_COLOR
): ProjectPermissionSubjectPresentation => ({ family, Icon, color });

const smResource = (Icon: LucideIcon, color: PermissionSubjectColor) =>
  present(ProjectPermissionSubjectFamily.SecretManagerResource, Icon, color);

const sm = (Icon: LucideIcon) => present(ProjectPermissionSubjectFamily.SecretManager, Icon);

const admin = (Icon: LucideIcon) => present(ProjectPermissionSubjectFamily.ProjectAdmin, Icon);

const pki = (Icon: LucideIcon) => present(ProjectPermissionSubjectFamily.CertificateManager, Icon);

const kms = (Icon: LucideIcon) => present(ProjectPermissionSubjectFamily.Kms, Icon);

const scanning = (Icon: LucideIcon) => present(ProjectPermissionSubjectFamily.SecretScanning, Icon);

export const PROJECT_PERMISSION_SUBJECT_PRESENTATION = {
  [ProjectPermissionSub.Secrets]: smResource(KeyIcon, PERMISSION_SUBJECT_SECRET_COLOR),
  [ProjectPermissionSub.SecretFolders]: smResource(FolderIcon, PERMISSION_SUBJECT_FOLDER_COLOR),
  [ProjectPermissionSub.DynamicSecrets]: smResource(
    FingerprintIcon,
    PERMISSION_SUBJECT_DYNAMIC_SECRET_COLOR
  ),
  [ProjectPermissionSub.SecretRotation]: smResource(
    RefreshCwIcon,
    PERMISSION_SUBJECT_SECRET_ROTATION_COLOR
  ),
  [ProjectPermissionSub.SecretImports]: smResource(
    ImportIcon,
    PERMISSION_SUBJECT_SECRET_IMPORT_COLOR
  ),
  [ProjectPermissionSub.HoneyTokens]: smResource(HexagonIcon, PERMISSION_SUBJECT_HONEY_TOKEN_COLOR),
  [ProjectPermissionSub.ProxiedServices]: smResource(
    ChevronsLeftRightEllipsisIcon,
    PERMISSION_SUBJECT_PROXIED_SERVICE_COLOR
  ),
  [ProjectPermissionSub.SecretRollback]: sm(UndoIcon),
  [ProjectPermissionSub.SecretApproval]: sm(FileCheckIcon),
  [ProjectPermissionSub.SecretApprovalRequest]: sm(FileClockIcon),
  [ProjectPermissionSub.SecretSyncs]: sm(RefreshCwIcon),
  [ProjectPermissionSub.SecretEventSubscriptions]: sm(RadioIcon),
  [ProjectPermissionSub.Environments]: sm(LayersIcon),
  [ProjectPermissionSub.Tags]: sm(TagIcon),
  [ProjectPermissionSub.Integrations]: sm(PuzzleIcon),
  [ProjectPermissionSub.Webhooks]: sm(WebhookIcon),
  [ProjectPermissionSub.ServiceTokens]: sm(KeyRoundIcon),
  [ProjectPermissionSub.Commits]: sm(FileStackIcon),
  [ProjectPermissionSub.ProjectFolderGrant]: sm(FolderInputIcon),
  [ProjectPermissionSub.Role]: admin(ShieldIcon),
  [ProjectPermissionSub.Member]: admin(UsersIcon),
  [ProjectPermissionSub.Groups]: admin(UsersRoundIcon),
  [ProjectPermissionSub.Identity]: admin(IdCardIcon),
  [ProjectPermissionSub.Project]: admin(BoxIcon),
  [ProjectPermissionSub.Settings]: admin(SettingsIcon),
  [ProjectPermissionSub.AuditLogs]: admin(ScrollTextIcon),
  [ProjectPermissionSub.IpAllowList]: admin(ShieldCheckIcon),
  [ProjectPermissionSub.AppConnections]: admin(CableIcon),
  [ProjectPermissionSub.Insights]: admin(BarChart3Icon),
  [ProjectPermissionSub.ApprovalRequests]: admin(InboxIcon),
  [ProjectPermissionSub.ApprovalRequestGrants]: admin(StampIcon),
  [ProjectPermissionSub.Certificates]: pki(FileKeyIcon),
  [ProjectPermissionSub.CertificateAuthorities]: pki(FileKeyIcon),
  [ProjectPermissionSub.CertificateTemplates]: pki(FileStackIcon),
  [ProjectPermissionSub.CertificateProfiles]: pki(FileStackIcon),
  [ProjectPermissionSub.CertificatePolicies]: pki(ScaleIcon),
  [ProjectPermissionSub.CertificateInventoryViews]: pki(TableIcon),
  [ProjectPermissionSub.PkiAlerts]: pki(BellIcon),
  [ProjectPermissionSub.PkiCollections]: pki(FolderArchiveIcon),
  [ProjectPermissionSub.PkiSyncs]: pki(RefreshCwIcon),
  [ProjectPermissionSub.PkiSubscribers]: pki(UserCheckIcon),
  [ProjectPermissionSub.PkiDiscovery]: pki(RadarIcon),
  [ProjectPermissionSub.PkiCertificateInstallations]: pki(DownloadIcon),
  [ProjectPermissionSub.CodeSigners]: pki(PenLineIcon),
  [ProjectPermissionSub.Kms]: kms(LockIcon),
  [ProjectPermissionSub.Cmek]: kms(LockIcon),
  [ProjectPermissionSub.Kmip]: kms(ServerIcon),
  [ProjectPermissionSub.HsmConnectors]: kms(CpuIcon),
  [ProjectPermissionSub.SecretScanningDataSources]: scanning(DatabaseIcon),
  [ProjectPermissionSub.SecretScanningFindings]: scanning(SearchIcon),
  [ProjectPermissionSub.SecretScanningConfigs]: scanning(SlidersHorizontalIcon)
} as const satisfies Record<ProjectPermissionSub, ProjectPermissionSubjectPresentation>;

export const getProjectPermissionSubjectPresentation = (
  subject: ProjectPermissionSub
): ProjectPermissionSubjectPresentation => PROJECT_PERMISSION_SUBJECT_PRESENTATION[subject];

export const PROJECT_PERMISSION_SUBJECT_LIST = (
  Object.entries(PROJECT_PERMISSION_SUBJECT_PRESENTATION) as [
    ProjectPermissionSub,
    ProjectPermissionSubjectPresentation
  ][]
).map(([subject, presentation]) => ({ subject, ...presentation }));
