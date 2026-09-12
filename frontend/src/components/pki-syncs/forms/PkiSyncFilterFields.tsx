import { useCallback, useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { PlusIcon, XIcon } from "lucide-react";

import {
  Badge,
  Button,
  FieldError,
  FilterableSelect,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { FILTER_LABELS, presentFilterKinds, TFilterKind } from "./pki-sync-filter-fns";

type TProfileOption = { label: string; value: string };

type TFilterErrors = {
  metadata?: ({ key?: { message?: string }; value?: { message?: string } } | undefined)[];
};

type Props = {
  applicationId?: string;
  orderNameById: Map<string, string>;
  onOpenPicker: () => void;
};

export const PkiSyncFilterFields = ({ applicationId, orderNameById, onOpenPicker }: Props) => {
  const { control } = useFormContext<TPkiSyncForm>();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const rootRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setPortalContainer(node.closest<HTMLElement>('[role="dialog"]'));
  }, []);

  const { data: profileData } = useListCertificateProfiles({
    applicationId,
    limit: 100,
    offset: 0
  });

  const profileOptions: TProfileOption[] = useMemo(
    () =>
      (profileData?.certificateProfiles ?? []).map((profile) => ({
        label: profile.slug,
        value: profile.id
      })),
    [profileData]
  );

  return (
    <Controller
      control={control}
      name="filters"
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const filters = (value ?? {}) as TPkiSyncFilters;
        const filterErrors = error as TFilterErrors | undefined;
        const metadata = filters.metadata ?? [];
        const kinds = presentFilterKinds(filters);

        const setFilter = (kind: TFilterKind, next: unknown) =>
          onChange({ ...filters, [kind]: next });

        const removeFilter = (kind: TFilterKind) => {
          const rest = { ...filters };
          delete rest[kind];
          onChange(Object.keys(rest).length ? rest : null);
        };

        const renderOrderChips = () => {
          const kind = "certificateOrderIds" as const;
          const ids = filters[kind] ?? [];
          const [first, ...rest] = ids;
          const labelFor = (id: string) => orderNameById.get(id) ?? id;

          return (
            <div className="flex h-9 w-full min-w-0 items-center justify-between gap-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {first && (
                  <Badge
                    variant="outline"
                    isTruncatable
                    className="h-9 min-w-0 flex-1 font-mono text-foreground"
                  >
                    <span className="truncate">{labelFor(first)}</span>
                    <IconButton
                      type="button"
                      size="xs"
                      variant="ghost-muted"
                      className="ml-auto"
                      aria-label={`Remove ${labelFor(first)}`}
                      onClick={() =>
                        setFilter(
                          kind,
                          ids.filter((candidate) => candidate !== first)
                        )
                      }
                    >
                      <XIcon />
                    </IconButton>
                  </Badge>
                )}
                {rest.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Badge asChild variant="outline" className="h-9 shrink-0 text-foreground">
                        <button type="button">+{rest.length}</button>
                      </Badge>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      container={portalContainer ?? undefined}
                      className="flex max-h-64 w-64 flex-col gap-1.5 overflow-y-auto p-2.5"
                    >
                      {rest.map((id) => (
                        <div key={id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">
                            {labelFor(id)}
                          </span>
                          <IconButton
                            type="button"
                            size="xs"
                            variant="ghost-muted"
                            className="shrink-0"
                            aria-label={`Remove ${labelFor(id)}`}
                            onClick={() =>
                              setFilter(
                                kind,
                                ids.filter((candidate) => candidate !== id)
                              )
                            }
                          >
                            <XIcon />
                          </IconButton>
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 shrink-0"
                onClick={() => onOpenPicker()}
              >
                <PlusIcon className="size-3" />
                Add
              </Button>
            </div>
          );
        };

        const renderBody = (kind: TFilterKind) => {
          if (kind === "profileIds") {
            return (
              <FilterableSelect
                isMulti
                placeholder="Select profiles"
                options={profileOptions}
                value={profileOptions.filter((option) =>
                  (filters.profileIds ?? []).includes(option.value)
                )}
                onChange={(options) =>
                  setFilter(
                    "profileIds",
                    ((options as TProfileOption[]) ?? []).map((option) => option.value)
                  )
                }
              />
            );
          }

          if (kind === "metadata") {
            return (
              <div className="flex flex-col gap-2">
                {metadata.map((pair, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      className="min-w-0 flex-1 font-mono"
                      placeholder="Key"
                      value={pair.key}
                      onChange={(e) =>
                        setFilter(
                          "metadata",
                          metadata.map((entry, i) =>
                            i === index ? { ...entry, key: e.target.value } : entry
                          )
                        )
                      }
                    />
                    <Input
                      className="min-w-0 flex-1 font-mono"
                      placeholder="Any value"
                      value={pair.value ?? ""}
                      onChange={(e) =>
                        setFilter(
                          "metadata",
                          metadata.map((entry, i) =>
                            i === index ? { ...entry, value: e.target.value || undefined } : entry
                          )
                        )
                      }
                    />
                    <IconButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-2"
                      aria-label="Remove metadata pair"
                      onClick={() => {
                        if (metadata.length === 1) {
                          removeFilter("metadata");
                          return;
                        }
                        setFilter(
                          "metadata",
                          metadata.filter((_, i) => i !== index)
                        );
                      }}
                    >
                      <XIcon />
                    </IconButton>
                  </div>
                ))}
                <FieldError
                  errors={metadata.flatMap((_, index) => [
                    filterErrors?.metadata?.[index]?.key,
                    filterErrors?.metadata?.[index]?.value
                  ])}
                />
              </div>
            );
          }

          return renderOrderChips();
        };

        return (
          <div ref={rootRef} className="mt-3 divide-y divide-border">
            {kinds.map((kind) => (
              <div key={kind} className="flex items-start gap-4 py-4">
                <div className="w-40 shrink-0 pt-1.5">
                  <p className="text-sm text-foreground">{FILTER_LABELS[kind]}</p>
                </div>
                <div className="min-w-0 flex-1">{renderBody(kind)}</div>
                {kind !== "metadata" && (
                  <IconButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${FILTER_LABELS[kind]} filter`}
                    onClick={() => removeFilter(kind)}
                  >
                    <XIcon />
                  </IconButton>
                )}
              </div>
            ))}
          </div>
        );
      }}
    />
  );
};
