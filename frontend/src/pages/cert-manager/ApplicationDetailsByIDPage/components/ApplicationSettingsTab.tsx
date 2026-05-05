import { useMemo, useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  FilePlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button as V2Button,
  DeleteActionModal,
  FilterableSelect,
  Skeleton as V2Skeleton,
  Table as V2Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
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
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { usePopUp } from "@app/hooks";
import {
  ApprovalPolicyType,
  TApprovalPolicy,
  useDeleteApprovalPolicy
} from "@app/hooks/api/approvalPolicies";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { TPkiAlertV2, useDeletePkiAlertV2, useGetPkiAlertsV2 } from "@app/hooks/api/pkiAlertsV2";
import {
  TPkiApplication,
  TPkiApplicationProfile,
  useAttachPkiApplicationProfiles,
  useDetachPkiApplicationProfile
} from "@app/hooks/api/pkiApplications";
import { PoliciesTable } from "@app/pages/cert-manager/ApprovalsPage/components/PolicyTab/components/PoliciesTable";
import { PolicyModal } from "@app/pages/cert-manager/ApprovalsPage/components/PolicyTab/components/PolicyModal";
import { PkiApplicationModal } from "@app/pages/cert-manager/ApplicationsPage/components/PkiApplicationModal";
import { CertificateIssuanceModal } from "@app/pages/cert-manager/CertificatesPage/components/CertificateIssuanceModal";
import { CreatePkiAlertV2Modal } from "@app/views/PkiAlertsV2Page/components/CreatePkiAlertV2Modal";
import { PkiAlertV2Row } from "@app/views/PkiAlertsV2Page/components/PkiAlertV2Row";
import { ViewPkiAlertV2Modal } from "@app/views/PkiAlertsV2Page/components/ViewPkiAlertV2Modal";

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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Edit core metadata for this Application.</CardDescription>
          <CardAction>
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
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs text-accent">Name</dt>
              <dd className="font-mono text-foreground">{application.name}</dd>
            </div>
            {application.description?.length ? (
              <div className="col-span-full">
                <dt className="text-xs text-accent">Description</dt>
                <dd className="text-foreground">{application.description}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

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
            <V2Button
              variant="outline_bg"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("policy")}
            >
              Create Policy
            </V2Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <PoliciesTable handlePopUpOpen={handlePopUpOpen} applicationId={application.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alerting</CardTitle>
          <CardDescription>
            Alert rules for certificate events scoped to {application.name}.
          </CardDescription>
          <CardAction>
            <V2Button
              variant="outline_bg"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => setAlertModal({ isOpen: true })}
            >
              Create Alert
            </V2Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <TableContainer>
            <V2Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Event Type</Th>
                  <Th>Status</Th>
                  <Th>Alert Before</Th>
                  <Th>Last Run</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </THead>
              <TBody>
                {isAlertsLoading &&
                  Array.from({ length: 3 }, (_, idx) => (
                    <Tr key={`alert-skeleton-${idx + 1}`}>
                      {Array.from({ length: 6 }, (__, cellIdx) => (
                        <Td key={`alert-skeleton-cell-${cellIdx + 1}`}>
                          <V2Skeleton className="h-4 w-24" />
                        </Td>
                      ))}
                    </Tr>
                  ))}
                {!isAlertsLoading && alerts.length === 0 && (
                  <Tr>
                    <Td colSpan={6} className="py-8 text-center text-mineshaft-400">
                      No PKI alerts configured yet.
                    </Td>
                  </Tr>
                )}
                {!isAlertsLoading &&
                  alerts.map((a: TPkiAlertV2) => (
                    <PkiAlertV2Row
                      key={a.id}
                      alert={a}
                      onView={() => setViewAlertModal({ isOpen: true, alertId: a.id })}
                      onEdit={() => setAlertModal({ isOpen: true, alertId: a.id })}
                      onDelete={() =>
                        setDeleteAlertModal({ isOpen: true, alertId: a.id, name: a.name })
                      }
                    />
                  ))}
              </TBody>
            </V2Table>
          </TableContainer>
        </CardContent>
      </Card>

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
