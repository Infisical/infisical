import { useMemo, useState } from "react";
import { GlobeIcon, PlusIcon, SearchIcon } from "lucide-react";

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
import {
  POPULAR_PROXIED_SERVICE_TEMPLATES,
  PROXIED_SERVICE_TEMPLATES,
  ProxiedServiceTemplate,
  ProxiedServiceTemplateCategory
} from "@app/helpers/proxiedServiceTemplates";

type Props = {
  // null = "Custom / start from scratch"
  onSelect: (template: ProxiedServiceTemplate | null) => void;
};

const TemplateCard = ({
  template,
  onClick
}: {
  template: ProxiedServiceTemplate;
  onClick: () => void;
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-mineshaft-500 hover:bg-mineshaft-700/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-mineshaft-700">
          {imgError ? (
            <GlobeIcon className="h-5 w-5 text-bunker-300" />
          ) : (
            <img
              src={`/images/integrations/${template.image}`}
              alt={`${template.name} logo`}
              className="h-6 w-6 object-contain"
              onError={() => setImgError(true)}
            />
          )}
        </div>
        <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
          {template.category}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{template.name}</p>
        <p className="text-xs leading-relaxed text-muted">{template.description}</p>
      </div>
    </button>
  );
};

const CustomCard = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex cursor-pointer flex-col gap-3 rounded-md border border-dashed border-mineshaft-500 bg-card p-4 text-left transition-colors hover:border-mineshaft-400 hover:bg-mineshaft-700/50"
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-mineshaft-700">
        <PlusIcon className="h-5 w-5 text-bunker-300" />
      </div>
    </div>
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-foreground">Custom</p>
      <p className="text-xs leading-relaxed text-muted">Set up any service manually.</p>
    </div>
  </button>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-3 text-[11px] font-medium tracking-wider text-muted uppercase">{children}</p>
);

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
);

export const ProxiedServiceTemplateSelect = ({ onSelect }: Props) => {
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;

  const filtered = useMemo(() => {
    if (!query) return PROXIED_SERVICE_TEMPLATES;
    return PROXIED_SERVICE_TEMPLATES.filter((t) =>
      [t.name, t.category, t.key, ...(t.aliases ?? [])].some((term) =>
        term.toLowerCase().includes(query)
      )
    );
  }, [query]);

  const popular = useMemo(
    () =>
      POPULAR_PROXIED_SERVICE_TEMPLATES.map((key) =>
        PROXIED_SERVICE_TEMPLATES.find((t) => t.key === key)
      ).filter((t): t is ProxiedServiceTemplate => Boolean(t)),
    []
  );

  const byCategory = useMemo(
    () =>
      Object.values(ProxiedServiceTemplateCategory).map((category) => ({
        category,
        templates: PROXIED_SERVICE_TEMPLATES.filter((t) => t.category === category)
      })),
    []
  );

  return (
    <div className="flex flex-col gap-6">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services — OpenAI, Stripe, Telegram, GitHub..."
        />
      </InputGroup>

      {isSearching ? (
        <section>
          {filtered.length ? (
            <Grid>
              <CustomCard onClick={() => onSelect(null)} />
              {filtered.map((template) => (
                <TemplateCard
                  key={template.key}
                  template={template}
                  onClick={() => onSelect(template)}
                />
              ))}
            </Grid>
          ) : (
            <Grid>
              <CustomCard onClick={() => onSelect(null)} />
            </Grid>
          )}
          {!filtered.length && (
            <Empty className="mt-3 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>No matching services</EmptyTitle>
                <EmptyDescription>
                  Try a different search term, or start from a custom service.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      ) : (
        <>
          <section>
            <SectionLabel>Popular</SectionLabel>
            <Grid>
              <CustomCard onClick={() => onSelect(null)} />
              {popular.map((template) => (
                <TemplateCard
                  key={template.key}
                  template={template}
                  onClick={() => onSelect(template)}
                />
              ))}
            </Grid>
          </section>
          {byCategory.map(
            ({ category, templates }) =>
              templates.length > 0 && (
                <section key={category}>
                  <SectionLabel>{category}</SectionLabel>
                  <Grid>
                    {templates.map((template) => (
                      <TemplateCard
                        key={template.key}
                        template={template}
                        onClick={() => onSelect(template)}
                      />
                    ))}
                  </Grid>
                </section>
              )
          )}
        </>
      )}
    </div>
  );
};
