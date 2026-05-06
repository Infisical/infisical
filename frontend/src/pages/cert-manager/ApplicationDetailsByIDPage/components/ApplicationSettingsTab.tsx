import { useMemo, useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { formatDistance } from "date-fns";
import {
  CircleStopIcon,
  EyeIcon,
  FilePlusIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  FilterableSelect,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  approvalPolicyQuery,
  ApprovalPolicyType,
  CertRequestPolicyConditions,
  TApprovalPolicy,
  useDeleteApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  PkiAlertEventTypeV2,
  TPkiAlertV2,
  useDeletePkiAlertV2,
  useGetPkiAlertsV2,
  useUpdatePkiAlertV2
} from "@app/hooks/api/pkiAlertsV2";
import {
  TPkiApplication,
  TPkiApplicationProfile,
  useAttachPkiApplicationProfiles,
  useDetachPkiApplicationProfile
} from "@app/hooks/api/pkiApplications";
import { PkiApplicationModal } from "@app/pages/cert-manager/ApplicationsPage/components/PkiApplicationModal";
import { PolicyModal } from "@app/pages/cert-manager/ApprovalsPage/components/PolicyTab/components/PolicyModal";
import { CertificateIssuanceModal } from "@app/pages/cert-manager/CertificatesPage/components/CertificateIssuanceModal";
import { CreatePkiAlertV2Modal } from "@app/views/PkiAlertsV2Page/components/CreatePkiAlertV2Modal";
import { ViewPkiAlertV2Modal } from "@app/views/PkiAlertsV2Page/components/ViewPkiAlertV2Modal";
import {
  formatAlertBefore,
  formatEventType
} from "@app/views/PkiAlertsV2Page/utils/pki-alert-formatters";

import { ConfigureEnrollmentModal } from "./ConfigureEnrollmentModal";

type Props = { application: TPkiApplication; profiles: TPkiApplicationProfile[] };

const methodBadges = (p: TPkiApplicationProfile) => {
  const methods: string[] = [];
  if (p.apiConfigId) methods.push("API");
  if (p.estConfigId) methods.push("EST");
  if (p.acmeConfigId) methods.push("ACME");
  if (p.scepConfigId) methods.push("SCEP");
  return methods;
};

const getPolicyProfileNames = (policy: TApprovalPolicy): string[] => {
  const conditions = policy.conditions.conditions as CertRequestPolicyConditions;
  return conditions.flatMap((c: { profileNames: string[] }) => c.profileNames);
};

type ApplicationPoliciesTableProps = {
  applicationId: string;
  onEdit: (policy: TApprovalPolicy) => void;
  onDelete: (policy: TApprovalPolicy) => void;
};

const ApplicationPoliciesTable = ({
  applicationId,
  onEdit,
  onDelete
}: ApplicationPoliciesTableProps) => {
  const { currentProject } = useProject();
  const { data: policies = [], isPending } = useQuery(
    approvalPolicyQuery.list({
      policyType: ApprovalPolicyType.CertRequest,
      projectId: currentProject?.id ?? "",
      applicationId
    })
  );

  const sortedPolicies = useMemo(
    () =>
      [...policies].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [policies]
  );

  if (!isPending && sortedPolicies.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No approval policies</EmptyTitle>
          <EmptyDescription>
            Create a policy to gate certificate operations on this Application.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Policy Name</TableHead>
          <TableHead>Profile Name</TableHead>
          <TableHead>Approval Steps</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending &&
          Array.from({ length: 3 }, (_, idx) => (
            <TableRow key={`policy-skeleton-${idx + 1}`}>
              {Array.from({ length: 5 }, (__, cellIdx) => (
                <TableCell key={`policy-skeleton-cell-${cellIdx + 1}`}>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        {!isPending &&
          sortedPolicies.map((policy) => {
            const profileNames = getPolicyProfileNames(policy);
            return (
              <TableRow key={policy.id}>
                <TableCell isTruncatable>
                  <div className="flex items-center gap-x-2">
                    <span className="font-medium text-foreground">{policy.name}</span>
                    {!policy.applicationId ? (
                      <Badge variant="neutral" className="uppercase">
                        Legacy
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {profileNames.slice(0, 3).map((name) => (
                      <Badge key={name} variant="neutral">
                        {name}
                      </Badge>
                    ))}
                    {profileNames.length > 3 ? (
                      <span className="text-xs text-accent">+{profileNames.length - 3} more</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-accent">
                  {policy.steps.length} step{policy.steps.length !== 1 ? "s" : ""}
                </TableCell>
                <TableCell className="text-accent">
                  {formatDistance(new Date(policy.createdAt), new Date(), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton variant="ghost" size="xs" aria-label="Policy actions">
                        <MoreHorizontalIcon />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-40" align="end" sideOffset={2}>
                      <DropdownMenuItem onClick={() => onEdit(policy)}>
                        <PencilIcon />
                        Edit Policy
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="danger" onClick={() => onDelete(policy)}>
                        <Trash2Icon />
                        Delete Policy
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
};

type AlertRowProps = {
  alert: TPkiAlertV2;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const AlertRow = ({ alert, onView, onEdit, onDelete }: AlertRowProps) => {
  const { mutateAsync: updateAlert } = useUpdatePkiAlertV2();

  const handleToggleAlert = async () => {
    try {
      await updateAlert({ alertId: alert.id, enabled: !alert.enabled });
      createNotification({
        text: `Alert ${!alert.enabled ? "enabled" : "disabled"} successfully`,
        type: "success"
      });
    } catch {
      createNotification({ text: "Failed to update alert status", type: "error" });
    }
  };

  return (
    <TableRow>
      <TableCell isTruncatable>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{alert.name}</span>
          {alert.description ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="size-3.5 shrink-0 text-accent" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                {alert.description}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-accent">
        {formatEventType(alert.eventType)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge variant={alert.enabled ? "success" : "neutral"}>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-accent">
        {alert.eventType === PkiAlertEventTypeV2.EXPIRATION ? (
          formatAlertBefore(alert.alertBefore)
        ) : (
          <span className="text-mineshaft-500">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {alert.lastRun ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant={alert.lastRun.status === "success" ? "success" : "danger"}>
                {alert.lastRun.status === "success" ? "Success" : "Failed"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              <div className="text-xs text-mineshaft-300">
                {new Date(alert.lastRun.timestamp)
                  .toISOString()
                  .replace("T", " ")
                  .replace("Z", " UTC")}
              </div>
              {alert.lastRun.error ? (
                <div className="mt-1 max-h-32 thin-scrollbar overflow-y-auto text-xs break-words text-red-400">
                  {alert.lastRun.error}
                </div>
              ) : null}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-mineshaft-500">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="Alert actions">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-44" align="end" sideOffset={2}>
            <DropdownMenuItem onClick={onView}>
              <EyeIcon />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon />
              Edit alert
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggleAlert}>
              {alert.enabled ? <CircleStopIcon /> : <PlayIcon />}
              {alert.enabled ? "Disable" : "Enable"} alert
            </DropdownMenuItem>
            <DropdownMenuItem variant="danger" onClick={onDelete}>
              <Trash2Icon />
              Delete alert
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

export const ApplicationSettingsTab = ({ application, profiles }: Props) => {
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [profilesToAttach, setProfilesToAttach] = useState<{ value: string; label: string }[]>([]);
  const [profileToDetach, setProfileToDetach] = useState<TPkiApplicationProfile | null>(null);
  const [profileToConfigure, setProfileToConfigure] = useState<TPkiApplicationProfile | null>(null);

  const { data: profileList } = useListCertificateProfiles({ limit: 100 });
  const attachMutation = useAttachPkiApplicationProfiles();
  const detachMutation = useDetachPkiApplicationProfile();

  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "policy",
    "deletePolicy"
  ] as const);
  const {
    popUp: issuePopUp,
    handlePopUpOpen: handleIssuePopUpOpen,
    handlePopUpToggle: handleIssuePopUpToggle
  } = usePopUp(["issueCertificate"] as const);
  const {
    popUp: editPopUp,
    handlePopUpOpen: handleEditPopUpOpen,
    handlePopUpToggle: handleEditPopUpToggle
  } = usePopUp(["application"] as const);
  const [profileToIssue, setProfileToIssue] = useState<TPkiApplicationProfile | null>(null);
  const deletePolicy = useDeleteApprovalPolicy();

  const { data: alertsData, isLoading: isAlertsLoading } = useGetPkiAlertsV2({
    applicationId: application.id,
    limit: 100
  });
  const alerts = alertsData?.alerts ?? [];
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; alertId?: string }>({
    isOpen: false
  });
  const [viewAlertModal, setViewAlertModal] = useState<{ isOpen: boolean; alertId?: string }>({
    isOpen: false
  });
  const [deleteAlertModal, setDeleteAlertModal] = useState<{
    isOpen: boolean;
    alertId?: string;
    name?: string;
  }>({ isOpen: false });
  const { mutateAsync: deleteAlert } = useDeletePkiAlertV2();

  const handleDeleteAlert = async () => {
    if (!deleteAlertModal.alertId) return;
    try {
      await deleteAlert({
        alertId: deleteAlertModal.alertId,
        applicationId: application.id
      });
      setDeleteAlertModal({ isOpen: false });
      createNotification({ type: "success", text: "Alert deleted" });
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete alert"
      });
    }
  };

  const handleDeletePolicy = async () => {
    const p = popUp.deletePolicy.data as { policyId: string } | undefined;
    if (!p?.policyId) return;
    try {
      await deletePolicy.mutateAsync({
        policyType: ApprovalPolicyType.CertRequest,
        policyId: p.policyId
      });
      createNotification({ type: "success", text: "Policy deleted" });
      handlePopUpClose("deletePolicy");
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete policy"
      });
    }
  };

  const attachedIds = useMemo(() => new Set(profiles.map((p) => p.profileId)), [profiles]);
  const availableProfiles = useMemo(
    () =>
      (profileList?.certificateProfiles ?? [])
        .filter((p) => !attachedIds.has(p.id))
        .map((p) => ({ value: p.id, label: p.slug })),
    [profileList, attachedIds]
  );

  const handleAttach = async () => {
    if (profilesToAttach.length === 0) return;
    try {
      await attachMutation.mutateAsync({
        applicationId: application.id,
        profileIds: profilesToAttach.map((p) => p.value)
      });
      createNotification({ type: "success", text: "Profile(s) attached" });
      setProfilesToAttach([]);
      setIsAttachOpen(false);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to attach profile(s)"
      });
    }
  };

  const handleDetach = async () => {
    if (!profileToDetach) return;
    try {
      await detachMutation.mutateAsync({
        applicationId: application.id,
        profileId: profileToDetach.profileId
      });
      createNotification({ type: "success", text: "Profile detached" });
      setProfileToDetach(null);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to detach profile"
      });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="space-y-4 lg:order-2 lg:col-span-3">
        <Card>
          <CardHeader className="grid-cols-[1fr_auto]">
            <CardTitle>General</CardTitle>
            <CardDescription>Edit core metadata for this Application.</CardDescription>
            <CardAction className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
              <IconButton
                variant="ghost"
                size="xs"
                onClick={() => handleEditPopUpOpen("application", application)}
                aria-label="Edit application"
              >
                <PencilIcon />
              </IconButton>
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <div>
                <dt className="text-xs text-accent">Name</dt>
                <dd className="font-mono text-foreground">{application.name}</dd>
              </div>
              {application.description?.length ? (
                <div>
                  <dt className="text-xs text-accent">Description</dt>
                  <dd className="text-foreground">{application.description}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:order-1 lg:col-span-9">
        <Card>
          <CardHeader>
            <CardTitle>Enrollment Methods</CardTitle>
            <CardDescription>
              Profiles this Application can issue from, and the methods (API · EST · ACME · SCEP)
              configured on each.
            </CardDescription>
            <CardAction>
              <Button
                size="sm"
                variant="project"
                onClick={() => setIsAttachOpen(true)}
                isDisabled={availableProfiles.length === 0}
              >
                <PlusIcon />
                Attach Profile
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {profiles.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>No profiles attached</EmptyTitle>
                  <EmptyDescription>Attach a profile to enable issuance.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profile</TableHead>
                    <TableHead>Methods</TableHead>
                    <TableHead className="w-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => {
                    const methods = methodBadges(p);
                    return (
                      <TableRow key={p.profileId}>
                        <TableCell isTruncatable className="font-mono">
                          {p.profileSlug}
                        </TableCell>
                        <TableCell>
                          {methods.length === 0 ? (
                            <span className="text-xs text-accent">None</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {methods.map((m) => (
                                <Badge key={m} variant="neutral">
                                  {m}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton variant="ghost" size="xs">
                                <MoreHorizontalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="min-w-44" align="end" sideOffset={2}>
                              <DropdownMenuItem onClick={() => setProfileToConfigure(p)}>
                                <SettingsIcon />
                                Configure method
                              </DropdownMenuItem>
                              {p.apiConfigId ? (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setProfileToIssue(p);
                                    handleIssuePopUpOpen("issueCertificate");
                                  }}
                                >
                                  <FilePlusIcon />
                                  Request Certificate
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                variant="danger"
                                onClick={() => setProfileToDetach(p)}
                              >
                                <Trash2Icon />
                                Detach Profile
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approval Policies</CardTitle>
            <CardDescription>
              Approval workflows that gate certificate operations against this Application.
            </CardDescription>
            <CardAction>
              <Button variant="outline" onClick={() => handlePopUpOpen("policy")}>
                <FontAwesomeIcon icon={faPlus} />
                Create Policy
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ApplicationPoliciesTable
              applicationId={application.id}
              onEdit={(policy) => handlePopUpOpen("policy", { policyId: policy.id, policy })}
              onDelete={(policy) => handlePopUpOpen("deletePolicy", { policyId: policy.id })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerting</CardTitle>
            <CardDescription>
              Alert rules for certificate events scoped to {application.name}.
            </CardDescription>
            <CardAction>
              <Button variant="outline" onClick={() => setAlertModal({ isOpen: true })}>
                <FontAwesomeIcon icon={faPlus} />
                Create Alert
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Event Type</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Alert Before</TableHead>
                  <TableHead className="whitespace-nowrap">Last Run</TableHead>
                  <TableHead className="w-5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAlertsLoading &&
                  Array.from({ length: 3 }, (_, idx) => (
                    <TableRow key={`alert-skeleton-${idx + 1}`}>
                      {Array.from({ length: 6 }, (__, cellIdx) => (
                        <TableCell key={`alert-skeleton-cell-${cellIdx + 1}`}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!isAlertsLoading && alerts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-accent">
                      No PKI alerts configured yet.
                    </TableCell>
                  </TableRow>
                )}
                {!isAlertsLoading &&
                  alerts.map((a: TPkiAlertV2) => (
                    <AlertRow
                      key={a.id}
                      alert={a}
                      onView={() => setViewAlertModal({ isOpen: true, alertId: a.id })}
                      onEdit={() => setAlertModal({ isOpen: true, alertId: a.id })}
                      onDelete={() =>
                        setDeleteAlertModal({ isOpen: true, alertId: a.id, name: a.name })
                      }
                    />
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <PolicyModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        applicationId={application.id}
      />
      <DeleteActionModal
        isOpen={popUp.deletePolicy.isOpen}
        deleteKey="delete"
        title={`Delete approval policy ${(popUp.deletePolicy.data as TApprovalPolicy | undefined)?.name ?? ""}?`}
        onChange={(isOpen) => handlePopUpToggle("deletePolicy", isOpen)}
        onDeleteApproved={handleDeletePolicy}
      />
      <CreatePkiAlertV2Modal
        isOpen={alertModal.isOpen}
        onOpenChange={(isOpen) => setAlertModal({ isOpen, alertId: undefined })}
        applicationId={application.id}
        alertId={alertModal.alertId}
      />
      <ViewPkiAlertV2Modal
        isOpen={viewAlertModal.isOpen}
        onOpenChange={(isOpen) => setViewAlertModal({ isOpen, alertId: undefined })}
        alertId={viewAlertModal.alertId}
      />
      <DeleteActionModal
        isOpen={deleteAlertModal.isOpen}
        deleteKey="delete"
        title={`Delete PKI Alert "${deleteAlertModal.name ?? ""}"`}
        onChange={(isOpen) => setDeleteAlertModal({ isOpen, alertId: undefined, name: undefined })}
        onDeleteApproved={handleDeleteAlert}
      />

      <Dialog
        open={isAttachOpen}
        onOpenChange={(open) => {
          setIsAttachOpen(open);
          if (!open) setProfilesToAttach([]);
        }}
      >
        <DialogContent className="max-w-md overflow-visible">
          <DialogHeader>
            <DialogTitle>Attach Profiles</DialogTitle>
            <DialogDescription>
              Select one or more profiles to attach to this Application.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <FilterableSelect
              isMulti
              value={profilesToAttach}
              onChange={(val) =>
                setProfilesToAttach((val ?? []) as { value: string; label: string }[])
              }
              options={availableProfiles}
              placeholder="Select profiles..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAttachOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="project"
              onClick={handleAttach}
              isDisabled={profilesToAttach.length === 0 || attachMutation.isPending}
              isPending={attachMutation.isPending}
            >
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteActionModal
        isOpen={Boolean(profileToDetach)}
        title={`Detach profile ${profileToDetach?.profileSlug ?? ""}?`}
        subTitle="This Application will no longer be able to issue from this Profile. Existing certificates remain."
        deleteKey="confirm"
        onChange={(open) => {
          if (!open) setProfileToDetach(null);
        }}
        onDeleteApproved={handleDetach}
      />

      <ConfigureEnrollmentModal
        isOpen={Boolean(profileToConfigure)}
        onOpenChange={(open) => {
          if (!open) setProfileToConfigure(null);
        }}
        applicationId={application.id}
        profile={profileToConfigure}
      />

      <CertificateIssuanceModal
        popUp={issuePopUp}
        handlePopUpToggle={(name, state) => {
          handleIssuePopUpToggle(name, state);
          if (state === false) setProfileToIssue(null);
        }}
        profileId={profileToIssue?.profileId}
        applicationId={application.id}
      />

      <PkiApplicationModal popUp={editPopUp} handlePopUpToggle={handleEditPopUpToggle} />
    </div>
  );
};
