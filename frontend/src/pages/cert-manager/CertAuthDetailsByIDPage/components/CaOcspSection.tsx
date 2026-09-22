import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button as ButtonV2,
  FormControl,
  Modal,
  ModalClose,
  ModalContent,
  Switch
} from "@app/components/v2";
import {
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
  IconButton
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
      createNotification({
        text: "Failed to update OCSP",
        type: "error"
      });
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

      <Modal
        isOpen={popUp.editOcsp.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("editOcsp", isOpen);
          if (!isOpen) reset();
        }}
      >
        <ModalContent title="Edit OCSP">
          <form onSubmit={handleSubmit(onEditSubmit)}>
            <Controller
              control={control}
              name="isOcspEnabled"
              render={({ field: { value, onChange } }) => (
                <FormControl helperText="Only certificates issued after OCSP is enabled carry the responder URL.">
                  <Switch
                    id="isOcspEnabled"
                    className="bg-muted/80 shadow-inner data-[state=checked]:bg-success/80"
                    thumbClassName="bg-surface-raised"
                    isChecked={value}
                    onCheckedChange={onChange}
                  >
                    Enable OCSP
                  </Switch>
                </FormControl>
              )}
            />
            <div className="flex w-full justify-between gap-4 pt-4">
              <ModalClose asChild>
                <ButtonV2 colorSchema="secondary" variant="plain">
                  Cancel
                </ButtonV2>
              </ModalClose>
              <ButtonV2
                type="submit"
                colorSchema="secondary"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                Save
              </ButtonV2>
            </div>
          </form>
        </ModalContent>
      </Modal>

      <UpgradePlanModal
        paywallKey="cert-manager.ca-ocsp"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="OCSP is available on Infisical's Enterprise plan."
      />
    </>
  );
};
