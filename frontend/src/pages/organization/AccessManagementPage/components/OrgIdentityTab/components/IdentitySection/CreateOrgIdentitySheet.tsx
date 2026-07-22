import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { findOrgMembershipRole, isCustomOrgRole } from "@app/helpers/roles";
import { useCreateOrgIdentity, useGetOrgRoles } from "@app/hooks/api";
import { useAddIdentityUniversalAuth } from "@app/hooks/api/identities";
import { usePopUp } from "@app/hooks/usePopUp";

import { OrgIdentityLinkForm } from "./OrgIdentityLinkForm";

enum IdentityWizardSteps {
  CreateIdentity = "create-identity",
  LinkIdentity = "link-identity"
}

const schema = z.object({
  name: z.string().min(1, "Required"),
  role: z.object({ slug: z.string(), name: z.string() })
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const CreateOrgIdentityForm = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);

  const { data: roles } = useGetOrgRoles(orgId);

  const { mutateAsync: createMutateAsync } = useCreateOrgIdentity();
  const { mutateAsync: addMutateAsync } = useAddIdentityUniversalAuth();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" }
  });

  useEffect(() => {
    if (!roles?.length) return;
    reset({
      name: "",
      role: findOrgMembershipRole(roles, currentOrg!.defaultMembershipRole)
    });
  }, [roles]);

  const onFormSubmit = async ({ name, role }: FormData) => {
    if (role?.slug && isCustomOrgRole(role.slug) && subscription && !subscription?.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    const { id: createdId } = await createMutateAsync({
      name,
      role: role.slug || undefined,
      hasDeleteProtection: true,
      organizationId: orgId
    });

    await addMutateAsync({
      organizationId: orgId,
      identityId: createdId,
      clientSecretTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
      accessTokenTTL: 2592000,
      accessTokenMaxTTL: 2592000,
      accessTokenNumUsesLimit: 0,
      accessTokenPeriod: 0,
      lockoutEnabled: true,
      lockoutThreshold: 3,
      lockoutDurationSeconds: 300,
      lockoutCounterResetSeconds: 30
    });

    createNotification({
      text: "Successfully created machine identity",
      type: "success"
    });

    reset();
    onClose();
    navigate({
      to: "/organizations/$orgId/identities/$identityId",
      params: { identityId: createdId, orgId }
    });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-1 flex-col overflow-hidden">
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Controller
          control={control}
          defaultValue=""
          name="name"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldContent>
                <Input {...field} autoFocus placeholder="Machine 1" isError={Boolean(error)} />
              </FieldContent>
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="role"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Role</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  placeholder="Select role..."
                  options={roles}
                  onChange={onChange}
                  value={value}
                  getOptionValue={(option) => option.slug}
                  getOptionLabel={(option) => option.name}
                  components={{ Option: RoleOption }}
                  isError={Boolean(error)}
                />
              </FieldContent>
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
      </div>
      <SheetFooter className="border-t">
        <Button type="submit" variant="org" isPending={isSubmitting} isDisabled={isSubmitting}>
          Create
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
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

export const CreateOrgIdentitySheet = ({ isOpen, onOpenChange }: Props) => {
  const { isSubOrganization } = useOrganization();
  const [wizardStep, setWizardStep] = useState(IdentityWizardSteps.CreateIdentity);

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) setWizardStep(IdentityWizardSteps.CreateIdentity);
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>
            {isSubOrganization
              ? "Add Machine Identity to Sub-Organization"
              : "Create Organization Machine Identity"}
          </SheetTitle>
          <SheetDescription>
            {isSubOrganization
              ? "Create a new machine identity or assign an existing one"
              : "Create a new machine identity in the organization"}
          </SheetDescription>
        </SheetHeader>
        {isSubOrganization && (
          <div className="flex shrink-0 items-center justify-center gap-2 border-b p-4">
            <Tabs
              value={wizardStep}
              onValueChange={(value) => setWizardStep(value as IdentityWizardSteps)}
            >
              <TabsList className="w-fit">
                <TabsTrigger value={IdentityWizardSteps.CreateIdentity}>Create New</TabsTrigger>
                <TabsTrigger value={IdentityWizardSteps.LinkIdentity}>Assign Existing</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon size={16} className="text-mineshaft-400" />
              </TooltipTrigger>
              <TooltipContent side="left" align="start" className="max-w-sm">
                <p className="mb-2 text-mineshaft-300">
                  You can add machine identities to your sub-organization in one of two ways:
                </p>
                <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                  <li className="text-mineshaft-200">
                    <strong className="font-medium text-mineshaft-100">Create New</strong> - Create
                    a new machine identity specifically for this sub-organization. This machine
                    identity will be managed at the sub-organization level.
                    <p className="mt-2">
                      This method is recommended for autonomous teams that need to manage machine
                      identity authentication.
                    </p>
                  </li>
                  <li>
                    <strong className="font-medium text-mineshaft-100">Assign Existing</strong>{" "}
                    Assign an existing machine identity from your parent organization. The machine
                    identity will continue to be managed at its original scope.
                    <p className="mt-2">
                      This method is recommended for organizations that need to maintain centralized
                      control.
                    </p>
                  </li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        {wizardStep === IdentityWizardSteps.CreateIdentity && (
          <CreateOrgIdentityForm onClose={() => handleOpenChange(false)} />
        )}
        {wizardStep === IdentityWizardSteps.LinkIdentity && (
          <OrgIdentityLinkForm onClose={() => handleOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
};
