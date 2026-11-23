import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  EllipsisIcon,
  IdCardIcon,
  PackageIcon,
  PencilIcon,
  TrashIcon,
  TriangleAlertIcon,
  UsersIcon
} from "lucide-react";

import { AccessBundleFormDialog } from "@app/components/agent-vault/AccessBundleFormDialog";
import { DisabledReasonMenuItem } from "@app/components/agent-vault/DisabledReasonMenuItem";
import { deniedReason } from "@app/components/agent-vault/DisabledReasonTooltip";
import { PersonalValuesDialog } from "@app/components/agent-vault/PersonalValuesDialog";
import { ServiceSheet } from "@app/components/agent-vault/service-sheet";
import { ServicesCard } from "@app/components/agent-vault/ServicesCard";
import { WhoCanUseDialog } from "@app/components/agent-vault/WhoCanUseDialog";
import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertAction,
  AlertDescription,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  PageLoader
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultServiceActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub,
  useOrganization,
  useProjectPermission,
  useProject
} from "@app/context";
import {
  canOnAgentVaultAccessBundle,
  canOnAgentVaultService,
  canUseAgentVaultAccessBundle,
  canUseNewAgentVaultService
} from "@app/helpers/agentVaultPermissions";
import {
  AgentVaultSessionScope,
  useGetAgentVaultAccessBundle,
  useListAgentVaultSessions
} from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { DeleteAccessBundleDialog } from "@app/pages/agent-vault/AgentVaultAccessBundlesPage/components/DeleteAccessBundleDialog";

import { AddBundleServiceDialog } from "./components/AddBundleServiceDialog";
import { SkillsCard } from "./components/SkillsCard";

export const AgentVaultAccessBundleDetailPage = () => {
  const { projectId } = useProject();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const accessBundleId = useParams({
    strict: false,
    select: (params) => params.accessBundleId as string
  });

  const canEditBundle = canOnAgentVaultAccessBundle(
    permission,
    ProjectPermissionAgentVaultAccessBundleActions.Edit,
    accessBundleId
  );
  const canDeleteBundle = canOnAgentVaultAccessBundle(
    permission,
    ProjectPermissionAgentVaultAccessBundleActions.Delete,
    accessBundleId
  );
  // A service created here goes straight into this bundle, so it takes a bundle edit as well, and using a new service.
  const canCreateServices =
    canEditBundle &&
    permission.can(
      ProjectPermissionAgentVaultServiceActions.Create,
      ProjectPermissionSub.AgentVaultServices
    ) &&
    canUseNewAgentVaultService(permission);
  const canReadRoles = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  const canReadAnySession = permission.can(
    ProjectPermissionAgentVaultSessionActions.ReadAny,
    ProjectPermissionSub.AgentVaultSessions
  );

  const { data: accessBundle, isPending } = useGetAgentVaultAccessBundle(projectId, accessBundleId);
  const [serviceToSetUp, setServiceToSetUp] = useState<TAgentVaultService | null>(null);
  const needsSetup = (accessBundle?.services ?? []).filter(
    (service) => service.personalValues && !service.personalValues.isConfigured
  );
  // Listing every session takes Read Any on sessions, and so does the note that reads this.
  const { data: sessions } = useListAgentVaultSessions(
    projectId,
    { scope: AgentVaultSessionScope.All, limit: 1 },
    {
      enabled: canReadAnySession,
      refetchInterval: (query) => ((query.state.data?.totalCount ?? 0) > 0 ? false : 30_000)
    }
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isWhoCanUseOpen, setIsWhoCanUseOpen] = useState(false);
  const [isServiceSheetOpen, setIsServiceSheetOpen] = useState(false);
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState<TAgentVaultService | null>(null);
  useAgentVaultCreateIntent(
    () => {
      setServiceToEdit(null);
      setIsServiceSheetOpen(true);
    },
    canCreateServices && Boolean(accessBundle)
  );

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
              <EmptyDescription>It was deleted, or you can&apos;t see it.</EmptyDescription>
            </EmptyHeader>
            <Button variant="av" asChild>
              <Link
                to="/organizations/$orgId/projects/agent-vault/$projectId/access-bundles"
                params={{ orgId: currentOrg.id, projectId }}
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
            to="/organizations/$orgId/projects/agent-vault/$projectId/access-bundles"
            params={{ orgId: currentOrg.id, projectId }}
          >
            <ChevronLeftIcon aria-hidden className="size-4" />
            Access Bundles
          </Link>
        }
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Options
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DisabledReasonMenuItem
              disabledReason={deniedReason(
                canEditBundle,
                "You don't have permission to edit this access bundle"
              )}
              onClick={() => setIsEditOpen(true)}
            >
              <PencilIcon />
              Edit Access Bundle
            </DisabledReasonMenuItem>
            <DisabledReasonMenuItem
              disabledReason={deniedReason(canReadRoles, "You don't have permission to view roles")}
              onClick={() => setIsWhoCanUseOpen(true)}
            >
              <UsersIcon />
              Who Can Use
            </DisabledReasonMenuItem>
            <DisabledReasonMenuItem
              variant="danger"
              disabledReason={deniedReason(
                canDeleteBundle,
                "You don't have permission to delete this access bundle"
              )}
              onClick={() => setIsDeleteOpen(true)}
            >
              <TrashIcon />
              Delete Access Bundle
            </DisabledReasonMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

      {canReadAnySession && accessBundle.services.length > 0 && sessions?.totalCount === 0 && (
        <Alert variant="info" className="mb-6">
          <IdCardIcon />
          <AlertDescription>
            <p>This bundle is ready. Create a session with it to give an agent access.</p>
            <AlertAction>
              <Button variant="outline" size="sm" asChild>
                <Link
                  to="/organizations/$orgId/projects/agent-vault/$projectId/sessions"
                  params={{ orgId: currentOrg.id, projectId }}
                >
                  Go to Sessions
                </Link>
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-6">
        <ServicesCard
          accessBundleId={accessBundle.id}
          onSetUp={setServiceToSetUp}
          services={accessBundle.services}
          canAdd={canEditBundle}
          canEditService={(service) =>
            canOnAgentVaultService(
              permission,
              ProjectPermissionAgentVaultServiceActions.Edit,
              service.id
            )
          }
          canRemoveService={() => canEditBundle}
          canOpenService={(service) =>
            canUseAgentVaultAccessBundle(permission, accessBundle.id) ||
            [
              ProjectPermissionAgentVaultServiceActions.Read,
              ProjectPermissionAgentVaultServiceActions.Use
            ].some((action) => canOnAgentVaultService(permission, action, service.id))
          }
          onAdd={() => setIsAddServiceOpen(true)}
          onEdit={(service) => {
            setServiceToEdit(service);
            setIsServiceSheetOpen(true);
          }}
        />
        {/* Whoever can see the bundle sees what it holds, skills included. */}
        <SkillsCard
          accessBundleId={accessBundle.id}
          accessBundleName={accessBundle.name}
          canManage={canEditBundle}
        />
      </div>

      <PersonalValuesDialog
        target={serviceToSetUp ? { service: serviceToSetUp } : null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setServiceToSetUp(null);
        }}
      />

      <AddBundleServiceDialog
        accessBundleId={accessBundle.id}
        bundleServiceIds={accessBundle.services.map((service) => service.id)}
        isOpen={isAddServiceOpen}
        onOpenChange={setIsAddServiceOpen}
        onCreateNew={
          canCreateServices
            ? () => {
                setServiceToEdit(null);
                setIsServiceSheetOpen(true);
              }
            : undefined
        }
      />

      <ServiceSheet
        isOpen={isServiceSheetOpen}
        onOpenChange={setIsServiceSheetOpen}
        accessBundleId={accessBundle.id}
        service={serviceToEdit}
      />

      <WhoCanUseDialog
        isOpen={isWhoCanUseOpen}
        onOpenChange={setIsWhoCanUseOpen}
        target={{ kind: "accessBundle", id: accessBundle.id, name: accessBundle.name }}
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
            to: "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles",
            params: { orgId: currentOrg.id, projectId }
          })
        }
      />
    </div>
  );
};
