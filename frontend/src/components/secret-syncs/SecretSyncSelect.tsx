import { useMemo, useState } from "react";
import { Loader2Icon, Search } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import { POPULAR_SECRET_SYNCS, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { usePopUp } from "@app/hooks";
import { SecretSync, useSecretSyncOptions } from "@app/hooks/api/secretSyncs";

import { UpgradePlanModal } from "../license/UpgradePlanModal";

type Props = {
  onSelect: (destination: SecretSync) => void;
};

type SyncOption = {
  destination: SecretSync;
  enterprise?: boolean;
};

const ProviderCard = ({
  destination,
  onClick
}: {
  destination: SecretSync;
  onClick: () => void;
}) => {
  const { name, image, category, description } = SECRET_SYNC_MAP[destination];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-mineshaft-500 hover:bg-mineshaft-700/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-mineshaft-700">
          <img
            src={`/images/integrations/${image}`}
            alt={`${name} logo`}
            className="h-6 w-6 object-contain"
          />
        </div>
        <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
          {category}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{name}</p>
        <p className="text-xs leading-relaxed text-muted">{description}</p>
      </div>
    </button>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-3 text-[11px] font-medium tracking-wider text-muted uppercase">{children}</p>
);

export const SecretSyncSelect = ({ onSelect }: Props) => {
  const { subscription } = useSubscription();
  const { isPending, data: secretSyncOptions } = useSecretSyncOptions();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);
  const [search, setSearch] = useState("");

  const handleSelect = (option: SyncOption) => {
    if (option.enterprise && !subscription.enterpriseSecretSyncs) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true,
        text: "All Secret Syncs can be unlocked if you switch to Infisical Enterprise plan."
      });
      return;
    }
    onSelect(option.destination);
  };

  const optionsByDestination = useMemo(() => {
    const map = new Map<SecretSync, SyncOption>();
    secretSyncOptions?.forEach((option) => map.set(option.destination, option));
    return map;
  }, [secretSyncOptions]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return secretSyncOptions ?? [];

    return (
      secretSyncOptions?.filter(({ destination }) => {
        const entry = SECRET_SYNC_MAP[destination];
        if (!entry) return false;
        const aliases = entry.aliases ?? [];
        return (
          entry.name.toLowerCase().includes(query) ||
          entry.category.toLowerCase().includes(query) ||
          destination.toLowerCase().includes(query) ||
          aliases.some((alias) => alias.toLowerCase().includes(query))
        );
      }) ?? []
    );
  }, [secretSyncOptions, search]);

  const popularOptions = useMemo(
    () =>
      POPULAR_SECRET_SYNCS.map((destination) => optionsByDestination.get(destination)).filter(
        (option): option is SyncOption => Boolean(option)
      ),
    [optionsByDestination]
  );

  const isSearching = search.trim().length > 0;

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-10">
        <Loader2Icon className="size-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-muted">Loading options...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search providers — AWS, Vercel, GitHub Actions, Vault..."
        />
      </InputGroup>

      {isSearching ? (
        <section>
          {filteredOptions.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredOptions.map((option) => (
                <ProviderCard
                  key={option.destination}
                  destination={option.destination}
                  onClick={() => handleSelect(option)}
                />
              ))}
            </div>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>No matching providers</EmptyTitle>
                <EmptyDescription>Try a different search term.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      ) : (
        <>
          {popularOptions.length > 0 && (
            <section>
              <SectionLabel>Popular</SectionLabel>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {popularOptions.map((option) => (
                  <ProviderCard
                    key={option.destination}
                    destination={option.destination}
                    onClick={() => handleSelect(option)}
                  />
                ))}
              </div>
            </section>
          )}
          <section>
            <SectionLabel>All providers</SectionLabel>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(secretSyncOptions ?? []).map((option) => (
                <ProviderCard
                  key={option.destination}
                  destination={option.destination}
                  onClick={() => handleSelect(option)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan.data?.text}
      />
    </div>
  );
};
