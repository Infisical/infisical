import { Badge, type BadgeTone } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { Media } from "@app/components/v4/ui/item";
import { Grid } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Meta, SmallText } from "@app/components/v4/ui/text";

import { DocSection, PageHeading } from "./doc-parts";
import { comparisonPages, workbenchSections } from "./navigation";
import { comparisonQuicklinks, type PortStatus, recentChanges } from "./overview-data";

const previewBuild = "https://pr-8753.preview.infisical.com/design-system";
const pullRequest = "https://github.com/Infisical/infisical/pull/8753";

const statusTone: Record<PortStatus, BadgeTone> = {
  "1:1 port": "soft",
  Redesign: "info"
};

const entryPoints = [
  {
    section: "foundations",
    page: "colors",
    summary: "Color, typography, spacing and shape, motion, and the rules every page follows."
  },
  {
    section: "components",
    summary: "Controls, data display, overlays and composites, each with examples and its contract."
  },
  {
    section: "patterns",
    summary: "Composed flows such as ApprovalQueue, AccessList and FilterBar."
  }
].flatMap((entry) => {
  const section = workbenchSections.find((item) => item.id === entry.section);
  if (!section) return [];
  return [{ ...entry, section, page: entry.page ?? section.pages[0].id }];
});

export const OverviewPage = () => (
  <div>
    <PageHeading title="Infisical design system" />
    <p
      className="text-muted-foreground text-sm leading-6"
      style={{ maxWidth: "var(--v4-size-measure-prose)" }}
    >
      The v4 tokens, components and patterns behind Infisical 2.0, each with working examples and
      its contract. Every product page below is rebuilt from them and compared with the current app
      on main.
    </p>
    <DocSection title="Compare with main">
      <Grid min="card">
        {comparisonQuicklinks.map((link) => {
          const title = comparisonPages.find((page) => page.id === link.page)?.title ?? link.page;
          return (
            <Card key={link.page} size="sm">
              <div className="flex items-start gap-3">
                <Media icon={link.icon} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <RowLink to="/design-system" hash={link.page} title={title}>
                      {title}
                    </RowLink>
                    <Badge tone={statusTone[link.status]}>{link.status}</Badge>
                  </div>
                  <SmallText muted>{link.summary}</SmallText>
                </div>
              </div>
            </Card>
          );
        })}
      </Grid>
    </DocSection>
    <DocSection title="Browse the system">
      <Grid min="card">
        {entryPoints.map(({ section, page, summary }) => (
          <Card key={section.id} size="sm">
            <div className="flex items-start gap-3">
              <Media icon={section.icon} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <RowLink to="/design-system" hash={page}>
                    {section.title}
                  </RowLink>
                  <Meta>{section.pages.length} pages</Meta>
                </div>
                <SmallText muted>{summary}</SmallText>
              </div>
            </div>
          </Card>
        ))}
      </Grid>
    </DocSection>
    <DocSection title="What's new">
      <List label="Recent system changes">
        {recentChanges.map((change) => (
          <ListRow
            key={change.id}
            value={change.id}
            label={change.title}
            title={change.title}
            description={change.description}
            meta={<Meta>{change.date}</Meta>}
            href={change.page ? `#${change.page}` : undefined}
          />
        ))}
      </List>
    </DocSection>
    <DocSection title="Preview and review">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" icon="globe" iconRight="external">
          <a href={previewBuild} target="_blank" rel="noreferrer">
            Preview build
          </a>
        </Button>
        <Button asChild variant="outline" icon="git" iconRight="external">
          <a href={pullRequest} target="_blank" rel="noreferrer">
            Pull request on GitHub
          </a>
        </Button>
      </div>
    </DocSection>
  </div>
);
