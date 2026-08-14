import { useId, useMemo, useState } from "react";
import {
  Control,
  Controller,
  useFieldArray,
  useForm,
  UseFormSetValue,
  useWatch
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatDistance } from "date-fns";
import { ChevronDownIcon, ClockIcon, PlusIcon, TrashIcon } from "lucide-react";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  PageLoader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { formatProjectRoleName, isCustomProjectRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useGetProjectRoles, useUpdateProjectIdentityMembership } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { TemporaryPermissionMode } from "@app/hooks/api/shared";
import {
  canModifyByGrantConditions,
  filterByGrantConditions,
  getIdentityAssignRoleConditions
} from "@app/lib/fn/permission";

const TEMPORARY_RANGE_ERROR = "Only valid time values are accepted (1h, 20m, 2d).";

const isValidTemporaryRange = (value?: string) => {
  if (!value?.trim()) return false;
  const parsedMs = ms(value);
  return typeof parsedMs === "number" && Number.isFinite(parsedMs) && parsedMs > 0;
};

const roleFormSchema = z.object({
  roles: z
    .object({
      slug: z.string().min(1),
      temporaryAccess: z.discriminatedUnion("isTemporary", [
        z.object({
          isTemporary: z.literal(true),
          temporaryRange: z
            .string()
            .min(1, "Required")
            .refine(isValidTemporaryRange, TEMPORARY_RANGE_ERROR),
          temporaryAccessStartTime: z.string().datetime(),
          temporaryAccessEndTime: z.string().datetime().nullable().optional()
        }),
        z.object({
          isTemporary: z.literal(false)
        })
      ])
    })
    .array()
});

type TRoleForm = z.infer<typeof roleFormSchema>;
type TTemporaryAccess = TRoleForm["roles"][number]["temporaryAccess"];
type RoleForSelect = { slug: string; name: string; id: string };

const getDurationDisplay = (temporaryAccess?: TTemporaryAccess) => {
  if (!temporaryAccess?.isTemporary) {
    return {
      variant: "outline" as const,
      text: "Permanent",
      tooltip: "Non-Expiring Access",
      isExpired: false
    };
  }

  const endTime = new Date(temporaryAccess.temporaryAccessEndTime || "");
  if (new Date() > endTime) {
    return {
      variant: "danger" as const,
      text: "Access Expired",
      tooltip: "Timed Access Expired",
      isExpired: true
    };
  }

  return {
    variant: "warning" as const,
    text: formatDistance(endTime, new Date()),
    tooltip: `Until ${format(endTime, "yyyy-MM-dd HH:mm:ss")}`,
    isExpired: false
  };
};

type DurationEditorProps = {
  committedRange?: string;
  isTemporary: boolean;
  isExpired: boolean;
  onApply: (temporaryRange: string) => void;
  onRemove: () => void;
};

const DurationEditor = ({
  committedRange,
  isTemporary,
  isExpired,
  onApply,
  onRemove
}: DurationEditorProps) => {
  const inputId = useId();
  const [draft, setDraft] = useState(committedRange ?? "1h");
  const isValid = isValidTemporaryRange(draft);
  const errorMessage = draft && !isValid ? TEMPORARY_RANGE_ERROR : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="border-b border-b-border pb-2 text-sm text-muted">Configure Timed Access</div>
      {isExpired && <Badge variant="danger">Expired</Badge>}
      <Field>
        <FieldLabel htmlFor={inputId}>
          <TtlFormLabel label="Validity" />
        </FieldLabel>
        <Input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          isError={Boolean(errorMessage)}
        />
        {errorMessage && <FieldError>{errorMessage}</FieldError>}
      </Field>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          isDisabled={!isValid}
          onClick={() => onApply(draft)}
        >
          {isTemporary ? "Restart" : "Configure"}
        </Button>
        {isTemporary && (
          <Button type="button" size="xs" variant="danger" onClick={onRemove}>
            Remove Duration
          </Button>
        )}
      </div>
    </div>
  );
};

type RoleAssignmentRowProps = {
  control: Control<TRoleForm>;
  setValue: UseFormSetValue<TRoleForm>;
  index: number;
  showLabels: boolean;
  isEditDisabled: boolean;
  assignableRoleSlugs: Set<string>;
  getRolesForSelect: (currentSlug: string) => RoleForSelect[];
  canRemove: boolean;
  onRemove: () => void;
};

const IdentityRoleAssignmentRow = ({
  control,
  setValue,
  index,
  showLabels,
  isEditDisabled,
  assignableRoleSlugs,
  getRolesForSelect,
  canRemove,
  onRemove
}: RoleAssignmentRowProps) => {
  const selectId = useId();
  const durationId = useId();
  const temporaryAccess = useWatch({ control, name: `roles.${index}.temporaryAccess` });
  const isTemporary = Boolean(temporaryAccess?.isTemporary);
  const { variant, text, tooltip, isExpired } = getDurationDisplay(temporaryAccess);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Controller
        control={control}
        name={`roles.${index}.slug`}
        render={({ field }) => (
          <Field className="min-w-48 flex-1">
            {showLabels && <FieldLabel htmlFor={selectId}>Role</FieldLabel>}
            <Select value={field.value} onValueChange={field.onChange} disabled={isEditDisabled}>
              <SelectTrigger id={selectId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[70]">
                {getRolesForSelect(field.value).map(({ name, slug, id }) => {
                  const isAssignable = assignableRoleSlugs.has(slug);
                  return (
                    <SelectItem
                      value={slug}
                      key={id}
                      disabled={!isAssignable}
                      description={
                        isAssignable ? undefined : "You don't have permission to assign this role"
                      }
                    >
                      {name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </Field>
        )}
      />
      <Field className="w-44 shrink-0">
        {showLabels && <FieldLabel htmlFor={durationId}>Duration</FieldLabel>}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  id={durationId}
                  type="button"
                  variant={variant}
                  isDisabled={isEditDisabled}
                  className="w-full capitalize"
                >
                  {isTemporary && <ClockIcon />}
                  {text}
                  <ChevronDownIcon className="ml-auto" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
          <PopoverContent
            side="right"
            className="z-[70]"
            onWheel={(event) => event.stopPropagation()}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DurationEditor
              committedRange={
                temporaryAccess?.isTemporary ? temporaryAccess.temporaryRange : undefined
              }
              isTemporary={isTemporary}
              isExpired={isExpired}
              onApply={(temporaryRange) =>
                setValue(
                  `roles.${index}.temporaryAccess`,
                  {
                    isTemporary: true,
                    temporaryAccessStartTime: new Date().toISOString(),
                    temporaryRange,
                    temporaryAccessEndTime: new Date(
                      new Date().getTime() + (ms(temporaryRange) as number)
                    ).toISOString()
                  },
                  { shouldDirty: true }
                )
              }
              onRemove={() =>
                setValue(
                  `roles.${index}.temporaryAccess`,
                  { isTemporary: false },
                  { shouldDirty: true }
                )
              }
            />
          </PopoverContent>
        </Popover>
      </Field>
      <IconButton
        type="button"
        size="md"
        variant="outline"
        aria-label="Remove role"
        className="shrink-0 hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
        isDisabled={isEditDisabled || !canRemove}
        onClick={onRemove}
      >
        <TrashIcon />
      </IconButton>
    </div>
  );
};

type Props = {
  identityProjectMembership: IdentityProjectMembershipV1;
  onClose: () => void;
};

export const IdentityRoleModify = ({ identityProjectMembership, onClose }: Props) => {
  const { projectId, currentProject } = useProject();
  const { subscription } = useSubscription();
  const { data: projectRoles, isPending: isRolesLoading } = useGetProjectRoles(
    projectId,
    currentProject?.type
  );
  const { permission } = useProjectPermission();
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);
  const isIdentityEditDisabled = permission.cannot(
    ProjectPermissionIdentityActions.Edit,
    ProjectPermissionSub.Identity
  );

  const assignRoleConditions = useMemo(
    () => getIdentityAssignRoleConditions(permission),
    [permission]
  );

  const canModifyIdentityRoles = useMemo(() => {
    const targetIdentityId = identityProjectMembership?.identity?.id;
    if (!targetIdentityId) return false;

    return canModifyByGrantConditions({
      targetValue: targetIdentityId,
      allowed: assignRoleConditions?.identityIds,
      forbidden: assignRoleConditions?.forbiddenIdentityIds
    });
  }, [assignRoleConditions, identityProjectMembership?.identity?.id]);

  const filteredRoles = useMemo(
    () =>
      filterByGrantConditions(projectRoles ?? [], {
        getKey: (role) => role.slug,
        allowed: assignRoleConditions?.roles,
        forbidden: assignRoleConditions?.forbiddenRoles
      }),
    [projectRoles, assignRoleConditions]
  );

  const assignableRoleSlugs = useMemo(
    () => new Set(filteredRoles.map((role) => role.slug)),
    [filteredRoles]
  );

  const getRolesForSelect = (currentSlug: string) => {
    if (assignableRoleSlugs.has(currentSlug)) return filteredRoles;

    const currentRole = projectRoles?.find((role) => role.slug === currentSlug) ?? {
      slug: currentSlug,
      name: formatProjectRoleName(currentSlug),
      id: currentSlug
    };
    return [currentRole, ...filteredRoles];
  };

  const roleForm = useForm<TRoleForm>({
    resolver: zodResolver(roleFormSchema),
    values: {
      roles: identityProjectMembership?.roles?.map(({ customRoleSlug, role, ...dto }) => ({
        slug: customRoleSlug || role,
        temporaryAccess: dto.isTemporary
          ? {
              isTemporary: true,
              temporaryRange: dto.temporaryRange,
              temporaryAccessEndTime: dto.temporaryAccessEndTime,
              temporaryAccessStartTime: dto.temporaryAccessStartTime
            }
          : { isTemporary: false }
      }))
    }
  });
  const selectedRoleList = useFieldArray({ name: "roles", control: roleForm.control });

  const updateProjectIdentityMembership = useUpdateProjectIdentityMembership();
  const isEditDisabled = isIdentityEditDisabled || !canModifyIdentityRoles;

  const handleRoleUpdate = async (data: TRoleForm) => {
    if (updateProjectIdentityMembership.isPending) return;

    const hasCustomRole = data.roles.some((role) => isCustomProjectRole(role.slug));
    if (hasCustomRole && subscription && !subscription?.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    const roles = data.roles.map(({ slug, temporaryAccess }) =>
      temporaryAccess.isTemporary
        ? {
            role: slug,
            isTemporary: true as const,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: temporaryAccess.temporaryRange,
            temporaryAccessStartTime: temporaryAccess.temporaryAccessStartTime
          }
        : { role: slug, isTemporary: false as const }
    );

    await updateProjectIdentityMembership.mutateAsync({
      projectId,
      projectType: currentProject?.type,
      identityId: identityProjectMembership.identity.id,
      roles
    });
    createNotification({ text: "Successfully updated roles", type: "success" });
  };

  if (isRolesLoading) {
    return (
      <div className="h-40">
        <PageLoader lottieClassName="w-16" />
      </div>
    );
  }

  return (
    <form
      onSubmit={roleForm.handleSubmit(handleRoleUpdate)}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-3 overflow-y-auto p-4">
        {selectedRoleList.fields.map(({ id }, index) => (
          <IdentityRoleAssignmentRow
            key={id}
            control={roleForm.control}
            setValue={roleForm.setValue}
            index={index}
            showLabels={index === 0}
            isEditDisabled={isEditDisabled}
            assignableRoleSlugs={assignableRoleSlugs}
            getRolesForSelect={getRolesForSelect}
            canRemove={selectedRoleList.fields.length > 1}
            onRemove={() => selectedRoleList.remove(index)}
          />
        ))}
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Identity}>
          {(isAllowed) => (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              isDisabled={!isAllowed || isEditDisabled || filteredRoles.length === 0}
              onClick={() => {
                if (filteredRoles.length === 0) return;
                selectedRoleList.append({
                  slug: filteredRoles[0].slug,
                  temporaryAccess: { isTemporary: false }
                });
              }}
            >
              <PlusIcon />
              Add Role
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <SheetFooter className="border-t">
        <Button
          type="submit"
          variant="project"
          isDisabled={!roleForm.formState.isDirty || isEditDisabled}
          isPending={roleForm.formState.isSubmitting}
        >
          Save Roles
        </Button>
        <Button
          type="button"
          variant="outline"
          isDisabled={roleForm.formState.isSubmitting}
          onClick={onClose}
        >
          Cancel
        </Button>
      </SheetFooter>
      <UpgradePlanModal
        isOpen={upgradePlanPopUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handleUpgradePlanPopUpToggle("upgradePlan", isOpen)}
        text="Assigning custom roles to machine identities can be unlocked if you upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </form>
  );
};
