import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import ms from "ms";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalContent
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateSshHost, useGetSshHostById, useUpdateSshHost } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["sshHost"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["sshHost"]>, state?: boolean) => void;
};

const schema = z
  .object({
    hostname: z.string(),
    userCertTtl: z
      .string()
      .trim()
      .refine(
        (val) => ms(val) > 0,
        "TTL must be a valid time string such as 2 days, 1d, 2h 1y, ..."
      )
      .default("8h"),
    loginMappings: z
      .object({
        loginUser: z.string().trim().min(1),
        allowedPrincipals: z.string().trim().min(1)
      })
      .array()
      .default([])
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const SshHostModal = ({ popUp, handlePopUpToggle }: Props) => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { data: sshHost } = useGetSshHostById(
    (popUp?.sshHost?.data as { sshHostId: string })?.sshHostId || ""
  );

  const { mutateAsync: createMutateAsync } = useCreateSshHost();
  const { mutateAsync: updateMutateAsync } = useUpdateSshHost();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      hostname: "",
      userCertTtl: "8h",
      loginMappings: []
    }
  });

  const loginMappingsFormFields = useFieldArray({
    control,
    name: "loginMappings"
  });

  useEffect(() => {
    if (sshHost) {
      reset({
        hostname: sshHost.hostname,
        userCertTtl: sshHost.userCertTtl,
        loginMappings: sshHost.loginMappings.map(({ loginUser, allowedPrincipals }) => ({
          loginUser,
          allowedPrincipals: allowedPrincipals.join(",")
        }))
      });
    } else {
      reset({
        hostname: "",
        userCertTtl: "8h",
        loginMappings: []
      });
    }
  }, [sshHost]);

  const onFormSubmit = async ({ hostname, userCertTtl, loginMappings }: FormData) => {
    try {
      if (!projectId) return;

      if (sshHost) {
        await updateMutateAsync({
          sshHostId: sshHost.id,
          hostname,
          userCertTtl,
          loginMappings: loginMappings.map(({ loginUser, allowedPrincipals }) => ({
            loginUser,
            allowedPrincipals: allowedPrincipals.split(",")
          }))
        });
      } else {
        await createMutateAsync({
          projectId,
          hostname,
          userCertTtl,
          loginMappings: loginMappings.map(({ loginUser, allowedPrincipals }) => ({
            loginUser,
            allowedPrincipals: allowedPrincipals.split(",")
          }))
        });

        // navigate({
        //   to: `/${ProjectType.SSH}/$projectId/ca/$caId` as const,
        //   params: {
        //     projectId,
        //     caId: newCaId
        //   }
        // });
      }

      reset();
      handlePopUpToggle("sshHost", false);

      createNotification({
        text: `Successfully ${sshHost ? "updated" : "added"} SSH host`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to add SSH host",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.sshHost?.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("sshHost", isOpen);
      }}
    >
      <ModalContent title={`${sshHost ? "View" : "Add"} SSH host`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {sshHost && (
            <FormControl label="SSH Host ID">
              <Input value={sshHost.id} isDisabled className="bg-white/[0.07]" />
            </FormControl>
          )}
          <Controller
            control={control}
            defaultValue=""
            name="hostname"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Hostname"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="host.example.com" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="userCertTtl"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="User Certificate TTL"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="host.example.com" />
              </FormControl>
            )}
          />
          <div>
            <FormLabel label="Login Mappings" />
          </div>
          <div className="mb-3 flex flex-col space-y-2">
            {loginMappingsFormFields.fields.map(({ id: metadataFieldId }, i) => (
              <div key={metadataFieldId} className="flex items-end space-x-2">
                <div className="flex-grow">
                  {i === 0 && <span className="text-xs text-mineshaft-400">Login User</span>}
                  <Controller
                    control={control}
                    name={`loginMappings.${i}.loginUser`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0"
                      >
                        <Input {...field} placeholder="ec2-user" />
                      </FormControl>
                    )}
                  />
                </div>
                <div className="flex-grow">
                  {i === 0 && (
                    <FormLabel label="Allowed Principals" className="text-xs text-mineshaft-400" />
                  )}
                  <Controller
                    control={control}
                    name={`loginMappings.${i}.allowedPrincipals`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0"
                      >
                        <Input {...field} placeholder="alice@example.com, bob@example.com" />
                      </FormControl>
                    )}
                  />
                </div>
                <IconButton
                  ariaLabel="delete key"
                  className="bottom-0.5 h-9"
                  variant="outline_bg"
                  onClick={() => loginMappingsFormFields.remove(i)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              size="xs"
              variant="outline_bg"
              onClick={() =>
                loginMappingsFormFields.append({ loginUser: "", allowedPrincipals: "" })
              }
            >
              Add Login Mapping
            </Button>
          </div>
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              {popUp?.sshHost?.data ? "Update" : "Add"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("sshHost", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
