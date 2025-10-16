import { Controller, FormProvider, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FilterableSelect, FormControl, ModalClose, Spinner } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { PamResourceType, useListPamResources } from "@app/hooks/api/pam";

import { PamAddResourceModal } from "../../PamResourcesPage/components/PamAddResourceModal";
import { PamResourceOption } from "./PamResourceOption";

type Props = {
  onSubmit: (data: FormData) => void;
  projectId: string;
};

const formSchema = z.object({
  resource: z.object({
    id: z.string(),
    name: z.string(),
    resourceType: z.nativeEnum(PamResourceType)
  })
});

type FormData = z.infer<typeof formSchema>;

export const ResourceSelect = ({ onSubmit, projectId }: Props) => {
  const { permission } = useProjectPermission();
  const { isPending, data: resources } = useListPamResources(projectId);

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addResource"] as const);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema)
  });

  const { handleSubmit, control, setValue } = form;

  const canCreateResource = permission.can(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.PamResources
  );

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-mineshaft-500" />
        <p className="mt-4 text-sm text-mineshaft-400">Loading options...</p>
      </div>
    );
  }

  return (
    <>
      <FormProvider {...form}>
        <form
          onSubmit={(e) => {
            handleSubmit(onSubmit)(e);
          }}
        >
          <Controller
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl isError={Boolean(error)} errorText={error?.message} label="Resource">
                <FilterableSelect
                  value={value}
                  onChange={(newValue) => {
                    if ((newValue as SingleValue<{ id: string }>)?.id === "_create") {
                      handlePopUpOpen("addResource");
                      onChange(null);
                      return;
                    }

                    onChange(newValue);
                  }}
                  isLoading={isPending}
                  options={[
                    ...(canCreateResource
                      ? [
                          {
                            id: "_create",
                            name: "Create Resource",
                            // This is just to make typescript happy. Does not actually do anything
                            resourceType: PamResourceType.Postgres
                          }
                        ]
                      : []),
                    ...(resources ?? [])
                  ]}
                  placeholder="Select resource..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                  components={{ Option: PamResourceOption }}
                />
              </FormControl>
            )}
            control={control}
            name="resource"
          />
          <div className="mt-6 flex items-center">
            <Button className="mr-4" size="sm" type="submit" colorSchema="secondary">
              Continue
            </Button>
            <ModalClose asChild>
              <Button colorSchema="secondary" variant="plain">
                Cancel
              </Button>
            </ModalClose>
          </div>
        </form>
      </FormProvider>
      <PamAddResourceModal
        isOpen={popUp.addResource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addResource", isOpen)}
        projectId={projectId}
        onComplete={(resource) => setValue("resource", resource)}
      />
    </>
  );
};
