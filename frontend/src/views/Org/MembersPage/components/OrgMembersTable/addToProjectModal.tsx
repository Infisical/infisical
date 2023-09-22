import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faSquareCheck } from "@fortawesome/free-regular-svg-icons";
import { faKey, faSearch, faSquareXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import {
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Input,
  ModalContent,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { Workspace } from "@app/hooks/api/types";
import { useAddUserToWsBatch } from "@app/hooks/api/users/queries";

const formSchema = yup.object({
  projects: yup.lazy((val) => {
    const valSchema: Record<string, yup.StringSchema> = {};
    Object.keys(val).forEach((key) => {
      valSchema[key] = yup.string().trim();
    });
    return yup.object(valSchema);
  })
});

type TFormSchema = yup.InferType<typeof formSchema>;

interface AddToProjectModalProps {
  email: string;
  handleClose: () => void;
  orgId: string;
  userWorkspaces: Workspace[] | undefined;
}

interface FilterWorkspacesArgs {
  userWorkspaces: Workspace[];
  searchFilter: string;
  orgWorkspaces: Workspace[];
}

function filterWorkspaces({ orgWorkspaces, searchFilter, userWorkspaces }: FilterWorkspacesArgs) {
  const memberWorkspaceNames = userWorkspaces?.map((item) => item?.name);
  const nonMemberWorkspaces = orgWorkspaces.filter(
    (item) => !memberWorkspaceNames.includes(item.name)
  );

  const searchFilteredWorkspace = nonMemberWorkspaces?.filter(({ name }) =>
    name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return searchFilteredWorkspace;
}

export const AddToProjectModal = (props: AddToProjectModalProps) => {
  const { email, handleClose, orgId, userWorkspaces } = props;
  const { mutateAsync: batchAddUser } = useAddUserToWsBatch();
  const [searchFilter, setSearchFilter] = useState("");
  const { t } = useTranslation();
  const { workspaces, isLoading: isWorkspaceLoading } = useWorkspace();
  const orgWorkspaces =
    workspaces?.filter(
      (workspace) => workspace.organization === localStorage.getItem("orgData.id")
    ) || [];

  const {
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { isDirty }
  } = useForm<TFormSchema>({
    resolver: yupResolver(formSchema)
  });

  const handleSecSelectAll = () => {
    if (workspaces) {
      setValue(
        "projects",
        workspaces?.reduce((prev, curr) => ({ ...prev, [curr.name]: curr._id }), {}),
        { shouldDirty: true }
      );
    }
  };

  const projects = watch("projects", {});

  const isDisabled = Boolean(Object.values(projects).filter((item) => item).length);

  const handleFormSubmit = async (data: TFormSchema) => {
    // console.log({ data });
    const workspaceIds: string[] = [];
    Object.values(data?.projects).forEach((val) => {
      if (val) {
        workspaceIds.push(val);
      }
    });
    await batchAddUser({ email, workspaceIds, orgId });
    handleClose();
    reset();
  };

  const filteredWorkspaces = filterWorkspaces({
    orgWorkspaces,
    searchFilter,
    userWorkspaces: userWorkspaces || []
  });
  return (
    <ModalContent
      className="max-w-2xl"
      title={t("section.members.add-dialog.add-member-to-project") as string}
      subTitle={t("section.members.add-dialog.user-will-email")}
      footerContent={
        <div className="items center flex  gap-x-4">
          <Button form="add-to-project" type="submit" isDisabled={!isDirty || !isDisabled}>
            Add to projects
          </Button>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <h2>Projects</h2>
        <div className="flex items-center gap-x-2">
          <Input
            placeholder="Search for project"
            value={searchFilter}
            size="xs"
            leftIcon={<FontAwesomeIcon icon={faSearch} />}
            onChange={(evt) => setSearchFilter(evt.target.value)}
          />
          <Tooltip content="Select All">
            <IconButton
              ariaLabel="Select all"
              variant="outline_bg"
              size="xs"
              onClick={handleSecSelectAll}
            >
              <FontAwesomeIcon icon={faSquareCheck} size="lg" />
            </IconButton>
          </Tooltip>
          <Tooltip content="Unselect All">
            <IconButton
              ariaLabel="UnSelect all"
              variant="outline_bg"
              size="xs"
              onClick={() => reset()}
            >
              <FontAwesomeIcon icon={faSquareXmark} size="lg" />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {!isWorkspaceLoading && !filteredWorkspaces?.length && (
        <EmptyState title="No projects found" icon={faKey} />
      )}
      <form id="add-to-project" onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="thin-scrollbar grid max-h-64 grid-cols-2 gap-4 overflow-auto ">
          {isWorkspaceLoading &&
            Array.apply(0, Array(2)).map((_x, i) => (
              <Skeleton key={`secret-pull-loading-${i + 1}`} className="bg-mineshaft-700" />
            ))}

          {filteredWorkspaces?.map(({ _id, name }) => (
            <Controller
              key={`project--${_id}`}
              control={control}
              name={`projects.${name}`}
              render={({ field: { value, onChange } }) => (
                <Checkbox
                  id={`project-${_id}`}
                  isChecked={Boolean(value)}
                  onCheckedChange={(isChecked) => onChange(isChecked ? _id : undefined)}
                >
                  {name}
                </Checkbox>
              )}
            />
          ))}
        </div>
      </form>
    </ModalContent>
  );
};
