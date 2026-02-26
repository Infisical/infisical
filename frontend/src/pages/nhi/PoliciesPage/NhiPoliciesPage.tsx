import { useState } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircleIcon,
  PencilIcon,
  PlusIcon,
  ShieldAlertIcon,
  TrashIcon,
  XCircleIcon
} from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button as V2Button,
  Checkbox,
  DeleteActionModal,
  FormControl,
  Input,
  Modal,
  ModalContent,
  PageHeader,
  Select as V2Select,
  SelectItem as V2SelectItem,
  Switch
} from "@app/components/v2";
import {
  Badge,
  Button,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useCreateNhiPolicy,
  useDeleteNhiPolicy,
  useListNhiPolicies,
  useListRecentExecutions,
  useUpdateNhiPolicy
} from "@app/hooks/api/nhi";
import { NhiRemediationActionType, TNhiPolicy } from "@app/hooks/api/nhi/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

const RISK_FACTOR_OPTIONS = [
  { value: "HAS_ADMIN_ACCESS", label: "Has Admin Access" },
  { value: "CREDENTIAL_VERY_OLD", label: "Credential Very Old (365+ days)" },
  { value: "CREDENTIAL_OLD", label: "Credential Old (180+ days)" },
  { value: "NO_ROTATION_90_DAYS", label: "No Rotation (90+ days)" },
  { value: "INACTIVE_BUT_ENABLED", label: "Inactive but Enabled" },
  { value: "NO_OWNER", label: "No Owner Assigned" },
  { value: "UNUSED_LONG_TERM", label: "Unused Long Term" },
  { value: "DEPLOY_KEY_WRITE_ACCESS", label: "Deploy Key with Write Access" },
  { value: "NO_EXPIRATION", label: "No Expiration Set" },
  { value: "OVERLY_PERMISSIVE_APP", label: "Overly Permissive App" }
];

const IDENTITY_TYPE_OPTIONS = [
  { value: "iam_user", label: "IAM User" },
  { value: "iam_role", label: "IAM Role" },
  { value: "iam_access_key", label: "IAM Access Key" },
  { value: "github_app_installation", label: "GitHub App Installation" },
  { value: "github_deploy_key", label: "GitHub Deploy Key" },
  { value: "github_finegrained_pat", label: "GitHub Fine-Grained PAT" }
];

const PROVIDER_OPTIONS = [
  { value: "aws", label: "AWS" },
  { value: "github", label: "GitHub" }
];

const REMEDIATION_ACTION_OPTIONS = [
  { value: NhiRemediationActionType.DeactivateAccessKey, label: "Deactivate Access Key" },
  { value: NhiRemediationActionType.DeleteAccessKey, label: "Delete Access Key" },
  { value: NhiRemediationActionType.DeactivateAllAccessKeys, label: "Deactivate All Access Keys" },
  {
    value: NhiRemediationActionType.RemoveAdminPoliciesUser,
    label: "Remove Admin Policies (User)"
  },
  {
    value: NhiRemediationActionType.RemoveAdminPoliciesRole,
    label: "Remove Admin Policies (Role)"
  },
  { value: NhiRemediationActionType.DeleteDeployKey, label: "Delete Deploy Key" },
  { value: NhiRemediationActionType.RevokeFinegrainedPat, label: "Revoke Fine-Grained PAT" },
  { value: NhiRemediationActionType.SuspendAppInstallation, label: "Suspend App Installation" }
];

const RISK_SCORE_OPTIONS = [
  { value: 70, label: "Critical (70+)" },
  { value: 40, label: "High (40+)" },
  { value: 20, label: "Medium (20+)" }
];

const policyFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(255),
    description: z.string().max(1000).optional(),
    conditionRiskFactors: z.array(z.string()).optional(),
    conditionMinRiskScore: z.number().nullable().optional(),
    conditionIdentityTypes: z.array(z.string()).optional(),
    conditionProviders: z.array(z.string()).optional(),
    actionRemediate: z.string().nullable().optional(),
    actionFlag: z.boolean().optional()
  })
  .refine((data) => Boolean(data.actionRemediate) || data.actionFlag, {
    message: "At least one action must be selected",
    path: ["actionFlag"]
  });

type TPolicyForm = z.infer<typeof policyFormSchema>;

const getActionLabel = (actionType: string) => {
  const opt = REMEDIATION_ACTION_OPTIONS.find((o) => o.value === actionType);
  return opt?.label ?? actionType;
};

export const NhiPoliciesPage = () => {
  const { currentProject } = useProject();

  const { data: policies = [], isPending } = useListNhiPolicies(currentProject.id);
  const { data: recentExecutions = [] } = useListRecentExecutions(currentProject.id);

  const createPolicy = useCreateNhiPolicy();
  const updatePolicy = useUpdateNhiPolicy();
  const deletePolicy = useDeleteNhiPolicy();

  const [policyToDelete, setPolicyToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<TNhiPolicy | null>(null);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["policyForm"] as const);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors }
  } = useForm<TPolicyForm>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: {
      name: "",
      description: "",
      conditionRiskFactors: [],
      conditionMinRiskScore: null,
      conditionIdentityTypes: [],
      conditionProviders: [],
      actionRemediate: null,
      actionFlag: false
    }
  });

  const openCreateModal = () => {
    setEditingPolicy(null);
    reset({
      name: "",
      description: "",
      conditionRiskFactors: [],
      conditionMinRiskScore: null,
      conditionIdentityTypes: [],
      conditionProviders: [],
      actionRemediate: null,
      actionFlag: false
    });
    handlePopUpOpen("policyForm");
  };

  const openEditModal = (policy: TNhiPolicy) => {
    setEditingPolicy(policy);
    reset({
      name: policy.name,
      description: policy.description ?? "",
      conditionRiskFactors: (policy.conditionRiskFactors as string[]) ?? [],
      conditionMinRiskScore: policy.conditionMinRiskScore,
      conditionIdentityTypes: (policy.conditionIdentityTypes as string[]) ?? [],
      conditionProviders: (policy.conditionProviders as string[]) ?? [],
      actionRemediate: policy.actionRemediate ?? null,
      actionFlag: policy.actionFlag
    });
    handlePopUpOpen("policyForm");
  };

  const onSubmitPolicy = async (formData: TPolicyForm) => {
    try {
      if (editingPolicy) {
        await updatePolicy.mutateAsync({
          policyId: editingPolicy.id,
          projectId: currentProject.id,
          name: formData.name,
          description: formData.description || null,
          conditionRiskFactors:
            formData.conditionRiskFactors && formData.conditionRiskFactors.length > 0
              ? formData.conditionRiskFactors
              : null,
          conditionMinRiskScore: formData.conditionMinRiskScore ?? null,
          conditionIdentityTypes:
            formData.conditionIdentityTypes && formData.conditionIdentityTypes.length > 0
              ? formData.conditionIdentityTypes
              : null,
          conditionProviders:
            formData.conditionProviders && formData.conditionProviders.length > 0
              ? formData.conditionProviders
              : null,
          actionRemediate: formData.actionRemediate || null,
          actionFlag: formData.actionFlag ?? false
        });
        createNotification({ text: "Policy updated", type: "success" });
      } else {
        await createPolicy.mutateAsync({
          projectId: currentProject.id,
          name: formData.name,
          description: formData.description,
          conditionRiskFactors:
            formData.conditionRiskFactors && formData.conditionRiskFactors.length > 0
              ? formData.conditionRiskFactors
              : undefined,
          conditionMinRiskScore: formData.conditionMinRiskScore ?? undefined,
          conditionIdentityTypes:
            formData.conditionIdentityTypes && formData.conditionIdentityTypes.length > 0
              ? formData.conditionIdentityTypes
              : undefined,
          conditionProviders:
            formData.conditionProviders && formData.conditionProviders.length > 0
              ? formData.conditionProviders
              : undefined,
          actionRemediate: formData.actionRemediate || null,
          actionFlag: formData.actionFlag ?? false
        });
        createNotification({ text: "Policy created", type: "success" });
      }
      reset();
      handlePopUpToggle("policyForm", false);
      setEditingPolicy(null);
    } catch {
      createNotification({
        text: `Failed to ${editingPolicy ? "update" : "create"} policy`,
        type: "error"
      });
    }
  };

  const onToggleEnabled = async (policy: TNhiPolicy) => {
    try {
      await updatePolicy.mutateAsync({
        policyId: policy.id,
        projectId: currentProject.id,
        isEnabled: !policy.isEnabled
      });
      createNotification({
        text: `Policy ${policy.isEnabled ? "disabled" : "enabled"}`,
        type: "success"
      });
    } catch {
      createNotification({ text: "Failed to update policy", type: "error" });
    }
  };

  const onDeletePolicy = async () => {
    if (!policyToDelete) return;
    try {
      await deletePolicy.mutateAsync({
        policyId: policyToDelete.id,
        projectId: currentProject.id
      });
      createNotification({ text: "Policy deleted", type: "success" });
      setPolicyToDelete(null);
    } catch {
      createNotification({ text: "Failed to delete policy", type: "error" });
    }
  };

  const renderConditionBadges = (policy: TNhiPolicy) => {
    const badges: { label: string; variant: "info" | "warning" | "neutral" }[] = [];

    const riskFactors = (policy.conditionRiskFactors ?? []) as string[];
    if (riskFactors.length > 0) {
      badges.push({
        label: `${riskFactors.length} risk factor${riskFactors.length > 1 ? "s" : ""}`,
        variant: "warning"
      });
    }
    if (policy.conditionMinRiskScore != null) {
      badges.push({ label: `Score >= ${policy.conditionMinRiskScore}`, variant: "info" });
    }
    const types = (policy.conditionIdentityTypes ?? []) as string[];
    if (types.length > 0) {
      badges.push({
        label: `${types.length} type${types.length > 1 ? "s" : ""}`,
        variant: "neutral"
      });
    }
    const providers = (policy.conditionProviders ?? []) as string[];
    if (providers.length > 0) {
      badges.push({
        label: providers.map((p) => p.toUpperCase()).join(", "),
        variant: "neutral"
      });
    }
    if (badges.length === 0) {
      badges.push({ label: "All identities", variant: "neutral" });
    }
    return badges;
  };

  const renderActionBadges = (policy: TNhiPolicy) => {
    const badges: string[] = [];
    if (policy.actionRemediate) {
      badges.push(getActionLabel(policy.actionRemediate));
    }
    if (policy.actionFlag) {
      badges.push("Auto-Flag");
    }
    return badges;
  };

  return (
    <>
      <Helmet>
        <title>Identity - Policies</title>
      </Helmet>
      <div className="flex items-center justify-between">
        <PageHeader
          scope={ProjectType.NHI}
          title="Automated Policies"
          description="Define rules to automatically remediate and flag identities after each scan."
        />
        <Button onClick={openCreateModal}>
          <PlusIcon size={14} className="mr-1" />
          Create Policy
        </Button>
      </div>

      <UnstableTable containerClassName="mt-4">
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Name</UnstableTableHead>
            <UnstableTableHead>Conditions</UnstableTableHead>
            <UnstableTableHead>Actions</UnstableTableHead>
            <UnstableTableHead>Enabled</UnstableTableHead>
            <UnstableTableHead>Last Triggered</UnstableTableHead>
            <UnstableTableHead className="w-24" />
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {!isPending &&
            policies.map((policy) => (
              <UnstableTableRow key={policy.id}>
                <UnstableTableCell>
                  <div>
                    <span className="font-medium text-mineshaft-100">{policy.name}</span>
                    {policy.description && (
                      <p className="mt-0.5 text-xs text-mineshaft-400">{policy.description}</p>
                    )}
                  </div>
                </UnstableTableCell>
                <UnstableTableCell>
                  <div className="flex flex-wrap gap-1">
                    {renderConditionBadges(policy).map((b) => (
                      <Badge key={b.label} variant={b.variant} className="text-xs">
                        {b.label}
                      </Badge>
                    ))}
                  </div>
                </UnstableTableCell>
                <UnstableTableCell>
                  <div className="flex flex-wrap gap-1">
                    {renderActionBadges(policy).map((actionLabel) => (
                      <Badge key={actionLabel} variant="info" className="text-xs">
                        {actionLabel}
                      </Badge>
                    ))}
                  </div>
                </UnstableTableCell>
                <UnstableTableCell>
                  <Switch
                    id={`policy-toggle-${policy.id}`}
                    isChecked={policy.isEnabled}
                    onCheckedChange={() => onToggleEnabled(policy)}
                  />
                </UnstableTableCell>
                <UnstableTableCell>
                  {policy.lastTriggeredAt
                    ? new Date(policy.lastTriggeredAt).toLocaleString()
                    : "Never"}
                </UnstableTableCell>
                <UnstableTableCell>
                  <div className="flex items-center gap-2">
                    <Button size="xs" variant="outline" onClick={() => openEditModal(policy)}>
                      <PencilIcon size={12} />
                    </Button>
                    <Button
                      size="xs"
                      variant="danger"
                      onClick={() => setPolicyToDelete({ id: policy.id, name: policy.name })}
                    >
                      <TrashIcon size={12} />
                    </Button>
                  </div>
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
        </UnstableTableBody>
      </UnstableTable>
      {!isPending && policies.length === 0 && (
        <UnstableEmpty>
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>No policies configured</UnstableEmptyTitle>
            <UnstableEmptyDescription>
              Create an automated policy to enforce security rules after every scan.
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      )}

      {/* Recent Policy Executions */}
      {recentExecutions.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-3 text-lg font-medium text-mineshaft-100">Recent Policy Executions</h3>
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead>Policy</UnstableTableHead>
                <UnstableTableHead>Identity</UnstableTableHead>
                <UnstableTableHead>Action</UnstableTableHead>
                <UnstableTableHead>Status</UnstableTableHead>
                <UnstableTableHead>Time</UnstableTableHead>
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {recentExecutions.map((exec) => (
                <UnstableTableRow key={exec.id}>
                  <UnstableTableCell className="font-medium text-mineshaft-100">
                    {exec.policyName ?? exec.policyId.slice(0, 8)}
                  </UnstableTableCell>
                  <UnstableTableCell>
                    {exec.identityName ?? exec.identityId.slice(0, 8)}
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <Badge variant="info" className="text-xs">
                      {exec.actionTaken.replace(/_/g, " ")}
                    </Badge>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    {exec.status === "completed" ? (
                      <span className="inline-flex items-center gap-1 text-green-500">
                        <CheckCircleIcon size={14} />
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-500">
                        <XCircleIcon size={14} />
                        Failed
                      </span>
                    )}
                  </UnstableTableCell>
                  <UnstableTableCell>{new Date(exec.createdAt).toLocaleString()}</UnstableTableCell>
                </UnstableTableRow>
              ))}
            </UnstableTableBody>
          </UnstableTable>
        </div>
      )}

      {/* Create/Edit Policy Modal */}
      <Modal
        isOpen={popUp.policyForm.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("policyForm", isOpen);
          if (!isOpen) setEditingPolicy(null);
        }}
      >
        <ModalContent title={editingPolicy ? "Edit Policy" : "Create Policy"}>
          <form onSubmit={handleSubmit(onSubmitPolicy)}>
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Policy Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="e.g. Auto-deactivate old AWS keys" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Description"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="Optional description" />
                </FormControl>
              )}
            />

            <div className="mt-4 mb-2 flex items-center gap-2 text-sm font-medium text-mineshaft-200">
              <ShieldAlertIcon size={14} />
              Conditions
            </div>
            <p className="mb-3 text-xs text-mineshaft-400">
              All specified conditions must match (AND). Leave empty to match all identities.
            </p>

            <Controller
              control={control}
              name="conditionRiskFactors"
              render={({ field: { value, onChange } }) => (
                <FormControl label="Risk Factors (match any)">
                  <div className="flex flex-wrap gap-2">
                    {RISK_FACTOR_OPTIONS.map((opt) => {
                      const selected = (value ?? []).includes(opt.value);
                      return (
                        <button
                          type="button"
                          key={opt.value}
                          className={`cursor-pointer rounded border px-2 py-1 text-xs transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-mineshaft-600 text-mineshaft-300 hover:border-mineshaft-400"
                          }`}
                          onClick={() => {
                            if (selected) {
                              onChange((value ?? []).filter((v: string) => v !== opt.value));
                            } else {
                              onChange([...(value ?? []), opt.value]);
                            }
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="conditionMinRiskScore"
              render={({ field: { value, onChange } }) => (
                <FormControl label="Minimum Risk Score">
                  <V2Select
                    value={value != null ? String(value) : "none"}
                    onValueChange={(val) => onChange(val !== "none" ? Number(val) : null)}
                    className="w-full"
                    placeholder="Any score"
                  >
                    <V2SelectItem value="none">Any score</V2SelectItem>
                    {RISK_SCORE_OPTIONS.map((opt) => (
                      <V2SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </V2SelectItem>
                    ))}
                  </V2Select>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="conditionIdentityTypes"
              render={({ field: { value, onChange } }) => (
                <FormControl label="Identity Types">
                  <div className="flex flex-wrap gap-2">
                    {IDENTITY_TYPE_OPTIONS.map((opt) => {
                      const selected = (value ?? []).includes(opt.value);
                      return (
                        <button
                          type="button"
                          key={opt.value}
                          className={`cursor-pointer rounded border px-2 py-1 text-xs transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-mineshaft-600 text-mineshaft-300 hover:border-mineshaft-400"
                          }`}
                          onClick={() => {
                            if (selected) {
                              onChange((value ?? []).filter((v: string) => v !== opt.value));
                            } else {
                              onChange([...(value ?? []), opt.value]);
                            }
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="conditionProviders"
              render={({ field: { value, onChange } }) => (
                <FormControl label="Providers">
                  <div className="flex flex-wrap gap-2">
                    {PROVIDER_OPTIONS.map((opt) => {
                      const selected = (value ?? []).includes(opt.value);
                      return (
                        <button
                          type="button"
                          key={opt.value}
                          className={`cursor-pointer rounded border px-2 py-1 text-xs transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-mineshaft-600 text-mineshaft-300 hover:border-mineshaft-400"
                          }`}
                          onClick={() => {
                            if (selected) {
                              onChange((value ?? []).filter((v: string) => v !== opt.value));
                            } else {
                              onChange([...(value ?? []), opt.value]);
                            }
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </FormControl>
              )}
            />

            <div className="mt-4 mb-2 text-sm font-medium text-mineshaft-200">Actions</div>

            <Controller
              control={control}
              name="actionFlag"
              render={({ field: { value, onChange } }) => (
                <div className="mb-3">
                  <Checkbox
                    id="actionFlag"
                    isChecked={value}
                    onCheckedChange={(checked) => onChange(checked)}
                  >
                    Auto-flag matching identities
                  </Checkbox>
                </div>
              )}
            />

            <Controller
              control={control}
              name="actionRemediate"
              render={({ field: { value, onChange } }) => (
                <FormControl label="Auto-Remediate">
                  <V2Select
                    value={value ?? "none"}
                    onValueChange={(val) => onChange(val !== "none" ? val : null)}
                    className="w-full"
                    placeholder="No auto-remediation"
                  >
                    <V2SelectItem value="none">No auto-remediation</V2SelectItem>
                    {REMEDIATION_ACTION_OPTIONS.map((opt) => (
                      <V2SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </V2SelectItem>
                    ))}
                  </V2Select>
                </FormControl>
              )}
            />

            {errors.actionFlag && (
              <p className="mb-2 text-xs text-red-500">{errors.actionFlag.message}</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <V2Button
                variant="outline_bg"
                onClick={() => {
                  handlePopUpToggle("policyForm", false);
                  setEditingPolicy(null);
                }}
                type="button"
              >
                Cancel
              </V2Button>
              <V2Button type="submit" isLoading={isSubmitting}>
                {editingPolicy ? "Save Changes" : "Create Policy"}
              </V2Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      <DeleteActionModal
        isOpen={Boolean(policyToDelete)}
        title={`Delete policy "${policyToDelete?.name}"?`}
        subTitle="This will permanently delete the policy and its execution history."
        onChange={(isOpen) => !isOpen && setPolicyToDelete(null)}
        deleteKey={policyToDelete?.name ?? ""}
        onDeleteApproved={onDeletePolicy}
      />
    </>
  );
};
