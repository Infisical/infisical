import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon, PackageIcon } from "lucide-react";

import { AccessBundleFormDialog } from "@app/components/agent-vault/AccessBundleFormDialog";
import { ConnectionSheet } from "@app/components/agent-vault/connection-sheet";
import { ManageAccessSheet } from "@app/components/agent-vault/ManageAccessSheet";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  PageLoader
} from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import { useGetAgentVaultAccessBundle } from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { DeleteAccessBundleDialog } from "@app/pages/agent-vault/AgentVaultAccessBundlesPage/components/DeleteAccessBundleDialog";

import { ConnectionsCard } from "./components/ConnectionsCard";

export const AgentVaultAccessBundleDetailPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const accessBundleId = useParams({
    strict: false,
    select: (params) => params.accessBundleId as string
  });

  const { data: accessBundle, isPending } = useGetAgentVaultAccessBundle(accessBundleId);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isManageAccessOpen, setIsManageAccessOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isConnectionSheetOpen, setIsConnectionSheetOpen] = useState(false);
  const [connectionToEdit, setConnectionToEdit] = useState<TAgentVaultConnection | null>(null);

  if (isPending) return <PageLoader />;
  // A 404 here is the backend's answer for both a deleted bundle and a member who has lost the
  // grant, so the copy covers both rather than guessing.
  if (!accessBundle) {
    return (
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Access bundle not found</EmptyTitle>
            <EmptyDescription>It was deleted or is no longer granted to you.</EmptyDescription>
          </EmptyHeader>
          <Button variant="av" asChild>
            <Link
              to="/organizations/$orgId/agent-vault/access-bundles"
              params={{ orgId: currentOrg.id }}
            >
              Back to Access Bundles
            </Link>
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: accessBundle.name })}</title>
      </Helmet>

      <Link
        to="/organizations/$orgId/agent-vault/access-bundles"
        params={{ orgId: currentOrg.id }}
        className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition hover:text-mineshaft-400/80"
      >
        <ChevronLeftIcon size={16} />
        Access Bundles
      </Link>

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={PackageIcon}
        title={accessBundle.name}
        description={accessBundle.description || "No description"}
      >
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Options
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsManageAccessOpen(true)}>
                Manage Access
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                Edit Access Bundle
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onClick={() => setIsDeleteOpen(true)}>
                Delete Access Bundle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <ConnectionsCard
        accessBundleId={accessBundle.id}
        connections={accessBundle.connections}
        canManage={isAdmin}
        onAdd={() => {
          setConnectionToEdit(null);
          setIsConnectionSheetOpen(true);
        }}
        onEdit={(connection) => {
          setConnectionToEdit(connection);
          setIsConnectionSheetOpen(true);
        }}
      />

      <ManageAccessSheet
        accessBundle={isManageAccessOpen ? accessBundle : null}
        onOpenChange={setIsManageAccessOpen}
      />

      <ConnectionSheet
        isOpen={isConnectionSheetOpen}
        onOpenChange={setIsConnectionSheetOpen}
        accessBundleId={accessBundle.id}
        connection={connectionToEdit}
      />

      <AccessBundleFormDialog
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        accessBundle={accessBundle}
      />

      <DeleteAccessBundleDialog
        accessBundle={isDeleteOpen ? accessBundle : null}
        onOpenChange={setIsDeleteOpen}
        onDeleted={() =>
          navigate({
            to: "/organizations/$orgId/agent-vault/access-bundles",
            params: { orgId: currentOrg.id }
          })
        }
      />
    </div>
  );
};
