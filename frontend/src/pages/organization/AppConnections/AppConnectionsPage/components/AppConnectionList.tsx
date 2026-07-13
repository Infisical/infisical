import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Loader2Icon, Search } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
import { APP_CONNECTION_MAP, POPULAR_APP_CONNECTIONS } from "@app/helpers/appConnections";
import { usePopUp } from "@app/hooks";
import { useAppConnectionOptions } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TAppConnectionOption } from "@app/hooks/api/appConnections/types/app-options";
import { ProjectType } from "@app/hooks/api/projects/types";

type Props = {
  onSelect: (app: AppConnection) => void;
  projectType?: ProjectType;
};

const ProviderCard = ({ app, onClick }: { app: AppConnection; onClick: () => void }) => {
  const { name, image, category, description, icon } = APP_CONNECTION_MAP[app];

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-mineshaft-500 hover:bg-mineshaft-700/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-mineshaft-700">
          <img
            src={`/images/integrations/${image}`}
            alt={`${name} logo`}
            className="h-6 w-6 object-contain"
          />
          {icon && (
            <FontAwesomeIcon
              icon={icon}
              className="absolute -right-1 -bottom-1 text-primary-700"
              size="sm"
            />
          )}
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

export const AppConnectionsSelect = ({ onSelect, projectType }: Props) => {
  const { subscription } = useSubscription();
  const { isPending, data: appConnectionOptions } = useAppConnectionOptions(projectType);
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);
  const [search, setSearch] = useState("");

  const visibleOptions = useMemo(
    () => (appConnectionOptions ?? []).filter((option) => option.app !== AppConnection.AzureADCS),
    [appConnectionOptions]
  );

  const handleSelect = (app: AppConnection) => {
    if (APP_CONNECTION_MAP[app].enterprise && !subscription.enterpriseAppConnections) {
      handlePopUpOpen("upgradePlan", { isEnterpriseFeature: true });
      return;
    }
    onSelect(app);
  };

  const optionsByApp = useMemo(() => {
    const map = new Map<AppConnection, TAppConnectionOption>();
    visibleOptions.forEach((option) => map.set(option.app, option));
    return map;
  }, [visibleOptions]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return visibleOptions;

    return (
      visibleOptions.filter(({ app, name }) => {
        const entry = APP_CONNECTION_MAP[app];
        const aliases = entry?.aliases ?? [];
        return (
          name?.toLowerCase().includes(query) ||
          entry?.name.toLowerCase().includes(query) ||
          entry?.category.toLowerCase().includes(query) ||
          app.toLowerCase().includes(query) ||
          aliases.some((alias) => alias.toLowerCase().includes(query))
        );
      }) ?? []
    );
  }, [visibleOptions, search]);

  const popularOptions = useMemo(
    () =>
      POPULAR_APP_CONNECTIONS.map((app) => optionsByApp.get(app)).filter(
        (option): option is TAppConnectionOption => Boolean(option)
      ),
    [optionsByApp]
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
          placeholder="Search apps (e.g. AWS, GitHub, Postgres, Vault)"
        />
      </InputGroup>

      {isSearching ? (
        <section>
          {filteredOptions.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredOptions.map((option) => (
                <ProviderCard
                  key={option.app}
                  app={option.app}
                  onClick={() => handleSelect(option.app)}
                />
              ))}
            </div>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>No matching apps</EmptyTitle>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {popularOptions.map((option) => (
                  <ProviderCard
                    key={option.app}
                    app={option.app}
                    onClick={() => handleSelect(option.app)}
                  />
                ))}
              </div>
            </section>
          )}
          <section>
            <SectionLabel>All apps</SectionLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleOptions.map((option) => (
                <ProviderCard
                  key={option.app}
                  app={option.app}
                  onClick={() => handleSelect(option.app)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <p className="text-xs text-muted">
        Don&apos;t see the app you&apos;re looking for?{" "}
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
        text="All App Connections can be unlocked if you switch to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </div>
  );
};
