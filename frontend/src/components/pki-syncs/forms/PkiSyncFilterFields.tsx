import { Fragment, useCallback, useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { PlusIcon, TrashIcon, XIcon } from "lucide-react";

import {
  Badge,
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input
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
          const labelFor = (id: string) => orderNameById.get(id) ?? `Order ${id.slice(0, 8)}`;
          const removeId = (id: string) => {
            const remaining = ids.filter((candidate) => candidate !== id);
            if (remaining.length === 0) {
              removeFilter(kind);
              return;
            }

            setFilter(kind, remaining);
          };

          return (
            <div className="flex h-9 w-full min-w-0 items-center justify-between gap-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {first && (
                  <Badge
                    variant="outline"
                    isTruncatable
                    className="h-9 min-w-0 flex-1 pl-3 text-foreground"
                  >
                    <span className="truncate" title={first}>
                      {labelFor(first)}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {rest.length > 0 && (
                        <HoverCard openDelay={100}>
                          <HoverCardTrigger asChild>
                            <Badge
                              variant="neutral"
                              className="cursor-pointer font-sans hover:bg-neutral/35"
                            >
                              +{rest.length}
                            </Badge>
                          </HoverCardTrigger>
                          <HoverCardContent
                            align="end"
                            container={portalContainer ?? undefined}
                            className="flex max-h-64 w-64 flex-col gap-1.5 overflow-y-auto p-2.5"
                          >
                            {rest.map((id) => (
                              <div key={id} className="flex items-center justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate text-xs" title={id}>
                                  {labelFor(id)}
                                </span>
                                <IconButton
                                  type="button"
                                  size="xs"
                                  variant="ghost-muted"
                                  className="shrink-0"
                                  aria-label={`Remove ${labelFor(id)}`}
                                  onClick={() => removeId(id)}
                                >
                                  <XIcon />
                                </IconButton>
                              </div>
                            ))}
                          </HoverCardContent>
                        </HoverCard>
                      )}
                      <IconButton
                        type="button"
                        size="xs"
                        variant="ghost-muted"
                        aria-label={`Remove ${labelFor(first)}`}
                        onClick={() => removeId(first)}
                      >
                        <XIcon />
                      </IconButton>
                    </span>
                  </Badge>
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
              <div className="flex flex-col gap-3">
                {metadata.map((pair, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={index} className="flex items-center gap-3">
                    <Input
                      className="min-w-0 flex-1"
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
                      className="min-w-0 flex-1"
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
                      size="xs"
                      variant="ghost"
                      className="hover:text-danger"
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
                      <TrashIcon className="size-4" />
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
          <div ref={rootRef} className="mt-3 flex flex-col gap-3">
            {kinds.map((kind, index) => (
              <Fragment key={kind}>
                {index > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium text-muted">AND</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <Field className="min-w-0 flex-1">
                    <FieldLabel className="text-xs">{FILTER_LABELS[kind]}</FieldLabel>
                    <FieldContent>{renderBody(kind)}</FieldContent>
                  </Field>
                  {kind !== "metadata" && (
                    <IconButton
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="mt-6.5 hover:text-danger"
                      aria-label={`Remove ${FILTER_LABELS[kind]} filter`}
                      onClick={() => removeFilter(kind)}
                    >
                      <TrashIcon className="size-4" />
                    </IconButton>
                  )}
                </div>
              </Fragment>
            ))}
          </div>
        );
      }}
    />
  );
};
