import { TilePicker } from "@infisical/cipher/patterns/tile-picker";
import { Stack } from "@infisical/cipher/ui/layout";
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

  if (isPending) return <Loader label="Loading services" />;

  return (
    <Stack gap={24}>
      <TilePicker
        items={(options ?? []).map(({ destination }) => {
          const { name, image, category } = PKI_SYNC_MAP[destination];
          return {
            value: destination,
            title: name,
            eyebrow: category,
            media: <ProviderIcon icon={image} alt="" size="md" />,
            keywords: [destination]
          };
        })}
        onSelect={(destination) => onSelect(destination as PkiSync)}
        searchLabel="Search certificate sync services"
        searchPlaceholder="Search services..."
        noun="services"
      />
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
