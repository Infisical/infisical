import { useState } from "react";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Tile } from "@infisical/cipher/ui/item";
import { Grid, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { SmallText } from "@infisical/cipher/ui/text";

import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import type { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { ProviderIcon } from "../../../components/provider-icon";
import { useV4Adapter } from "../../../data/adapters";

export const PkiSyncDestinationPicker = ({
  onSelect
}: {
  onSelect: (destination: PkiSync) => void;
}) => {
  const { data: options, isPending } = useV4Adapter("pkiSyncs").useSyncOptions();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filtered = (options ?? []).filter(({ destination }) => {
    const { name, category } = PKI_SYNC_MAP[destination];
    return [name, category, destination].some((value) => value.toLowerCase().includes(query));
  });

  if (isPending) return <Loader label="Loading services" />;

  return (
    <Stack gap={24}>
      <Input
        icon="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search services..."
        aria-label="Search certificate sync services"
      />
      {filtered.length ? (
        <Grid columns={2} gap={12}>
          {filtered.map(({ destination }) => {
            const { name, image, category, description } = PKI_SYNC_MAP[destination];
            return (
              <Tile
                key={destination}
                media={<ProviderIcon icon={image} alt="" size="md" />}
                title={name}
                description={description}
                onClick={() => onSelect(destination)}
              >
                <SmallText muted>{category}</SmallText>
              </Tile>
            );
          })}
        </Grid>
      ) : (
        <EmptyState size="sm" icon="search" title="No matching services" />
      )}
      <SmallText muted>
        Don&apos;t see the service you need?{" "}
        <a href="https://community.infisical.com" target="_blank" rel="noopener noreferrer">
          Let us know in the community forum
        </a>{" "}
        or{" "}
        <a
          href="https://github.com/Infisical/infisical/discussions"
          target="_blank"
          rel="noopener noreferrer"
        >
          request it on GitHub
        </a>
        .
      </SmallText>
    </Stack>
  );
};
