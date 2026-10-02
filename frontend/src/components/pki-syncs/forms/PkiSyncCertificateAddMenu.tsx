import { useFormContext } from "react-hook-form";
import { PlusIcon } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v3";
import { PkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";
import { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import {
  FILTER_KINDS,
  FILTER_LABELS,
  getPkiSyncCertificateCap,
  isFilterPresent,
  TFilterKind
} from "./pki-sync-filter-fns";

const FILTER_HINTS: Record<TFilterKind, string> = {
  certificateOrderIds: "An order is a certificate and its renewals",
  profileIds: "Issued from one of these profiles",
  metadata: "Carries this key and value"
};

type Props = {
  applicationId?: string;
  onOpenPicker: () => void;
};

export const PkiSyncCertificateAddMenu = ({ applicationId, onOpenPicker }: Props) => {
  const { watch, setValue } = useFormContext<TPkiSyncForm>();
  const { syncOption } = usePkiSyncOption(watch("destination") as PkiSync);
  const filters = (watch("filters") ?? {}) as TPkiSyncFilters;

  const certificateCap = getPkiSyncCertificateCap({
    destinationMaxCertificates: syncOption?.maxCertificates,
    syncOptions: watch("syncOptions") as Record<string, unknown> | undefined,
    destinationConfig: watch("destinationConfig") as Record<string, unknown> | undefined
  });

  const supportsFilters = Boolean(applicationId);

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

  if (!supportsFilters || addableFilterKinds.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <PlusIcon className="size-3.5" />
          Add Filter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {addableFilterKinds.map((kind) => (
          <DropdownMenuItem key={kind} onClick={() => addFilter(kind)}>
            <div className="flex flex-col">
              <span>{FILTER_LABELS[kind]}</span>
              <span className="text-xs text-muted">{FILTER_HINTS[kind]}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
