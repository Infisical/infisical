import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PackageIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { AccessBundleFormDialog } from "@app/components/agent-vault/AccessBundleFormDialog";
import { ConnectionSheet } from "@app/components/agent-vault/ConnectionSheet";
import {
  Button,
  IconButton,
  PageHeader,
  PageLoader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import { useGetAgentVaultAccessBundle } from "@app/hooks/api/agentVault";
import { TAgentVaultConnection } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { DeleteAccessBundleDialog } from "@app/pages/agent-vault/AgentVaultAccessBundlesPage/components/DeleteAccessBundleDialog";

import { ConnectionsCard } from "./components/ConnectionsCard";
import { MembersCard } from "./components/MembersCard";

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
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isConnectionSheetOpen, setIsConnectionSheetOpen] = useState(false);
  const [connectionToEdit, setConnectionToEdit] = useState<TAgentVaultConnection | null>(null);

  if (isPending) return <PageLoader />;
  if (!accessBundle) return null;

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: accessBundle.name })}</title>
      </Helmet>

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={PackageIcon}
        title={accessBundle.name}
        description={accessBundle.description || "No description"}
      >
        {isAdmin && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="outline"
                  aria-label="Edit access bundle"
                  onClick={() => setIsEditOpen(true)}
                >
                  <PencilIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Edit name and description</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="outline"
                  aria-label="Delete access bundle"
                  onClick={() => setIsDeleteOpen(true)}
                >
                  <Trash2Icon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Delete access bundle</TooltipContent>
            </Tooltip>
          </>
        )}
        <Button
          variant="av"
          onClick={() =>
            navigate({
              to: "/organizations/$orgId/agent-vault/sessions",
              params: { orgId: currentOrg.id }
            })
          }
        >
          Create Session
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-4">
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

        {/* The API omits `members` entirely for anyone but an administrator. */}
        {accessBundle.members && (
          <MembersCard accessBundleId={accessBundle.id} members={accessBundle.members} />
        )}
      </div>

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
