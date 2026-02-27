import { cloneElement, ReactNode } from "react";
import { Control, Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  faChevronDown,
  faChevronRight,
  faDiagramProject,
  faInfoCircle,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button, Checkbox, IconButton, Select, SelectItem, Tag, Tooltip } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { useToggle } from "@app/hooks";

import {
  isConditionalSubjects,
  TFormSchema,
  TProjectPermissionObject
} from "./ProjectRoleModifySection.utils";

type Props<T extends ProjectPermissionSub> = {
  title: string;
  subject: T;
  actions: TProjectPermissionObject[T]["actions"];
  children?: JSX.Element;
  isDisabled?: boolean;
  onShowAccessTree?: (subject: ProjectPermissionSub) => void;
};

type ActionProps = {
  value: string;
  subject: ProjectPermissionSub;
  rootIndex: number;
  label: ReactNode;
  isDisabled?: boolean;
  control: Control<TFormSchema>;
};

const ActionCheckbox = ({ value, subject, isDisabled, rootIndex, label, control }: ActionProps) => {
  // scott: using Controller caused discrepancy between field value and actual value, this is a hacky fix
  const fieldValue = useWatch({
    control,
    name: `permissions.${subject}.${rootIndex}.${value}` as any
  });
  const { setValue } = useFormContext();

  return (
    <div className="flex items-center justify-center">
      <Checkbox
        isDisabled={isDisabled}
        isChecked={Boolean(fieldValue)}
        onCheckedChange={(isChecked) =>
          setValue(`permissions.${subject}.${rootIndex}.${value}`, isChecked, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true
          })
        }
        id={`permissions.${subject}.${rootIndex}.${String(value)}`}
      >
        {label}
      </Checkbox>
    </div>
  );
};

export const GeneralPermissionPolicies = <T extends keyof NonNullable<TFormSchema["permissions"]>>({
  subject,
  actions,
  children,
  title,
  isDisabled,
  onShowAccessTree
}: Props<T>) => {
  const { control, watch } = useFormContext<TFormSchema>();
  const { fields, remove, insert } = useFieldArray({
    control,
    name: `permissions.${subject}`
  });

  // scott: this is a hacky work-around to resolve bug of fields not updating UI when removed
  const watchFields = useWatch<TFormSchema>({
    control,
    name: `permissions.${subject}`
  });

  const [isOpen, setIsOpen] = useToggle();

  if (!watchFields || !Array.isArray(watchFields) || watchFields.length === 0) return null;

  return (
    <div className="overflow-clip border border-mineshaft-600 bg-mineshaft-800 first:rounded-t-md last:rounded-b-md hover:bg-mineshaft-700">
      <div
        className="flex h-14 cursor-pointer items-center px-5 py-4 text-sm text-gray-300"
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen.toggle()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setIsOpen.toggle();
          }
        }}
      >
        <FontAwesomeIcon className="mr-6 w-4" icon={isOpen ? faChevronDown : faChevronRight} />

        <div className="grow text-base select-none">{title}</div>
        {fields.length > 1 && (
          <div>
            <Tag size="xs" className="mr-2 px-2">
              {fields.length} Rules
            </Tag>
          </div>
        )}
        {isOpen && onShowAccessTree && (
          <Button
            leftIcon={<FontAwesomeIcon icon={faDiagramProject} />}
            variant="outline_bg"
            size="xs"
            className="ml-2"
            onClick={(e) => {
              e.stopPropagation();
              onShowAccessTree(subject);
            }}
          >
            Visualize Access
          </Button>
        )}
        {!isDisabled && isOpen && isConditionalSubjects(subject) && (
          <Button
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            variant="outline_bg"
            className="ml-2"
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              insert(fields.length, [
                { read: false, edit: false, create: false, delete: false } as any
              ]);
            }}
            isDisabled={isDisabled}
          >
            Add Rule
          </Button>
        )}
      </div>
      {isOpen && (
        <div key={`select-${subject}-type`} className="flex flex-col space-y-3 bg-bunker-700 p-3">
          {fields.map((el, rootIndex) => {
            let isFullReadAccessEnabled = false;

            if (subject === ProjectPermissionSub.Secrets) {
              isFullReadAccessEnabled = watch(`permissions.${subject}.${rootIndex}.read` as any);
            }

            const isInverted = watch(`permissions.${subject}.${rootIndex}.inverted` as any);

            return (
              <div
                key={el.id}
                className={twMerge(
                  "relative rounded-md border-l-[6px] bg-mineshaft-800 px-5 py-4 transition-colors duration-300",
                  isInverted ? "border-l-red-600/50" : "border-l-green-600/50"
                )}
              >
                {isConditionalSubjects(subject) && (
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex w-full items-center text-gray-300">
                      <div className="mr-3">Permission</div>
                      <Controller
                        defaultValue={false as any}
                        name={`permissions.${subject}.${rootIndex}.inverted`}
                        render={({ field }) => (
                          <Select
                            value={String(field.value)}
                            onValueChange={(val) => field.onChange(val === "true")}
                            containerClassName="w-40"
                            className="w-full"
                            isDisabled={isDisabled}
                            position="popper"
                          >
                            <SelectItem value="false">Allow</SelectItem>
                            <SelectItem value="true">Forbid</SelectItem>
                          </Select>
                        )}
                      />
                      <Tooltip
                        asChild
                        content={
                          <>
                            <p>
                              Whether to allow or forbid the selected actions when the following
                              conditions (if any) are met.
                            </p>
                            <p className="mt-2">Forbid rules must come after allow rules.</p>
                          </>
                        }
                      >
                        <FontAwesomeIcon
                          icon={faInfoCircle}
                          size="sm"
                          className="ml-2 text-bunker-400"
                        />
                      </Tooltip>
                      {!isDisabled && (
                        <Tooltip content="Remove Rule">
                          <IconButton
                            ariaLabel="Remove rule"
                            colorSchema="danger"
                            variant="plain"
                            size="xs"
                            className="mr-3 ml-auto rounded-sm"
                            onClick={() => remove(rootIndex)}
                            isDisabled={isDisabled}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-col text-gray-300">
                  <div className="flex w-full justify-between">
                    <div className="mb-2">Actions</div>
                    {!isDisabled && !isConditionalSubjects(subject) && (
                      <Tooltip content="Remove Rule">
                        <IconButton
                          ariaLabel="Remove rule"
                          colorSchema="danger"
                          variant="plain"
                          size="xs"
                          className="ml-auto rounded-sm"
                          onClick={() => remove(rootIndex)}
                          isDisabled={isDisabled}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                  <div className="flex grow flex-wrap justify-start gap-x-8 gap-y-4">
                    {actions.map(({ label, value }, index) => {
                      if (typeof value !== "string") return undefined;

                      if (
                        subject === ProjectPermissionSub.Secrets &&
                        value === "read" &&
                        !isFullReadAccessEnabled
                      ) {
                        return null;
                      }

                      return (
                        <ActionCheckbox
                          key={`${el.id}-${index + 1}`}
                          value={value}
                          label={label}
                          rootIndex={rootIndex}
                          control={control}
                          subject={subject}
                          isDisabled={isDisabled}
                        />
                      );
                    })}
                  </div>
                </div>
                {children &&
                  cloneElement(children, {
                    position: rootIndex
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
