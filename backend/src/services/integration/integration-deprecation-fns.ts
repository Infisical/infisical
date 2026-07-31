import { groupBy, unique } from "@app/lib/fn";

export type TIntegrationProjectRow = {
  projectId: string;
  projectName: string;
  integration: string;
};

export type TIntegrationProjectSummary = {
  projectId: string;
  projectName: string;
  integrations: string[];
};

export type TNoticeRecipient = {
  userId: string;
  email: string;
};

/**
 * Collapses the flat (project x integration) rows from the DAL into one entry per project, resolving each
 * integration slug to its display name. Slugs with no matching option fall back to the raw slug so a newly
 * added integration never renders as a blank line.
 */
export const groupIntegrationsByProject = (
  rows: TIntegrationProjectRow[],
  integrationNameBySlug: Map<string, string>
): TIntegrationProjectSummary[] =>
  Object.values(groupBy(rows, (row) => row.projectId)).map((projectRows) => ({
    projectId: projectRows[0].projectId,
    projectName: projectRows[0].projectName,
    integrations: unique(
      projectRows.map(({ integration }) => integrationNameBySlug.get(integration) ?? integration)
    ).sort()
  }));

/**
 * Deep link to a project's native integrations tab, relative to the site root. In-app notification links must stay
 * relative — the frontend router resolves them against the current location, so an absolute URL would be appended
 * to the path the user is already on.
 */
export const buildNativeIntegrationsPath = (orgId: string, projectId: string) =>
  `/organizations/${orgId}/projects/secret-management/${projectId}/integrations?selectedTab=native-integrations`;

/**
 * Absolute variant of {@link buildNativeIntegrationsPath} for emails — same URL the integration sync failure email
 * builds.
 */
export const buildNativeIntegrationsUrl = (siteUrl: string, orgId: string, projectId: string) =>
  `${siteUrl}${buildNativeIntegrationsPath(orgId, projectId)}`;

/**
 * Turns membership rows into mailable recipients: drops members with no email, anyone already reached by another
 * email in the same run (project admins who are also org admins), and duplicate memberships for the same user.
 */
export const toRecipients = (
  members: { userId: string; email?: string | null }[],
  excludedUserIds: Set<string> = new Set()
): TNoticeRecipient[] =>
  unique(
    members.filter((member) => member.email && !excludedUserIds.has(member.userId)),
    (member) => member.userId
  ).map(({ userId, email }) => ({ userId, email: email as string }));
