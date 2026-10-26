import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  EllipsisIcon,
  PackageIcon,
  PencilIcon,
  TrashIcon,
  TriangleAlertIcon,
  UsersIcon
} from "lucide-react";

import { AccessBundleFormDialog } from "@app/components/agent-vault/AccessBundleFormDialog";
import { ManageAccessSheet } from "@app/components/agent-vault/ManageAccessSheet";
import { PersonalValuesDialog } from "@app/components/agent-vault/PersonalValuesDialog";
import { ServiceSheet } from "@app/components/agent-vault/service-sheet";
import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertAction,
  AlertDescription,
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
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const accessBundleId = useParams({
    strict: false,
    select: (params) => params.accessBundleId as string
  });

  const { data: accessBundle, isPending } = useGetAgentVaultAccessBundle(accessBundleId);
  const [serviceToSetUp, setServiceToSetUp] = useState<TAgentVaultService | null>(null);
  const needsSetup = (accessBundle?.services ?? []).filter(
    (service) => service.personalValues && !service.personalValues.isConfigured
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isManageAccessOpen, setIsManageAccessOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isServiceSheetOpen, setIsServiceSheetOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState<TAgentVaultService | null>(null);

  if (isPending)
    return (
      <>
        <PageTitle title="Access Bundle" />
        <PageLoader />
      </>
    );
  if (!accessBundle) {
    return (
      <>
        <PageTitle title="Access Bundle" />
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
      </>
    );
  }

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title={accessBundle.name || "Access Bundle"} />

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={PackageIcon}
        title={accessBundle.name}
        description={accessBundle.description || "No description"}
        backLink={
          <Link
            to="/organizations/$orgId/agent-vault/access-bundles"
            params={{ orgId: currentOrg.id }}
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
            Access Bundles
          </Link>
        }
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

      {needsSetup.length > 0 && (
        <Alert variant="warning" className="mb-6">
          <TriangleAlertIcon />
          <AlertDescription>
            <p>
              {needsSetup.length === 1
                ? `${needsSetup[0].name} requires your personal values.`
                : `${needsSetup.length} services require your personal values.`}{" "}
              Sessions from this bundle can&apos;t reach {needsSetup.length === 1 ? "it" : "them"}{" "}
              until you set {needsSetup.length === 1 ? "it" : "them"} up.
            </p>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={() => setServiceToSetUp(needsSetup[0])}>
                Set Up {needsSetup[0].name}
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}

      <ServicesCard
        accessBundleId={accessBundle.id}
        onSetUp={setServiceToSetUp}
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

      <PersonalValuesDialog
        target={
          serviceToSetUp ? { service: serviceToSetUp, accessBundleName: accessBundle.name } : null
        }
        onOpenChange={(isOpen) => {
          if (!isOpen) setServiceToSetUp(null);
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
