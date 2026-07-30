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
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { usePopUp } from "@app/hooks";
import { PkiSync, usePkiSyncOptions } from "@app/hooks/api/pkiSyncs";

import { UpgradePlanModal } from "../license/UpgradePlanModal";

type Props = {
  onSelect: (destination: PkiSync) => void;
};

const SyncCard = ({ destination, onClick }: { destination: PkiSync; onClick: () => void }) => {
  const { name, image, category, description } = PKI_SYNC_MAP[destination];

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

export const PkiSyncSelect = ({ onSelect }: Props) => {
  const { subscription } = useSubscription();
  const { isPending, data: pkiSyncOptions } = usePkiSyncOptions();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);
  const [search, setSearch] = useState("");

  const handleSelect = (destination: PkiSync, enterprise?: boolean) => {
    if (enterprise && !subscription.enterpriseCertificateSyncs) {
      handlePopUpOpen("upgradePlan", {
        isEnterpriseFeature: true,
        text: "All Certificate Syncs can be unlocked if you switch to Infisical Enterprise plan."
      });
      return;
    }
    onSelect(destination);
  };

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const options = pkiSyncOptions ?? [];
    if (!query) return options;
    return options.filter(({ destination }) => {
      const { name, category } = PKI_SYNC_MAP[destination];
      return (
        name.toLowerCase().includes(query) ||
        category.toLowerCase().includes(query) ||
        destination.toLowerCase().includes(query)
      );
    });
  }, [pkiSyncOptions, search]);

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
          placeholder="Search options..."
        />
      </InputGroup>

      {filteredOptions.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredOptions.map(({ destination, enterprise }) => (
            <SyncCard
              key={destination}
              destination={destination}
              onClick={() => handleSelect(destination, enterprise)}
            />
          ))}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No matching services</EmptyTitle>
            <EmptyDescription>Try a different search term.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <p className="text-xs text-muted">
        Don&apos;t see the third-party service you&apos;re looking for?{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://infisical.com/slack"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Let us know on Slack
        </a>{" "}
        or{" "}
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://github.com/Infisical/infisical/discussions"
          className="underline underline-offset-2 hover:text-foreground"
        >
          request it on GitHub
        </a>
        .
      </p>

      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        text={popUp.upgradePlan.data?.text}
      />
    </div>
  );
};
