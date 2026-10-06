import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2Icon, Search } from "lucide-react";

import {
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { useOrganization, useProject, useSubscription } from "@app/context";
import { POPULAR_SECRET_SYNCS, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { usePopUp } from "@app/hooks";
import { SecretSync, useSecretSyncOptions } from "@app/hooks/api/secretSyncs";
import { useSecretSyncDiscovery } from "@app/hooks/useSecretSyncDiscovery";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { UpgradePlanModal } from "../license/UpgradePlanModal";

type Props = {
  onSelect: (destination: SecretSync) => void;
};

type SyncOption = {
  destination: SecretSync;
  enterprise?: boolean;
};

const RECENTLY_ADDED_LIMIT = 3;

const ProviderCard = ({
  destination,
  isNew,
  onClick
}: {
  destination: SecretSync;
  isNew?: boolean;
  onClick: () => void;
}) => {
  const { name, image, category, description } = SECRET_SYNC_MAP[destination];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-hover/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-hover">
          <ProviderIcon icon={image} alt={`${name} logo`} className="h-6 w-6 object-contain" />
        </div>
        <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
          {category}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          {isNew && <Badge variant="info">New</Badge>}
        </div>
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
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { newSecretSyncReleases, markSecretSyncsSeen } = useSecretSyncDiscovery();
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
    const release = newSecretSyncReleases.find((r) => r.destination === option.destination);
    if (release) {
      analytics.captureForOrganization(
        AnalyticsEvent.SecretSyncRecentlyAddedSelected,
        currentOrg.id,
        {
          projectId: currentProject.id,
          releaseId: release.releaseId
        }
      );
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

  const newDestinations = useMemo(
    () => new Set(newSecretSyncReleases.map(({ destination }) => destination)),
    [newSecretSyncReleases]
  );

  const recentlyAddedReleases = useMemo(
    () =>
      newSecretSyncReleases
        .filter(({ destination }) => optionsByDestination.has(destination))
        .slice(0, RECENTLY_ADDED_LIMIT),
    [newSecretSyncReleases, optionsByDestination]
  );

  const isSearching = search.trim().length > 0;

  const hasRecordedView = useRef(false);
  useEffect(() => {
    if (isPending || isSearching || !recentlyAddedReleases.length || hasRecordedView.current)
      return;
    hasRecordedView.current = true;
    markSecretSyncsSeen();
    analytics.captureForOrganization(AnalyticsEvent.SecretSyncRecentlyAddedViewed, currentOrg.id, {
      projectId: currentProject.id,
      releaseIds: recentlyAddedReleases.map(({ releaseId }) => releaseId)
    });
  }, [isPending, isSearching, recentlyAddedReleases]);

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
                  isNew={newDestinations.has(option.destination)}
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
          {recentlyAddedReleases.length > 0 && (
            <section>
              <SectionLabel>Recently Added</SectionLabel>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {recentlyAddedReleases.map(({ destination }) => (
                  <ProviderCard
                    key={destination}
                    destination={destination}
                    isNew
                    onClick={() => handleSelect(optionsByDestination.get(destination)!)}
                  />
                ))}
              </div>
            </section>
          )}
          {popularOptions.length > 0 && (
            <section>
              <SectionLabel>Popular</SectionLabel>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {popularOptions.map((option) => (
                  <ProviderCard
                    key={option.destination}
                    destination={option.destination}
                    isNew={newDestinations.has(option.destination)}
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
                  isNew={newDestinations.has(option.destination)}
                  onClick={() => handleSelect(option)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <UpgradePlanModal
        paywallKey="secret-manager.secret-sync-provider"
        isOpen={popUp.upgradePlan.isOpen}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan.data?.text}
      />
    </div>
  );
};
