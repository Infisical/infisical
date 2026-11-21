import { Button } from "@infisical/cipher/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";

import {
  FILTER_KINDS,
  FILTER_LABELS,
  isFilterPresent,
  type TFilterKind
} from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import type { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { usePkiSyncForm, useWatchedValue } from "../fields";
import { useFormCertificateCap } from "./use-certificate-cap";

const FILTER_HINTS: Record<TFilterKind, string> = {
  certificateOrderIds: "An order is a certificate and its renewals",
  profileIds: "Issued from one of these profiles",
  metadata: "Carries this key and value"
};

export const PkiSyncCertificateAddMenu = ({
  applicationId,
  onOpenPicker
}: {
  applicationId?: string;
  onOpenPicker: () => void;
}) => {
  const { setValue } = usePkiSyncForm();
  const filters = useWatchedValue<TPkiSyncFilters | null | undefined>("filters") ?? {};
  const certificateCap = useFormCertificateCap();

  const addableFilterKinds = FILTER_KINDS.filter((kind) => {
    if (certificateCap !== undefined && kind !== "certificateOrderIds") return false;
    return kind === "metadata" || !isFilterPresent(filters, kind);
  });

  const addFilter = (kind: TFilterKind) => {
    if (kind === "certificateOrderIds") {
      onOpenPicker();
      return;
    }
    const next = kind === "metadata" ? [...(filters.metadata ?? []), { key: "" }] : [];
    setValue("filters", { ...filters, [kind]: next }, { shouldDirty: true });
  };

  if (!applicationId || addableFilterKinds.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" icon="plus">
          Add filter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {addableFilterKinds.map((kind) => (
          <DropdownMenuItem
            key={kind}
            description={FILTER_HINTS[kind]}
            onSelect={() => addFilter(kind)}
          >
            {FILTER_LABELS[kind]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
