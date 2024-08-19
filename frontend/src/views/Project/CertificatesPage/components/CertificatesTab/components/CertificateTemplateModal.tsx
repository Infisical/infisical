import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  CaStatus,
  useCreateCertTemplate,
  useGetCertTemplate,
  useListWorkspaceCas,
  useListWorkspacePkiCollections,
  useUpdateCertTemplate
} from "@app/hooks/api";
import { caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

const validateTemplateRegexField = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9 *@\-\\.\\]+$/, {
    message:
      "Invalid pattern: only alphanumeric characters, spaces, *, ., @, -, and \\ are allowed."
  });

const schema = z.object({
  caId: z.string(),
  collectionId: z.string().optional(),
  name: z.string().min(1),
  commonName: validateTemplateRegexField,
  subjectAlternativeName: validateTemplateRegexField,
  ttl: z.string().trim().min(1)
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["certificateTemplate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["certificateTemplate"]>,
    state?: boolean
  ) => void;
};

export const CertificateTemplateModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data: certTemplate } = useGetCertTemplate(
    (popUp?.certificateTemplate?.data as { id: string })?.id || ""
  );

  const { data: cas } = useListWorkspaceCas({
    projectSlug: currentWorkspace?.slug ?? "",
    status: CaStatus.ACTIVE
  });

  const { data: collectionsData } = useListWorkspacePkiCollections({
    workspaceId: currentWorkspace?.id || ""
  });

  const { mutateAsync: createCertTemplate } = useCreateCertTemplate();
  const { mutateAsync: updateCertTemplate } = useUpdateCertTemplate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (certTemplate) {
      reset({
        caId: certTemplate.caId,
        name: certTemplate.name,
        commonName: certTemplate.commonName,
        subjectAlternativeName: certTemplate.subjectAlternativeName,
        collectionId: certTemplate.pkiCollectionId ?? undefined,
        ttl: certTemplate.ttl
      });
    } else {
      reset({
        caId: "",
        name: "",
        commonName: "",
        ttl: ""
      });
    }
  }, [certTemplate]);

  const onFormSubmit = async ({
    caId,
    collectionId,
    name,
    commonName,
    subjectAlternativeName,
    ttl
  }: FormData) => {
    if (!currentWorkspace?.id) {
      return;
    }

    try {
      if (certTemplate) {
        await updateCertTemplate({
          id: certTemplate.id,
          projectId: currentWorkspace.id,
          pkiCollectionId: collectionId,
          caId,
          name,
          commonName,
          subjectAlternativeName,
          ttl
        });

        createNotification({
          text: "Successfully updated certificate template",
          type: "success"
        });
      } else {
        await createCertTemplate({
          projectId: currentWorkspace.id,
          pkiCollectionId: collectionId,
          caId,
          name,
          commonName,
          subjectAlternativeName,
          ttl
        });

        createNotification({
          text: "Successfully created certificate template",
          type: "success"
        });
      }

      reset();
      handlePopUpToggle("certificateTemplate", false);
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to save changes",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.certificateTemplate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateTemplate", isOpen);
        reset();
      }}
    >
      <ModalContent title={certTemplate ? "Certificate Template" : "Create Certificate Template"}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Template Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="My Certificate Template" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="caId"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Issuing CA"
                errorText={error?.message}
                isError={Boolean(error)}
                className="mt-4"
                isRequired
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {(cas || []).map(({ id, type, dn }) => (
                    <SelectItem value={id} key={`ca-${id}`}>
                      {`${caTypeToNameMap[type]}: ${dn}`}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="collectionId"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Certificate Collection (Optional)"
                errorText={error?.message}
                isError={Boolean(error)}
                className="mt-4"
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {(collectionsData?.collections || []).map(({ id, name }) => (
                    <SelectItem value={id} key={`pki-collection-${id}`}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="commonName"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label={
                  <div>
                    <FormLabel
                      isRequired
                      label="Common Name (CN)"
                      icon={
                        <Tooltip
                          className="text-center"
                          content={
                            <span>
                              This field accepts limited regular expressions: spaces, *, ., @, -, \
                              (for escaping), and alphanumeric characters only
                            </span>
                          }
                        >
                          <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                        </Tooltip>
                      }
                    />
                  </div>
                }
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder=".*\.acme.com" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="subjectAlternativeName"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label={
                  <div>
                    <FormLabel
                      isRequired
                      label="Alternative Names (SAN)"
                      icon={
                        <Tooltip
                          className="text-center"
                          content={
                            <span>
                              This field accepts limited regular expressions: spaces, *, ., @, -, \
                              (for escaping), and alphanumeric characters only
                            </span>
                          }
                        >
                          <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                        </Tooltip>
                      }
                    />
                  </div>
                }
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="service\.acme.\..*" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="ttl"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Max TTL"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
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
              Save
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("certificateTemplate", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
