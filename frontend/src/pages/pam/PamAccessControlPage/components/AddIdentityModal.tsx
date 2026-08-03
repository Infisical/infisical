import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  FilterableSelect,
  Input,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useGetIdentityMembershipOrgs } from "@app/hooks/api";
import { UNIVERSAL_AUTH_DEFAULTS, useAddIdentityUniversalAuth } from "@app/hooks/api/identities";
import { IdentityMembershipOrg } from "@app/hooks/api/identities/types";
import {
  pamKeys,
  useAddPamProductIdentityMember,
  useListPamProductIdentities
} from "@app/hooks/api/pam";
import { useCreateProjectIdentity } from "@app/hooks/api/projectIdentity";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleOptionList } from "./ProductRoleOptionList";

enum AddIdentityMode {
  Create = "create",
  Assign = "assign"
}

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AddIdentityModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { mutate: addIdentity, isPending: isAssigning } = useAddPamProductIdentityMember();
  const { mutate: createProjectIdentity, isPending: isCreating } = useCreateProjectIdentity();
  const { mutate: addUniversalAuth, isPending: isAttachingAuth } = useAddIdentityUniversalAuth();

  const [mode, setMode] = useState<AddIdentityMode>(AddIdentityMode.Create);
  const [name, setName] = useState("");
  const [selectedIdentity, setSelectedIdentity] = useState<IdentityMembershipOrg | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>(ProjectMembershipRole.Member);

  const isSubmitting = isAssigning || isCreating || isAttachingAuth;

  const { data: orgIdentitiesData } = useGetIdentityMembershipOrgs({
    organizationId: currentOrg.id,
    limit: 1000
  });
  const { data: productIdentities } = useListPamProductIdentities();

  const availableIdentities = useMemo(() => {
    const assignedIds = new Set((productIdentities ?? []).map((m) => m.identityId).filter(Boolean));
    return (orgIdentitiesData?.identityMemberships || []).filter(
      (m) => !assignedIds.has(m.identity.id)
    );
  }, [orgIdentitiesData, productIdentities]);

  const handleClose = () => {
    setMode(AddIdentityMode.Create);
    setName("");
    setSelectedIdentity(null);
    setSelectedRole(ProjectMembershipRole.Member);
    onOpenChange(false);
  };

  // Once creation succeeds the identity and its PAM membership already exist, so land on the
  // identity page whether or not auth attached, rather than leaving the user to re-create.
  const finishCreate = (identityId: string, authAttached: boolean) => {
    // The generic create mutation doesn't know about PAM's member list
    queryClient.invalidateQueries({ queryKey: pamKeys.productIdentities() });

    createNotification(
      authAttached
        ? { text: "Machine identity created", type: "success" }
        : {
            text: "Machine identity created, but attaching Universal Auth failed. Add an auth method from the identity page.",
            type: "error"
          }
    );
    handleClose();
    navigate({
      to: "/organizations/$orgId/pam/identities/$identityId",
      params: { orgId: currentOrg.id, identityId }
    });
  };

  const handleCreate = () => {
    createProjectIdentity(
      {
        name: name.trim(),
        projectId: currentProject.id,
        hasDeleteProtection: true,
        roles: [{ role: selectedRole }]
      },
      {
        onSuccess: (created) => {
          addUniversalAuth(
            { projectId: currentProject.id, identityId: created.id, ...UNIVERSAL_AUTH_DEFAULTS },
            {
              onSuccess: () => finishCreate(created.id, true),
              onError: () => finishCreate(created.id, false)
            }
          );
        }
      }
    );
  };

  const handleAssign = () => {
    if (!selectedIdentity) return;

    addIdentity(
      {
        identityId: selectedIdentity.identity.id,
        role: selectedRole,
        projectId: currentProject.id
      },
      {
        onSuccess: () => {
          createNotification({ text: "Identity added", type: "success" });
          handleClose();
        }
      }
    );
  };

  const handleSubmit = () => {
    if (mode === AddIdentityMode.Create) {
      handleCreate();
    } else {
      handleAssign();
    }
  };

  const isSubmitDisabled = mode === AddIdentityMode.Create ? !name.trim() : !selectedIdentity;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-visible sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Machine Identity</DialogTitle>
          <DialogDescription>
            Create a new machine identity or assign an existing organization identity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Tabs
              className="w-full"
              value={mode}
              onValueChange={(next) => {
                setMode(next as AddIdentityMode);
                if (next === AddIdentityMode.Create) {
                  setSelectedIdentity(null);
                } else {
                  setName("");
                }
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value={AddIdentityMode.Create}>Create New</TabsTrigger>
                <TabsTrigger value={AddIdentityMode.Assign}>Assign Existing</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-sm text-muted">
              {mode === AddIdentityMode.Create
                ? "Create a dedicated machine identity managed at the PAM level."
                : "Reuse an existing machine identity from your organization."}
            </p>
          </div>

          {mode === AddIdentityMode.Create ? (
            <Field>
              <FieldLabel>
                Name <span className="text-product-pam">*</span>
              </FieldLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="Machine 1"
              />
            </Field>
          ) : (
            <Field>
              <FieldLabel>
                Identity <span className="text-product-pam">*</span>
              </FieldLabel>
              <FilterableSelect
                value={selectedIdentity}
                onChange={(val) => setSelectedIdentity(val as IdentityMembershipOrg | null)}
                getOptionValue={(option) => option.identity.id}
                getOptionLabel={(option) => option.identity.name}
                options={availableIdentities}
                placeholder="Select identity..."
              />
            </Field>
          )}

          <Field>
            <FieldLabel>
              Product role <span className="text-product-pam">*</span>
            </FieldLabel>
            <ProductRoleOptionList value={selectedRole} onChange={setSelectedRole} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="pam"
            isDisabled={isSubmitDisabled || isSubmitting}
            isPending={isSubmitting}
            onClick={handleSubmit}
          >
            {mode === AddIdentityMode.Create ? "Create Identity" : "Add Identity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
