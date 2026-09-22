import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
  IconButton,
  Toggle
} from "@app/components/v3";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useSubscription
} from "@app/context";
import { CaType, useGetCa, useUpdateCa } from "@app/hooks/api";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { usePopUp } from "@app/hooks/usePopUp";

type Props = {
  caId: string;
};

const editSchema = z.object({
  isOcspEnabled: z.boolean().default(false)
});

type EditFormData = z.infer<typeof editSchema>;

export const CaOcspSection = ({ caId }: Props) => {
  const { popUp, handlePopUpToggle } = usePopUp(["editOcsp", "upgradePlan"] as const);
  const { subscription } = useSubscription();

  const { data } = useGetCa({ caId, type: CaType.INTERNAL });
  const ca = data as TInternalCertificateAuthority | undefined;

  const { mutateAsync: updateCa } = useUpdateCa();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    values: {
      isOcspEnabled: ca?.configuration.isOcspEnabled ?? false
    }
  });

  if (!ca) return null;

  const isOcspEnabled = ca.configuration.isOcspEnabled ?? false;
  const ocspResponderUrl = `${window.origin}/api/v1/cert-manager/ocsp/${ca.id}`;

  const handleEdit = () => {
    if (!isOcspEnabled && !subscription.pkiOcsp) {
      handlePopUpToggle("upgradePlan", true);
      return;
    }
    handlePopUpToggle("editOcsp", true);
  };

  const onEditSubmit = async (values: EditFormData) => {
    try {
      await updateCa({
        id: ca.id,
        type: CaType.INTERNAL,
        configuration: {
          isOcspEnabled: values.isOcspEnabled
        } as TInternalCertificateAuthority["configuration"]
      });
      createNotification({
        text: values.isOcspEnabled ? "OCSP enabled" : "OCSP disabled",
        type: "success"
      });
      handlePopUpToggle("editOcsp", false);
    } catch {
      // MutationCache.onError already surfaces the server message, so the dialog only stays open
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>OCSP</CardTitle>
          <CardDescription>Answer revocation status checks for issued certificates</CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionCertificateAuthorityActions.Edit}
              a={subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })}
            >
              {(isAllowed) => (
                <IconButton
                  aria-label="Edit OCSP"
                  variant="outline"
                  size="xs"
                  isDisabled={!isAllowed}
                  onClick={handleEdit}
                >
                  <PencilIcon />
                </IconButton>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>{isOcspEnabled ? "Enabled" : "Disabled"}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Responder URL</DetailLabel>
              <DetailValue>
                {isOcspEnabled ? (
                  <span className="break-all">{ocspResponderUrl}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
          </DetailGroup>
        </CardContent>
      </Card>

      <Dialog
        open={popUp.editOcsp.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("editOcsp", isOpen);
          if (!isOpen) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit OCSP</DialogTitle>
            <DialogDescription>
              Only certificates issued after OCSP is enabled carry the responder URL.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onEditSubmit)} className="flex flex-col gap-4">
            <Controller
              control={control}
              name="isOcspEnabled"
              render={({ field: { value, onChange } }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>Enable OCSP</FieldTitle>
                    <FieldDescription>
                      Answer revocation status checks for certificates issued by this CA.
                    </FieldDescription>
                  </FieldContent>
                  <Toggle
                    id="isOcspEnabled"
                    variant="success"
                    checked={value}
                    onCheckedChange={onChange}
                  />
                </Field>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <UpgradePlanModal
        paywallKey="cert-manager.ca-ocsp"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="OCSP is available on Infisical's Enterprise plan."
      />
    </>
  );
};
