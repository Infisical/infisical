import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useMatches } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { AnnouncementModal } from "@app/components/announcements/AnnouncementModal";
import { useAnnouncementSeen } from "@app/components/announcements/useAnnouncementSeen";
import { PageHeader } from "@app/components/v2";
import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useGetRecentAnnouncements } from "@app/hooks/api/announcement";

import { ProjectCategoryOverview } from "./components/ProjectCategoryOverview";

export const ProjectsPage = () => {
  const { t } = useTranslation();
  const matches = useMatches();
  const { currentOrg, isSubOrganization } = useOrganization();

  const projectsRouteId =
    "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects";
  const lastMatch = matches[matches.length - 1];
  const hasChildRoute = lastMatch && lastMatch.routeId !== projectsRouteId;

  const { data: announcementData } = useGetRecentAnnouncements();
  const announcements = announcementData?.announcements;
  const latestAnnouncement = announcements?.[0];
  const { hasUnseen, markSeen } = useAnnouncementSeen();
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false);

  const shouldAutoOpen = Boolean(latestAnnouncement && hasUnseen(latestAnnouncement.id));

  useEffect(() => {
    if (shouldAutoOpen) setIsAnnouncementOpen(true);
  }, [shouldAutoOpen]);

  const handleAnnouncementOpenChange = (open: boolean) => {
    setIsAnnouncementOpen(open);
    if (!open && latestAnnouncement) markSeen(latestAnnouncement.id);
  };

  if (hasChildRoute) {
    return <Outlet />;
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col justify-start bg-bunker-800 px-6">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageHeader
        scope={isSubOrganization ? "namespace" : "org"}
        title={`${isSubOrganization ? "Sub-Organization" : "Organization"} Overview`}
        description="Your team's complete security toolkit — organized and ready when you need them."
      />
      <Alert variant="info" className="mb-6">
        <InfoIcon />
        <AlertTitle>Secret Sharing Has Moved</AlertTitle>
        <AlertDescription>
          <p>
            Secret sharing now lives under Secrets Management. Go to{" "}
            <Link
              to="/organizations/$orgId/projects/secret-management/secret-sharing"
              params={{ orgId: currentOrg.id }}
              className="inline underline hover:opacity-80"
            >
              Secret Sharing
            </Link>
            .
          </p>
        </AlertDescription>
      </Alert>
      <ProjectCategoryOverview />
      {announcements && announcements.length > 0 && (
        <AnnouncementModal
          announcements={announcements}
          isOpen={isAnnouncementOpen}
          onOpenChange={handleAnnouncementOpenChange}
        />
      )}
    </div>
  );
};
