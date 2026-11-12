import { Badge, type BadgeTone } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { Media } from "@app/components/v4/ui/item";
import { Grid } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Meta, SmallText } from "@app/components/v4/ui/text";

import { DocSection, PageHeading } from "./doc-parts";
import { pagesIn, workbenchCategories, workbenchPage } from "./navigation";
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
  const section = workbenchCategories.find((item) => item.id === entry.section);
  if (!section) return [];
  const pages = pagesIn(section.id);
  return [{ ...entry, section, pages, page: workbenchPage(entry.page ?? pages[0].id) }];
});

export const OverviewPage = () => {
  return (
    <div>
      <PageHeading title="Infisical design system" />
      <p
        className="text-muted-foreground text-sm leading-6"
        style={{ maxWidth: "var(--v4-size-measure-prose)" }}
      >
        The tokens, components and patterns behind Infisical v4, with each product page rebuilt from
        them and compared with main.
      </p>
      <DocSection title="Compare with main">
        <Grid min="card">
          {comparisonQuicklinks.map((link) => {
            const page = workbenchPage(link.page);
            return (
              <Card key={link.page} size="sm">
                <div className="flex items-start gap-3">
                  <Media icon={link.icon} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <RowLink link={page.link} title={page.title}>
                        {page.title}
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
          {entryPoints.map(({ section, pages, page, summary }) => (
            <Card key={section.id} size="sm">
              <div className="flex items-start gap-3">
                <Media icon={section.icon} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <RowLink link={page.link}>{section.title}</RowLink>
                    <Meta>{pages.length} pages</Meta>
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
          {recentChanges.map((change) => {
            const link = change.page ? workbenchPage(change.page).link : undefined;
            return (
              <ListRow
                key={change.id}
                value={change.id}
                label={change.title}
                title={change.title}
                description={change.description}
                meta={<Meta>{change.date}</Meta>}
                link={link}
              />
            );
          })}
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
};
