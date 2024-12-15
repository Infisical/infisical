import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  useCreatePkiCollection,
  useGetPkiCollectionById,
  useUpdatePkiCollection
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["pkiCollection"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["pkiCollection"]>, state?: boolean) => void;
};

export const PkiCollectionModal = ({ popUp, handlePopUpToggle }: Props) => {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data: pkiCollection } = useGetPkiCollectionById(
    (popUp?.pkiCollection?.data as { collectionId: string })?.collectionId || ""
  );

  const { mutateAsync: createPkiCollection } = useCreatePkiCollection();
  const { mutateAsync: updatePkiCollection } = useUpdatePkiCollection();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (pkiCollection) {
      reset({
        name: pkiCollection.name,
        description: pkiCollection.description
      });
    } else {
      reset({
        name: "",
        description: ""
      });
    }
  }, [pkiCollection]);

  const onFormSubmit = async ({ name, description }: FormData) => {
    try {
      if (!projectId) return;

      if (pkiCollection) {
        // update
        await updatePkiCollection({
          collectionId: pkiCollection.id,
          name,
          description,
          projectId
        });
      } else {
        // create
        const { id: createdId } = await createPkiCollection({
          name,
          description,
          projectId
        });

        router.push(`/${ProjectType.CertificateManager}/${projectId}/pki-collections/${createdId}`);
      }

      handlePopUpToggle("pkiCollection", false);

      reset();

      createNotification({
        text: `Successfully ${pkiCollection ? "updated" : "created"} PKI collection`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${pkiCollection ? "updated" : "created"} PKI collection`,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.pkiCollection?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("pkiCollection", isOpen);
        reset();
      }}
    >
      <ModalContent title={`${pkiCollection ? "Edit" : "Create"} Certificate Collection`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="My Certificate Collection" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Description" isError={Boolean(error)} errorText={error?.message}>
                <Input
                  {...field}
                  placeholder="A collection to house certificates for ACME device"
                />
              </FormControl>
            )}
          />
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              {pkiCollection ? "Update" : "Create"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("pkiCollection", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
