import { Fragment, useMemo } from "react";
import { Controller } from "react-hook-form";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field, FieldError, FieldSeparator } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Popover, PopoverContent, PopoverTrigger } from "@infisical/cipher/ui/popover";

import {
  FILTER_LABELS,
  presentFilterKinds,
  type TFilterKind
} from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import type { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { useV4Adapter } from "../../../../data/adapters";
import { usePkiSyncForm } from "../fields";

type TFilterErrors = {
  metadata?: ({ key?: { message?: string }; value?: { message?: string } } | undefined)[];
};

const RemoveButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button type="button" variant="ghost" size="icon" icon="trash" iconOnly onClick={onClick}>
    {label}
  </Button>
);

export const PkiSyncFilterFields = ({
  applicationId,
  orderNameById,
  onOpenPicker
}: {
  applicationId?: string;
  orderNameById: Map<string, string>;
  onOpenPicker: () => void;
}) => {
  const { control } = usePkiSyncForm();
  const { data: profileData } = useV4Adapter("certificates").useCertificateProfiles({
    applicationId,
    limit: 100,
    offset: 0
  });
  const profileOptions = useMemo(
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

        const setFilter = (kind: TFilterKind, next: unknown) =>
          onChange({ ...filters, [kind]: next });

        const removeFilter = (kind: TFilterKind) => {
          const rest = { ...filters };
          delete rest[kind];
          onChange(Object.keys(rest).length ? rest : null);
        };

        const orderChips = () => {
          const ids = filters.certificateOrderIds ?? [];
          const [first, ...rest] = ids;
          const labelFor = (id: string) => orderNameById.get(id) ?? `Order ${id.slice(0, 8)}`;
          const removeId = (id: string) => {
            const remaining = ids.filter((candidate) => candidate !== id);
            if (remaining.length === 0) {
              removeFilter("certificateOrderIds");
              return;
            }
            setFilter("certificateOrderIds", remaining);
          };

          return (
            <Inline gap={8} align="center" wrap={false}>
              <InlineGrow>
                {first && (
                  <Inline gap={4} align="center" wrap={false}>
                    <InlineGrow>
                      <MiddleTruncate mono text={labelFor(first)} title={first} />
                    </InlineGrow>
                    {rest.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="ghost" size="sm">
                            {`+${rest.length} more`}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end">
                          <Stack gap={4}>
                            {rest.map((id) => (
                              <Inline key={id} gap={8} align="center" wrap={false}>
                                <InlineGrow>
                                  <MiddleTruncate mono text={labelFor(id)} title={id} />
                                </InlineGrow>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  icon="x"
                                  iconOnly
                                  onClick={() => removeId(id)}
                                >
                                  {`Remove ${labelFor(id)}`}
                                </Button>
                              </Inline>
                            ))}
                          </Stack>
                        </PopoverContent>
                      </Popover>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      icon="x"
                      iconOnly
                      onClick={() => removeId(first)}
                    >
                      {`Remove ${labelFor(first)}`}
                    </Button>
                  </Inline>
                )}
              </InlineGrow>
              <Button type="button" variant="outline" icon="plus" onClick={onOpenPicker}>
                Add
              </Button>
            </Inline>
          );
        };

        const body = (kind: TFilterKind) => {
          if (kind === "profileIds")
            return (
              <Combobox
                multiple
                label={FILTER_LABELS.profileIds}
                placeholder="Select profiles"
                options={profileOptions}
                value={filters.profileIds ?? []}
                onValueChange={(ids) => setFilter("profileIds", ids)}
              />
            );

          if (kind === "metadata")
            return (
              <Stack gap={8}>
                {metadata.map((pair, index) => (
                  // oxlint-disable-next-line react/no-array-index-key -- metadata pairs carry no id and rows are only appended or removed by position
                  <Inline key={index} gap={8} align="center" wrap={false}>
                    <InlineGrow>
                      <Input
                        aria-label={`Metadata key ${index + 1}`}
                        placeholder="Key"
                        value={pair.key}
                        invalid={Boolean(filterErrors?.metadata?.[index]?.key)}
                        onChange={(event) =>
                          setFilter(
                            "metadata",
                            metadata.map((entry, at) =>
                              at === index ? { ...entry, key: event.target.value } : entry
                            )
                          )
                        }
                      />
                    </InlineGrow>
                    <InlineGrow>
                      <Input
                        aria-label={`Metadata value ${index + 1}`}
                        placeholder="Any value"
                        value={pair.value ?? ""}
                        invalid={Boolean(filterErrors?.metadata?.[index]?.value)}
                        onChange={(event) =>
                          setFilter(
                            "metadata",
                            metadata.map((entry, at) =>
                              at === index
                                ? { ...entry, value: event.target.value || undefined }
                                : entry
                            )
                          )
                        }
                      />
                    </InlineGrow>
                    <RemoveButton
                      label="Remove metadata pair"
                      onClick={() => {
                        if (metadata.length === 1) {
                          removeFilter("metadata");
                          return;
                        }
                        setFilter(
                          "metadata",
                          metadata.filter((_, at) => at !== index)
                        );
                      }}
                    />
                  </Inline>
                ))}
                <FieldError
                  errors={metadata.flatMap((_, index) => [
                    filterErrors?.metadata?.[index]?.key,
                    filterErrors?.metadata?.[index]?.value
                  ])}
                />
              </Stack>
            );

          return orderChips();
        };

        return (
          <Stack gap={12}>
            {presentFilterKinds(filters).map((kind, index) => (
              <Fragment key={kind}>
                {index > 0 && <FieldSeparator>AND</FieldSeparator>}
                {kind === "metadata" ? (
                  <Field group label={FILTER_LABELS.metadata}>
                    {body(kind)}
                  </Field>
                ) : (
                  <Inline gap={8} align="end" wrap={false}>
                    <InlineGrow>
                      <Field group={kind === "certificateOrderIds"} label={FILTER_LABELS[kind]}>
                        {body(kind)}
                      </Field>
                    </InlineGrow>
                    <RemoveButton
                      label={`Remove ${FILTER_LABELS[kind]} filter`}
                      onClick={() => removeFilter(kind)}
                    />
                  </Inline>
                )}
              </Fragment>
            ))}
          </Stack>
        );
      }}
    />
  );
};
