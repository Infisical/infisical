import { useState } from "react";
import { Controller, useForm, useFormContext } from "react-hook-form";
import { faCheck, faSearch, faXmark, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Table,
  TableContainer,
  TBody,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionSub, useProject } from "@app/context";
import { useGetWorkspaceIntegrations } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

import {
  EXCLUDED_PERMISSION_SUBS,
  isConditionalSubjects,
  PROJECT_PERMISSION_OBJECT,
  ProjectTypePermissionSubjects,
  TFormSchema
} from "./ProjectRoleModifySection.utils";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  type: ProjectType;
};

type ContentProps = {
  onClose: () => void;

  type: ProjectType;
};

type TForm = { permissions: Record<ProjectPermissionSub, boolean> };

const Content = ({ onClose, type: projectType }: ContentProps) => {
  const rootForm = useFormContext<TFormSchema>();
  const [search, setSearch] = useState("");
  const { currentProject } = useProject();
  const isSecretManagerProject = currentProject.type === ProjectType.SecretManager;
  const { data: integrations = [] } = useGetWorkspaceIntegrations(currentProject?.id ?? "", {
    enabled: isSecretManagerProject,
    refetchInterval: false
  });

  const {
    control,
    handleSubmit,
    formState: { isDirty },
    setValue,
    reset
  } = useForm<TForm>({
    defaultValues: {
      permissions: Object.fromEntries(
        Object.values(ProjectPermissionSub).map((subject) => [subject, false])
      )
    }
  });

  const hasNativeIntegrations = integrations.length > 0;

  const filteredPolicies = Object.entries(PROJECT_PERMISSION_OBJECT)
    .filter(
      ([subject, { title }]) =>
        ProjectTypePermissionSubjects[projectType ?? ProjectType.SecretManager][
          subject as ProjectPermissionSub
        ] && (search ? title.toLowerCase().includes(search.toLowerCase()) : true)
    )
    .filter(([subject]) => !EXCLUDED_PERMISSION_SUBS.includes(subject as ProjectPermissionSub))
    .filter(
      ([subject]) =>
        // Hide Native Integrations policy if project has no integrations
        subject !== ProjectPermissionSub.Integrations || hasNativeIntegrations
    )
    .sort((a, b) => a[1].title.localeCompare(b[1].title))
    .map(([subject]) => subject);

  const onSubmit = () =>
    handleSubmit((form) => {
      Object.entries(form.permissions).forEach(([subject, add]) => {
        if (!add) return;

        const type = subject as ProjectPermissionSub;

        const rootPolicyValue = rootForm.getValues("permissions")?.[type];

        if (rootPolicyValue && isConditionalSubjects(subject as ProjectPermissionSub)) {
          rootForm.setValue(
            `permissions.${type}`,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore-error akhilmhdh: this is because of ts collision with both
            [...rootPolicyValue, {}],
            { shouldDirty: true, shouldTouch: true }
          );
        } else if (!rootPolicyValue?.length) {
          rootForm.setValue(
            `permissions.${type}`,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore-error akhilmhdh: this is because of ts collision with both
            [{}],
            {
              shouldDirty: true,
              shouldTouch: true
            }
          );
        }
      });
      onClose();
    })();

  return (
    <>
      <Input
        placeholder="Search policies..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faSearch} />}
        rightIcon={
          search ? (
            <IconButton ariaLabel="Clear search" variant="plain" onClick={() => setSearch("")}>
              <FontAwesomeIcon icon={faXmark} />
            </IconButton>
          ) : null
        }
      />
      <TableContainer className="mt-4 max-h-112 thin-scrollbar">
        <div className="sticky top-0 z-30 flex justify-between border-b border-b-mineshaft-600 bg-mineshaft-800 py-3 pr-4 pl-5 font-inter text-sm font-medium text-bunker-300">
          <span>Resource</span>
          <div className="flex gap-2">
            <Button
              variant="plain"
              className="p-0 text-mineshaft-400"
              size="xs"
              colorSchema="secondary"
              onClick={() => {
                setValue(
                  "permissions",
                  Object.fromEntries(
                    filteredPolicies.map((subject) => [subject, true])
                  ) as TForm["permissions"],
                  { shouldDirty: true }
                );
              }}
            >
              Select All
            </Button>
            <Tooltip content="Clear selection">
              <IconButton
                ariaLabel="Clear selection"
                onClick={() => reset()}
                variant="plain"
                size="xs"
                className={`text-mineshaft-400 ${!isDirty ? "pointer-events-none opacity-50" : ""} hover:text-red`}
                isDisabled={!isDirty}
              >
                <FontAwesomeIcon icon={faXmarkCircle} />
              </IconButton>
            </Tooltip>
          </div>
        </div>
        <Table>
          <TBody>
            {filteredPolicies.map((subject) => (
              <Controller
                control={control}
                key={`permission-add-${subject}`}
                render={({ field: { value, onChange } }) => (
                  <Tr
                    className={`${value ? "bg-mineshaft-600/30" : ""} cursor-pointer hover:bg-mineshaft-700`}
                    onClick={() => onChange(!value)}
                  >
                    <Td className={`${value ? "text-mineshaft-100" : "text-mineshaft-300"} w-full`}>
                      {PROJECT_PERMISSION_OBJECT[subject as ProjectPermissionSub].title}
                    </Td>
                    <Td>
                      {value ? <FontAwesomeIcon className="text-green" icon={faCheck} /> : null}
                    </Td>
                  </Tr>
                )}
                name={`permissions.${subject as ProjectPermissionSub}`}
              />
            ))}
          </TBody>
        </Table>
        {!filteredPolicies.length && (
          <EmptyState
            iconSize="2x"
            icon={faSearch}
            className="pt-8! pb-4!"
            title="No policies match search"
          />
        )}
      </TableContainer>
      <div className="mt-8 flex space-x-4">
        <Button isDisabled={!isDirty} onClick={onSubmit}>
          Add Policies
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </>
  );
};

export const PolicySelectionModal = ({ isOpen, onOpenChange, type }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Add Policies"
        subTitle="Select one or more policies to add to this role."
        className="max-w-3xl"
      >
        <Content onClose={() => onOpenChange(false)} type={type} />
      </ModalContent>
    </Modal>
  );
};
