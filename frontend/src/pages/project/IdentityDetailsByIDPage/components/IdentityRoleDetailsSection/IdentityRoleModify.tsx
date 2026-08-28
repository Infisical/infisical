import { useId, useState } from "react";
import {
  Control,
  Controller,
  useFieldArray,
  useForm,
  UseFormSetValue,
  useWatch
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDownIcon, ClockIcon, PlusIcon, TrashIcon } from "lucide-react";
import ms from "ms";

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
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { isCustomProjectRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useUpdateProjectIdentityMembership } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";

import {
  getIdentityRoleDurationDisplay,
  identityRoleFormAssignmentToPayload,
  identityRoleFormSchema,
  isValidTemporaryRange,
  TEMPORARY_RANGE_ERROR,
  TIdentityRoleForm,
  toIdentityRoleFormAssignment
} from "./identityRoleAssignment";
import { useIdentityRoleGrant } from "./useIdentityRoleGrant";

type RoleForSelect = { slug: string; name: string; id: string };

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
  control: Control<TIdentityRoleForm>;
  setValue: UseFormSetValue<TIdentityRoleForm>;
  index: number;
  showLabels: boolean;
  isEditDisabled: boolean;
  assignableRoleSlugs: Set<string>;
  getRolesForSelect: (currentSlug: string) => RoleForSelect[];
  canRemove?: boolean;
  onRemove?: () => void;
  showRemoveButton?: boolean;
};

export const IdentityRoleAssignmentRow = ({
  control,
  setValue,
  index,
  showLabels,
  isEditDisabled,
  assignableRoleSlugs,
  getRolesForSelect,
  canRemove = false,
  onRemove,
  showRemoveButton = true
}: RoleAssignmentRowProps) => {
  const selectId = useId();
  const durationId = useId();
  const temporaryAccess = useWatch({ control, name: `roles.${index}.temporaryAccess` });
  const isTemporary = Boolean(temporaryAccess?.isTemporary);
  const { variant, text, tooltip, isExpired } = getIdentityRoleDurationDisplay(temporaryAccess);

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
                  className="w-full"
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
      {showRemoveButton && (
        <IconButton
          type="button"
          size="md"
          variant="danger"
          aria-label="Remove role"
          isDisabled={isEditDisabled || !canRemove}
          onClick={onRemove}
        >
          <TrashIcon />
        </IconButton>
      )}
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
  const { filteredRoles, isRolesLoading, assignableRoleSlugs, getRolesForSelect, isEditDisabled } =
    useIdentityRoleGrant(identityProjectMembership);
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);

  const roleForm = useForm<TIdentityRoleForm>({
    resolver: zodResolver(identityRoleFormSchema),
    values: {
      roles: identityProjectMembership?.roles?.map(toIdentityRoleFormAssignment)
    }
  });
  const selectedRoleList = useFieldArray({ name: "roles", control: roleForm.control });

  const updateProjectIdentityMembership = useUpdateProjectIdentityMembership();
  const handleRoleUpdate = async (data: TIdentityRoleForm) => {
    if (updateProjectIdentityMembership.isPending) return;

    const hasCustomRole = data.roles.some((role) => isCustomProjectRole(role.slug));
    if (hasCustomRole && subscription && !subscription?.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    const roles = data.roles.map(identityRoleFormAssignmentToPayload);

    await updateProjectIdentityMembership.mutateAsync({
      projectId,
      projectType: currentProject?.type,
      identityId: identityProjectMembership.identity.id,
      roles
    });
    createNotification({ text: "Successfully updated roles", type: "success" });
    onClose();
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
