import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  EllipsisIcon,
  PackageIcon,
  PencilIcon,
  TrashIcon,
  UsersIcon
} from "lucide-react";

import { AccessBundleFormDialog } from "@app/components/agent-vault/AccessBundleFormDialog";
import { ManageAccessSheet } from "@app/components/agent-vault/ManageAccessSheet";
import { ServiceSheet } from "@app/components/agent-vault/service-sheet";
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
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { DeleteAccessBundleDialog } from "@app/pages/agent-vault/AgentVaultAccessBundlesPage/components/DeleteAccessBundleDialog";

import { ServicesCard } from "./components/ServicesCard";

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
  const [isServiceSheetOpen, setIsServiceSheetOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState<TAgentVaultService | null>(null);

  if (isPending) return <PageLoader />;
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
                <UsersIcon />
                Manage Access
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                <PencilIcon />
                Edit Access Bundle
              </DropdownMenuItem>
              <DropdownMenuItem variant="danger" onClick={() => setIsDeleteOpen(true)}>
                <TrashIcon />
                Delete Access Bundle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <ServicesCard
        accessBundleId={accessBundle.id}
        services={accessBundle.services}
        canManage={isAdmin}
        onAdd={() => {
          setServiceToEdit(null);
          setIsServiceSheetOpen(true);
        }}
        onEdit={(service) => {
          setServiceToEdit(service);
          setIsServiceSheetOpen(true);
        }}
      />

      <ManageAccessSheet
        accessBundle={isManageAccessOpen ? accessBundle : null}
        onOpenChange={setIsManageAccessOpen}
      />

      <ServiceSheet
        isOpen={isServiceSheetOpen}
        onOpenChange={setIsServiceSheetOpen}
        accessBundleId={accessBundle.id}
        service={serviceToEdit}
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
