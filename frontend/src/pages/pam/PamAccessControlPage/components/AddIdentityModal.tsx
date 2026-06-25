import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

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
  FilterableSelect
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useGetIdentityMembershipOrgs } from "@app/hooks/api";
import {
  useAddPamProductIdentityMember,
  useListPamProductIdentities
} from "@app/hooks/api/pam";
import { IdentityMembershipOrg } from "@app/hooks/api/identities/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ProductRoleOptionList } from "./ProductRoleOptionList";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const AddIdentityModal = ({ isOpen, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { mutate: addIdentity, isPending } = useAddPamProductIdentityMember();

  const [selectedIdentity, setSelectedIdentity] = useState<IdentityMembershipOrg | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>(ProjectMembershipRole.Member);

  const { data: orgIdentitiesData } = useGetIdentityMembershipOrgs({
    organizationId: currentOrg.id,
    limit: 1000
  });
  const { data: pamIdentities } = useListPamProductIdentities();

  const availableIdentities = useMemo(() => {
    const assignedIds = new Set(
      (pamIdentities || []).map((m) => m.identityId).filter(Boolean) as string[]
    );
    return (orgIdentitiesData?.identityMemberships || []).filter(
      (m) => !assignedIds.has(m.identity.id)
    );
  }, [orgIdentitiesData, pamIdentities]);

  const handleClose = () => {
    setSelectedIdentity(null);
    setSelectedRole(ProjectMembershipRole.Member);
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!selectedIdentity) return;

    addIdentity(
      {
        identityId: selectedIdentity.identity.id,
        role: selectedRole
      },
      {
        onSuccess: () => {
          createNotification({ text: "Identity added", type: "success" });
          handleClose();
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-visible sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Identity</DialogTitle>
          <DialogDescription>Add an existing organization identity.</DialogDescription>
        </DialogHeader>

        {availableIdentities.length ? (
          <div className="flex flex-col gap-5">
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

            <Field>
              <FieldLabel>
                Product role <span className="text-product-pam">*</span>
              </FieldLabel>
              <ProductRoleOptionList value={selectedRole} onChange={setSelectedRole} />
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              All organization identities have already been added. Create a new identity at the
              organization level first.
            </p>
            <Button
              variant="pam"
              className="self-end"
              onClick={() => {
                handleClose();
                navigate({
                  to: "/organizations/$orgId/access-management" as never,
                  params: { orgId: currentOrg.id } as never,
                  search: { selectedTab: "identities" } as never
                });
              }}
            >
              <ExternalLink />
              Go to organization identities
            </Button>
          </div>
        )}

        {availableIdentities.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="pam"
              isDisabled={!selectedIdentity}
              isPending={isPending}
              onClick={handleSubmit}
            >
              Add Identity
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
