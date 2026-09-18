import { SignerRequestStatus, TSignerMember } from "@app/hooks/api/signers";

export type FilterStatus = "pending" | "approved" | "expired" | "revoked";

export const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" }
];

export type MemberDescriptor = { label: string; kind: "user" | "identity" | "group" };

export const statusVariant = (status: SignerRequestStatus | string) => {
  switch (status) {
    case SignerRequestStatus.Pending:
      return "warning" as const;
    case SignerRequestStatus.Approved:
      return "success" as const;
    case SignerRequestStatus.Cancelled:
    case SignerRequestStatus.Rejected:
      return "danger" as const;
    case SignerRequestStatus.Expired:
      return "neutral" as const;
    default:
      return "neutral" as const;
  }
};

export const statusLabel = (status: SignerRequestStatus | string) => {
  switch (status) {
    case SignerRequestStatus.Pending:
      return "Pending";
    case SignerRequestStatus.Approved:
      return "Active";
    case SignerRequestStatus.Cancelled:
      return "Revoked";
    case SignerRequestStatus.Rejected:
      return "Rejected";
    case SignerRequestStatus.Expired:
      return "Expired";
    default:
      return status;
  }
};

export const labelForUser = (m: TSignerMember): MemberDescriptor => ({
  label: m.details?.name || m.details?.username || m.details?.email || (m.actorUserId as string),
  kind: "user"
});

export const labelForIdentity = (m: TSignerMember): MemberDescriptor => ({
  label: m.details?.name || (m.actorIdentityId as string),
  kind: "identity"
});

export const compactDuration = (ms: number): string => {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};
