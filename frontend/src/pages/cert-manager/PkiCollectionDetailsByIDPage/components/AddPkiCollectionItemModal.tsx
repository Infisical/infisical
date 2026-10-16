import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useProject } from "@app/context";
import { CaStatus, useAddItemToPkiCollection, useListWorkspaceCas } from "@app/hooks/api";
import { PkiItemType, pkiItemTypeToNameMap } from "@app/hooks/api/pkiCollections/constants";
import { useListWorkspaceCertificates } from "@app/hooks/api/projects";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    // type: z.nativeEnum(PkiItemType),
    itemId: z.string().min(1, "Select an item to add")
  })
  .required();

type FormData = z.infer<typeof schema>;

type Props = {
  collectionId: string;
  type: PkiItemType;
  popUp: UsePopUpState<["addPkiCollectionItem"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["addPkiCollectionItem"]>,
    state?: boolean
  ) => void;
};

// note: this component should be optimized so it is easier
// to find certificates and CAs
export const AddPkiCollectionItemModal = ({
  collectionId,
  type,
  popUp,
  handlePopUpToggle
}: Props) => {
  const { currentProject } = useProject();
  const itemInputId = useId();

  const { data: cas } = useListWorkspaceCas({
    projectId: currentProject?.id || "",
    status: CaStatus.ACTIVE
  });

  const { data } = useListWorkspaceCertificates({
    projectId: currentProject?.id || "",
    offset: 0,
    limit: 25
  });

  const { mutateAsync: addItemToPkiCollection } = useAddItemToPkiCollection();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
    // defaultValues: {
    //   type: PkiItemType.CA
    // }
  });

  const onFormSubmit = async ({ itemId }: FormData) => {
    try {
      const item = await addItemToPkiCollection({
        collectionId,
        type,
        itemId
      });

      createNotification({
        text: `Successfully added ${
          pkiItemTypeToNameMap[item.type as PkiItemType]
        } to PKI collection`,
        type: "success"
      });

      reset();
      handlePopUpToggle("addPkiCollectionItem", false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Dialog
      open={popUp?.addPkiCollectionItem?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addPkiCollectionItem", isOpen);
        reset();
      }}
    >
      <DialogContent isPending={isSubmitting}>
        <DialogHeader>
          <DialogTitle>{`Add ${pkiItemTypeToNameMap[type]} to Collection`}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit(onFormSubmit)}>
          {type === PkiItemType.CA && (
            <Controller
              control={control}
              name="itemId"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={itemInputId}>{pkiItemTypeToNameMap[type]}</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} name={field.name}>
                    <SelectTrigger
                      id={itemInputId}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      className="w-full"
                      isError={Boolean(error)}
                    >
                      <SelectValue placeholder="Select a certificate authority" />
                    </SelectTrigger>
                    <SelectContent>
                      {(cas || []).map(({ id, dn }) => (
                        <SelectItem value={id} key={`pki-item-cert-${id}`}>
                          {dn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          )}
          {type === PkiItemType.CERTIFICATE && (
            <Controller
              control={control}
              name="itemId"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={itemInputId}>Certificate</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} name={field.name}>
                    <SelectTrigger
                      id={itemInputId}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      className="w-full"
                      isError={Boolean(error)}
                    >
                      <SelectValue placeholder="Select a certificate" />
                    </SelectTrigger>
                    <SelectContent>
                      {(data?.certificates || []).map(({ id, commonName }) => (
                        <SelectItem value={id} key={`pki-item-cert-${id}`}>
                          {`CN=${commonName}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="project" size="sm" type="submit" isPending={isSubmitting}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
