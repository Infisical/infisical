import { cloneElement, ReactNode, useState } from "react";
import { Control, Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  faChevronDown,
  faChevronRight,
  faGripVertical,
  faInfoCircle,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button, Checkbox, Select, SelectItem, Tag, Tooltip } from "@app/components/v2";
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
  isDisabled
}: Props<T>) => {
  const { control, watch } = useFormContext<TFormSchema>();
  const { fields, remove, insert, move } = useFieldArray({
    control,
    name: `permissions.${subject}`
  });

  // scott: this is a hacky work-around to resolve bug of fields not updating UI when removed
  const watchFields = useWatch<TFormSchema>({
    control,
    name: `permissions.${subject}`
  });

  const [isOpen, setIsOpen] = useToggle();
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);

  if (!watchFields || !Array.isArray(watchFields) || watchFields.length === 0) return <div />;

  const handleDragStart = (_: React.DragEvent, index: number) => {
    setDraggedItem(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverItem(index);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    if (draggedItem === null || dragOverItem === null || draggedItem === dragOverItem) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    move(draggedItem, dragOverItem);

    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  return (
    <div className="border border-mineshaft-600 bg-mineshaft-800 first:rounded-t-md last:rounded-b-md">
      <div
        className="flex cursor-pointer items-center space-x-8 px-5 py-4 text-sm text-gray-300"
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen.toggle()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setIsOpen.toggle();
          }
        }}
      >
        <div>
          <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} />
        </div>
        <div className="flex-grow">{title}</div>
        {fields.length > 1 && (
          <div>
            <Tag size="xs" className="px-2">
              {fields.length} rules
            </Tag>
          </div>
        )}
      </div>
      {isOpen && (
        <div key={`select-${subject}-type`} className="flex flex-col space-y-4 bg-bunker-800 p-6">
          {fields.map((el, rootIndex) => {
            let isFullReadAccessEnabled = false;

            if (subject === ProjectPermissionSub.Secrets) {
              isFullReadAccessEnabled = watch(`permissions.${subject}.${rootIndex}.read` as any);
            }

            return (
              <div
                key={el.id}
                className={twMerge(
                  "relative bg-mineshaft-800 p-5 pr-10 first:rounded-t-md last:rounded-b-md",
                  dragOverItem === rootIndex ? "border-2 border-blue-400" : "",
                  draggedItem === rootIndex ? "opacity-50" : ""
                )}
                onDragOver={(e) => handleDragOver(e, rootIndex)}
                onDrop={handleDrop}
              >
                {!isDisabled && (
                  <Tooltip position="left" content="Drag to reorder permission">
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, rootIndex)}
                      onDragEnd={handleDragEnd}
                      className="absolute right-3 top-2 cursor-move rounded-md bg-mineshaft-700 p-2 text-gray-400 hover:text-gray-200"
                    >
                      <FontAwesomeIcon icon={faGripVertical} />
                    </div>
                  </Tooltip>
                )}

                <div className="mb-4 flex items-center">
                  {isConditionalSubjects(subject) && (
                    <div className="flex w-full items-center text-gray-300">
                      <div className="w-1/4">Permission</div>
                      <div className="mr-4 w-1/4">
                        <Controller
                          defaultValue={false as any}
                          name={`permissions.${subject}.${rootIndex}.inverted`}
                          render={({ field }) => (
                            <Select
                              value={String(field.value)}
                              onValueChange={(val) => field.onChange(val === "true")}
                              containerClassName="w-full"
                              className="w-full"
                              isDisabled={isDisabled}
                            >
                              <SelectItem value="false">Allow</SelectItem>
                              <SelectItem value="true">Forbid</SelectItem>
                            </Select>
                          )}
                        />
                      </div>
                      <div>
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
                            className="text-gray-400"
                          />
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-4 text-gray-300">
                  <div className="w-1/4">Actions</div>
                  <div className="flex flex-grow flex-wrap justify-start gap-8">
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
                <div
                  className={twMerge(
                    "mt-4 flex justify-start space-x-4",
                    isConditionalSubjects(subject) && "justify-end"
                  )}
                >
                  {!isDisabled && isConditionalSubjects(subject) && (
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      variant="star"
                      size="xs"
                      className="mt-2"
                      onClick={() => {
                        insert(rootIndex + 1, [
                          { read: false, edit: false, create: false, delete: false } as any
                        ]);
                      }}
                      isDisabled={isDisabled}
                    >
                      Add policy
                    </Button>
                  )}
                  {!isDisabled && (
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faTrash} />}
                      variant="outline_bg"
                      size="xs"
                      className="mt-2 hover:border-red"
                      onClick={() => remove(rootIndex)}
                      isDisabled={isDisabled}
                    >
                      Remove policy
                    </Button>
                  )}{" "}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
