import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import {
  useGetDopplerEnvironments,
  useGetDopplerProjects
} from "@app/hooks/api/migration/queries";

const schema = z.object({
  dopplerProject: z.string().min(1, "Doppler project is required"),
  dopplerEnvironment: z.string().min(1, "Doppler environment is required")
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  configId: string;
  environment: string;
  secretPath: string;
  onImport: (dopplerProject: string, dopplerEnvironment: string) => void;
};

export const DopplerSecretImportModal = ({
  isOpen,
  onOpenChange,
  configId,
  environment,
  secretPath,
  onImport
}: Props) => {
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      dopplerProject: "",
      dopplerEnvironment: ""
    }
  });

  const selectedDopplerProject = watch("dopplerProject");

  const { data: dopplerProjects = [], isPending: isLoadingProjects } = useGetDopplerProjects(
    configId
  );
  const { data: dopplerEnvironments = [], isPending: isLoadingEnvironments } =
    useGetDopplerEnvironments(configId, selectedDopplerProject || undefined);

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const onFormSubmit = (data: FormData) => {
    onImport(data.dopplerProject, data.dopplerEnvironment);
    handleClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <ModalContent
        bodyClassName="overflow-visible"
        title="Import from Doppler"
        subTitle="Select a Doppler project and environment to import secrets into the current Infisical folder."
        className="max-w-2xl"
      >
        <div className="mb-4 rounded-md bg-primary/10 p-3 text-sm text-mineshaft-200">
          <div className="flex items-start gap-2">
            <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-primary" />
            <div>
              <div className="mb-2">
                <strong>Import secrets from Doppler</strong>
              </div>
              <div className="space-y-1.5 text-xs leading-relaxed">
                <p>
                  Secrets will be imported into environment{" "}
                  <code className="text-xs">{environment}</code> at path{" "}
                  <code className="text-xs">{secretPath}</code>.
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="dopplerProject"
            render={({ field }) => {
              const selectedItem = dopplerProjects.find((p) => p.slug === field.value);

              return (
                <FormControl
                  label="Doppler project"
                  className="mb-4"
                  isError={Boolean(errors.dopplerProject)}
                  errorText={errors.dopplerProject?.message}
                >
                  <FilterableSelect
                    value={selectedItem || null}
                    onChange={(newValue) => {
                      const singleValue = Array.isArray(newValue) ? newValue[0] : newValue;
                      if (singleValue && "slug" in singleValue) {
                        field.onChange(singleValue.slug);
                      } else {
                        field.onChange("");
                      }
                    }}
                    isLoading={isLoadingProjects}
                    options={dopplerProjects}
                    placeholder="Select Doppler project..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.slug}
                  />
                </FormControl>
              );
            }}
          />

          <Controller
            control={control}
            name="dopplerEnvironment"
            render={({ field }) => {
              const selectedItem = dopplerEnvironments.find((e) => e.slug === field.value);

              return (
                <FormControl
                  label="Doppler environment"
                  className="mb-4"
                  isError={Boolean(errors.dopplerEnvironment)}
                  errorText={errors.dopplerEnvironment?.message}
                >
                  <FilterableSelect
                    value={selectedItem || null}
                    onChange={(newValue) => {
                      const singleValue = Array.isArray(newValue) ? newValue[0] : newValue;
                      if (singleValue && "slug" in singleValue) {
                        field.onChange(singleValue.slug);
                      } else {
                        field.onChange("");
                      }
                    }}
                    isLoading={isLoadingEnvironments}
                    isDisabled={!selectedDopplerProject}
                    options={dopplerEnvironments}
                    placeholder="Select Doppler environment..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.slug}
                  />
                </FormControl>
              );
            }}
          />

          <div className="mt-8 flex space-x-4">
            <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
              Import secrets
            </Button>
            <ModalClose asChild>
              <Button colorSchema="secondary" variant="plain">
                Cancel
              </Button>
            </ModalClose>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
