import { getCertificateDisplayName } from "@app/helpers/pkiSyncs";
import { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

export const FILTER_KINDS = ["certificateOrderIds", "profileIds", "metadata"] as const;

export type TFilterKind = (typeof FILTER_KINDS)[number];

export const FILTER_LABELS: Record<TFilterKind, string> = {
  certificateOrderIds: "Certificate Orders",
  profileIds: "Certificate profile",
  metadata: "Metadata"
};

export const isFilterPresent = (filters: TPkiSyncFilters | null | undefined, kind: TFilterKind) =>
  filters?.[kind] !== undefined;

export const hasAnyFilter = (filters: TPkiSyncFilters | null | undefined) =>
  FILTER_KINDS.some((kind) => isFilterPresent(filters, kind));

export const presentFilterKinds = (filters: TPkiSyncFilters | null | undefined): TFilterKind[] =>
  FILTER_KINDS.filter((kind) => isFilterPresent(filters, kind));

const isFilterUnfinished = (filters: TPkiSyncFilters | null | undefined, kind: TFilterKind) => {
  if (!isFilterPresent(filters, kind)) return false;
  if (kind === "profileIds") return false;
  if (kind === "metadata") return (filters?.metadata ?? []).some((pair) => !pair.key.trim());
  return (filters?.[kind] ?? []).length === 0;
};

export const hasUnfinishedFilter = (filters: TPkiSyncFilters | null | undefined) =>
  FILTER_KINDS.some((kind) => isFilterUnfinished(filters, kind));

export const isCertificateOrderTheOnlyFilter = (filters: TPkiSyncFilters | null | undefined) =>
  Boolean(filters) &&
  FILTER_KINDS.every((kind) => kind === "certificateOrderIds" || !isFilterPresent(filters, kind));

export const buildOrderNameMap = (
  certificates: { orderId?: string; commonName: string; altNames?: string | null }[] | undefined
): Map<string, string> =>
  new Map(
    (certificates ?? [])
      .filter((certificate) => certificate.orderId)
      .map((certificate) => [
        certificate.orderId as string,
        getCertificateDisplayName(certificate).originalDisplayName
      ])
  );

const GCP_MAX_CERTIFICATES_PER_MAP_ENTRY = 4;

const NAME_SCHEMA_PLACEHOLDER_PATTERN =
  /\{\{(certificateId|shortCertificateId|profileId|applicationId|applicationName|commonName)\}\}/;

const COMMAND_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

const SINGLE_CERTIFICATE_COMMAND_VARIABLES = ["certificatePath", "commonName"];

type TCapInputs = {
  destinationMaxCertificates?: number;
  syncOptions?: Record<string, unknown>;
  destinationConfig?: Record<string, unknown>;
};

export const getPkiSyncCertificateCap = ({
  destinationMaxCertificates,
  syncOptions,
  destinationConfig
}: TCapInputs): number | undefined => {
  const caps: number[] = [];

  if (destinationMaxCertificates !== undefined) caps.push(destinationMaxCertificates);

  const nameSchema = syncOptions?.certificateNameSchema as string | undefined;
  if (!nameSchema || !NAME_SCHEMA_PLACEHOLDER_PATTERN.test(nameSchema)) caps.push(1);

  const namesOneCertificate = (command: unknown) => {
    if (typeof command !== "string") return false;

    return [...command.matchAll(COMMAND_VARIABLE_PATTERN)].some(([, name]) =>
      SINGLE_CERTIFICATE_COMMAND_VARIABLES.includes(name)
    );
  };

  if (
    namesOneCertificate(syncOptions?.healthCheckCommand) ||
    namesOneCertificate(syncOptions?.postSyncCommand)
  ) {
    caps.push(1);
  }

  const certificateMapBinding = destinationConfig?.certificateMapBinding as
    | { certificateMap?: string }
    | undefined;
  if (certificateMapBinding?.certificateMap) caps.push(GCP_MAX_CERTIFICATES_PER_MAP_ENTRY);

  return caps.length ? Math.min(...caps) : undefined;
};
