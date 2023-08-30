/* eslint-disable react/jsx-no-useless-fragment */
import { memo, useEffect, useRef, useState } from "react";
import {
  Control,
  Controller,
  useFieldArray,
  UseFormRegister,
  UseFormSetValue,
  useWatch
} from "react-hook-form";
import {
  faCheck,
  faCodeBranch,
  faComment,
  faCopy,
  faEllipsis,
  faInfoCircle,
  faTags,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cx } from "cva";
import { twMerge } from "tailwind-merge";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  Popover,
  PopoverTrigger,
  SecretInput,
  Tag,
  Tooltip
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { WsTag } from "@app/hooks/api/types";

import AddTagPopoverContent from "../../../../components/AddTagPopoverContent/AddTagPopoverContent";
import { FormData, SecretActionType } from "../../DashboardPage.utils";

type Props = {
  index: number;
  // backend generated unique id
  secUniqId?: string;
  // permission and external state's that decided to hide or show
  isReadOnly?: boolean;
  isAddOnly?: boolean;
  isRollbackMode?: boolean;
  isSecretValueHidden: boolean;
  searchTerm: string;
  // to record the ids of deleted ones
  onSecretDelete: (index: number, secretName: string, id?: string, overrideId?: string) => void;
  // sidebar control props
  onRowExpand: (secId: string | undefined, index: number) => void;
  // tag props
  wsTags?: WsTag[];
  onCreateTagOpen: () => void;
  // rhf specific functions, dont put this using useFormContext. This is passed as props to avoid re-rendering
  control: Control<FormData>;
  register: UseFormRegister<FormData>;
  setValue: UseFormSetValue<FormData>;
  isKeyError?: boolean;
  keyError?: string;
  autoCapitalization?: boolean;
};

export const SecretInputRow = memo(
  ({
    index,
    isSecretValueHidden,
    onRowExpand,
    isReadOnly,
    isRollbackMode,
    isAddOnly,
    wsTags,
    onCreateTagOpen,
    onSecretDelete,
    searchTerm,
    control,
    // register,
    setValue,
    isKeyError,
    keyError,
    secUniqId,
    autoCapitalization
  }: Props): JSX.Element => {
    const isKeySubDisabled = useRef<boolean>(false);
    // comment management in a row
    const {
      fields: secretTags,
      remove,
      append
    } = useFieldArray({ control, name: `secrets.${index}.tags` });

    // display the tags in alphabetical order
    secretTags.sort((a, b) => a?.name?.localeCompare(b?.name));

    // to get details on a secret
    const overrideAction = useWatch({
      control,
      name: `secrets.${index}.overrideAction`,
      exact: true
    });
    const idOverride = useWatch({ control, name: `secrets.${index}.idOverride`, exact: true });
    const secComment = useWatch({ control, name: `secrets.${index}.comment`, exact: true });
    const hasComment = Boolean(secComment);
    const secKey = useWatch({
      control,
      name: `secrets.${index}.key`,
      disabled: isKeySubDisabled.current,
      exact: true
    });
    const secValue = useWatch({
      control,
      name: `secrets.${index}.value`,
      disabled: isKeySubDisabled.current,
      exact: true
    });
    const secValueOverride = useWatch({
      control,
      name: `secrets.${index}.valueOverride`,
      disabled: isKeySubDisabled.current,
      exact: true
    });
    // when secret is override by personal values
    const isOverridden =
      overrideAction === SecretActionType.Created || overrideAction === SecretActionType.Modified;
    const [hoveredTag, setHoveredTag] = useState<WsTag | null>(null);

    const handleTagOnMouseEnter = (wsTag: WsTag) => {
      setHoveredTag(wsTag);
    };

    const handleTagOnMouseLeave = () => {
      setHoveredTag(null);
    };

    const checkIfTagIsVisible = (wsTag: WsTag) => wsTag._id === hoveredTag?._id;

    const secId = useWatch({ control, name: `secrets.${index}._id`, exact: true });
    const tags =
      useWatch({ control, name: `secrets.${index}.tags`, exact: true, defaultValue: [] }) || [];

    const selectedTagIds = tags.reduce<Record<string, boolean>>(
      (prev, curr) => ({ ...prev, [curr.slug]: true }),
      {}
    );

    const [isSecValueCopied, setIsSecValueCopied] = useToggle(false);

    useEffect(() => {
      let timer: NodeJS.Timeout;
      if (isSecValueCopied) {
        timer = setTimeout(() => setIsSecValueCopied.off(), 2000);
      }
      return () => clearTimeout(timer);
    }, [isSecValueCopied]);

    const copyTokenToClipboard = () => {
      navigator.clipboard.writeText((secValueOverride || secValue) as string);
      setIsSecValueCopied.on();
    };

    const onSecretOverride = () => {
      if (isOverridden) {
        // when user created a new override but then removes
        if (overrideAction === SecretActionType.Created)
          setValue(`secrets.${index}.valueOverride`, "");
        setValue(`secrets.${index}.overrideAction`, SecretActionType.Deleted, {
          shouldDirty: true
        });
      } else {
        setValue(`secrets.${index}.valueOverride`, "");
        setValue(
          `secrets.${index}.overrideAction`,
          idOverride ? SecretActionType.Modified : SecretActionType.Created,
          { shouldDirty: true }
        );
      }
    };

    const onSelectTag = (selectedTag: WsTag) => {
      const shouldAppend = !selectedTagIds[selectedTag.slug];
      if (shouldAppend) {
        const { _id: id, name, slug, tagColor } = selectedTag;
        append({ _id: id, name, slug, tagColor });
      } else {
        const pos = tags.findIndex(({ slug }: { slug: string }) => selectedTag.slug === slug);
        remove(pos);
      }
    };
    const isCreatedSecret = !secId;
    const shouldBeBlockedInAddOnly = !isCreatedSecret && isAddOnly;

    // Why this instead of filter in parent
    // Because rhf field.map has default values so basically
    // keys are not updated there and index needs to kept so that we can monitor
    // values individually here
    if (
      !(
        secKey?.toUpperCase().includes(searchTerm?.toUpperCase()) ||
        tags
          ?.map((tag) => tag.name)
          .join(" ")
          ?.toUpperCase()
          .includes(searchTerm?.toUpperCase()) ||
        secComment?.toUpperCase().includes(searchTerm?.toUpperCase())
      )
    ) {
      return <></>;
    }

    return (
      <tr className="group flex flex-row hover:bg-mineshaft-700" key={index}>
        <td className="flex h-10 w-10 items-center justify-center border-none px-4">
          <div className="w-10 text-center text-xs text-bunker-400">{index + 1}</div>
        </td>

        <Controller
          control={control}
          defaultValue=""
          name={`secrets.${index}.key`}
          render={({ field }) => (
            <HoverCard openDelay={0} open={isKeyError ? undefined : false}>
              <HoverCardTrigger asChild>
                <td className={cx(isKeyError ? "rounded ring ring-red/50" : null)}>
                  <div className="relative flex w-full min-w-[220px] items-center justify-end lg:min-w-[240px] xl:min-w-[280px]">
                    <Input
                      autoComplete="off"
                      onFocus={() => {
                        isKeySubDisabled.current = true;
                      }}
                      variant="plain"
                      isDisabled={isReadOnly || shouldBeBlockedInAddOnly || isRollbackMode}
                      className="w-full focus:text-bunker-100 focus:ring-transparent"
                      {...field}
                      onBlur={() => {
                        isKeySubDisabled.current = false;
                        field.onBlur();
                      }}
                      autoCapitalization={autoCapitalization}
                    />
                  </div>
                </td>
              </HoverCardTrigger>
              <HoverCardContent className="w-auto py-2 pt-2">
                <div className="flex items-center space-x-2">
                  <div>
                    <FontAwesomeIcon icon={faInfoCircle} className="text-red" />
                  </div>
                  <div className="text-sm">{keyError}</div>
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
        />
        <td
          className="flex w-full flex-grow flex-row border-r border-none border-red"
          style={{ padding: "0.5rem 0 0.5rem 1rem" }}
        >
          <div className="w-full">
            {isOverridden ? (
              <Controller
                control={control}
                key={`secrets.${index}.valueOverride`}
                name={`secrets.${index}.valueOverride`}
                render={({ field }) => (
                  <SecretInput
                    key={`secrets.${index}.valueOverride`}
                    isDisabled={
                      isReadOnly ||
                      isRollbackMode ||
                      (isOverridden ? isAddOnly : shouldBeBlockedInAddOnly)
                    }
                    isVisible={!isSecretValueHidden}
                    {...field}
                  />
                )}
              />
            ) : (
              <Controller
                control={control}
                key={`secrets.${index}.value`}
                name={`secrets.${index}.value`}
                render={({ field }) => (
                  <SecretInput
                    key={`secrets.${index}.value`}
                    isVisible={!isSecretValueHidden}
                    isDisabled={
                      isReadOnly ||
                      isRollbackMode ||
                      (isOverridden ? isAddOnly : shouldBeBlockedInAddOnly)
                    }
                    {...field}
                  />
                )}
              />
            )}
          </div>
        </td>
        <td className="min-w-sm flex">
          <div className="flex h-8 items-center pl-2">
            {secretTags.map(({ id, slug, tagColor }) => {
              return (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <div>
                        <Tag
                          // isDisabled={isReadOnly || isAddOnly || isRollbackMode}
                          // onClose={() => remove(i)}
                          key={id}
                          className="cursor-pointer"
                        >
                          <div className="rounded-full border-mineshaft-500 bg-transparent flex items-center  gap-1.5 justify-around">
                            <div
                              className="w-[10px] h-[10px] rounded-full"
                              style={{ background: tagColor || "#bec2c8" }}
                            />
                            {slug}
                          </div>
                        </Tag>
                      </div>
                    </PopoverTrigger>
                    <AddTagPopoverContent
                      wsTags={wsTags}
                      secKey={secKey || "this secret"}
                      selectedTagIds={selectedTagIds}
                      handleSelectTag={(wsTag: WsTag) => onSelectTag(wsTag)}
                      handleTagOnMouseEnter={(wsTag: WsTag) => handleTagOnMouseEnter(wsTag)}
                      handleTagOnMouseLeave={() => handleTagOnMouseLeave()}
                      checkIfTagIsVisible={(wsTag: WsTag) => checkIfTagIsVisible(wsTag)}
                      handleOnCreateTagOpen={() => onCreateTagOpen()}
                    />
                  </Popover>
                </>
              );
            })}
            <div className="w-0 overflow-hidden group-hover:w-6">
              <Tooltip content="Copy value">
                <IconButton
                  variant="plain"
                  size="md"
                  ariaLabel="add-tag"
                  className="py-[0.42rem]"
                  onClick={copyTokenToClipboard}
                >
                  <FontAwesomeIcon icon={isSecValueCopied ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
            {!(isReadOnly || isAddOnly || isRollbackMode) && (
              <div className="duration-0 ml-1 overflow-hidden">
                <Popover>
                  <PopoverTrigger asChild>
                    <div className="w-0 group-hover:w-6 data-[state=open]:w-6">
                      <Tooltip content="Add tags">
                        <IconButton
                          variant="plain"
                          size="md"
                          ariaLabel="add-tag"
                          className="py-[0.42rem]"
                        >
                          <FontAwesomeIcon icon={faTags} />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </PopoverTrigger>
                  <AddTagPopoverContent
                    wsTags={wsTags}
                    secKey={secKey || "this secret"}
                    selectedTagIds={selectedTagIds}
                    handleSelectTag={(wsTag: WsTag) => onSelectTag(wsTag)}
                    handleTagOnMouseEnter={(wsTag: WsTag) => handleTagOnMouseEnter(wsTag)}
                    handleTagOnMouseLeave={() => handleTagOnMouseLeave()}
                    checkIfTagIsVisible={(wsTag: WsTag) => checkIfTagIsVisible(wsTag)}
                    handleOnCreateTagOpen={() => onCreateTagOpen()}
                  />
                </Popover>
              </div>
            )}
          </div>
          <div className="flex h-8 flex-row items-center pr-2">
            {!isAddOnly && (
              <div>
                <Tooltip content="Override with a personal value">
                  <IconButton
                    variant="plain"
                    className={twMerge(
                      "mt-0.5 w-0 overflow-hidden p-0 group-hover:ml-1 group-hover:w-7",
                      isOverridden && "ml-1 w-7 text-primary"
                    )}
                    onClick={onSecretOverride}
                    size="md"
                    isDisabled={isRollbackMode || isReadOnly}
                    ariaLabel="info"
                  >
                    <div className="flex items-center space-x-1">
                      <FontAwesomeIcon icon={faCodeBranch} className="text-base" />
                    </div>
                  </IconButton>
                </Tooltip>
              </div>
            )}
            <Tooltip content="Comment">
              <div className="mt-0.5 overflow-hidden ">
                <Popover>
                  <PopoverTrigger asChild>
                    <IconButton
                      className={twMerge(
                        "w-7 overflow-hidden p-0",
                        "w-0 group-hover:w-7 data-[state=open]:w-7",
                        hasComment ? "w-7 text-primary" : "group-hover:w-7"
                      )}
                      variant="plain"
                      size="md"
                      ariaLabel="add-tag"
                    >
                      <FontAwesomeIcon icon={faComment} />
                    </IconButton>
                  </PopoverTrigger>
                  <AddTagPopoverContent
                    wsTags={wsTags}
                    secKey={secKey || "this secret"}
                    selectedTagIds={selectedTagIds}
                    handleSelectTag={(wsTag: WsTag) => onSelectTag(wsTag)}
                    handleTagOnMouseEnter={(wsTag: WsTag) => handleTagOnMouseEnter(wsTag)}
                    handleTagOnMouseLeave={() => handleTagOnMouseLeave()}
                    checkIfTagIsVisible={(wsTag: WsTag) => checkIfTagIsVisible(wsTag)}
                    handleOnCreateTagOpen={() => onCreateTagOpen()}
                  />
                </Popover>
              </div>
            </Tooltip>
          </div>
          <div className="duration-0 flex w-16 justify-center overflow-hidden border-l border-mineshaft-600 pl-2 transition-all">
            <div className="flex h-8 items-center space-x-2.5">
              {!isAddOnly && (
                <div className="opacity-0 group-hover:opacity-100">
                  <Tooltip content="Settings">
                    <IconButton
                      size="lg"
                      colorSchema="primary"
                      variant="plain"
                      onClick={() => onRowExpand(secUniqId, index)}
                      ariaLabel="expand"
                    >
                      <FontAwesomeIcon icon={faEllipsis} />
                    </IconButton>
                  </Tooltip>
                </div>
              )}
              <div className="opacity-0 group-hover:opacity-100">
                <Tooltip content="Delete">
                  <IconButton
                    size="lg"
                    variant="plain"
                    colorSchema="danger"
                    ariaLabel="delete"
                    isDisabled={isReadOnly || isRollbackMode}
                    onClick={() => {
                      onSecretDelete(index, secKey, secId, idOverride);
                    }}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  }
);

SecretInputRow.displayName = "SecretInputRow";
