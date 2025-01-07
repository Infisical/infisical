import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  CaStatus,
  useAddItemToPkiCollection,
  useListWorkspaceCas,
  useListWorkspaceCertificates
} from "@app/hooks/api";
import { PkiItemType, pkiItemTypeToNameMap } from "@app/hooks/api/pkiCollections/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    // type: z.nativeEnum(PkiItemType),
    itemId: z.string()
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
  const { currentWorkspace } = useWorkspace();

  const { data: cas } = useListWorkspaceCas({
    projectSlug: currentWorkspace?.slug || "",
    status: CaStatus.ACTIVE
  });

  const { data } = useListWorkspaceCertificates({
    projectSlug: currentWorkspace?.slug || "",
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
    <Modal
      isOpen={popUp?.addPkiCollectionItem?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addPkiCollectionItem", isOpen);
        reset();
      }}
    >
      <ModalContent title={`Add ${pkiItemTypeToNameMap[type]} to Collection`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {/* <Controller
            control={control}
            name="type"
            defaultValue={PkiItemType.CA}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Item Type" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  <SelectItem value={PkiItemType.CA} key="pki-item-type-ca">
                    Certificate Authority
                  </SelectItem>
                  <SelectItem value={PkiItemType.CERTIFICATE} key="pki-item-type-ca">
                    Certificate
                  </SelectItem>
                </Select>
              </FormControl>
            )}
          /> */}
          {type === PkiItemType.CA && (
            <Controller
              control={control}
              name="itemId"
              defaultValue=""
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label={pkiItemTypeToNameMap[type]}
                  errorText={error?.message}
                  isError={Boolean(error)}
                  // className="mt-4"
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    {(cas || []).map(({ id, dn }) => (
                      <SelectItem value={id} key={`pki-item-cert-${id}`}>
                        {dn}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}
          {type === PkiItemType.CERTIFICATE && (
            <Controller
              control={control}
              name="itemId"
              defaultValue=""
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Certificate"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  // className="mt-4"
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    {(data?.certificates || []).map(({ id, commonName }) => (
                      <SelectItem value={id} key={`pki-item-cert-${id}`}>
                        {`CN=${commonName}`}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Add
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("addPkiCollectionItem", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
