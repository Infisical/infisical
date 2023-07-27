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
  faPlus,
  faTags,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cx } from "cva";
import { twMerge } from "tailwind-merge";

import {
  Button,
  Checkbox,
  FormControl,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SecretInput,
  Tag,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { WsTag } from "@app/hooks/api/types";

import { FormData, SecretActionType } from "../../DashboardPage.utils";

const tagColors = [
  { bg: "bg-[#f1c40f]/40", text: "text-[#fcf0c3]/70" },
  { bg: "bg-[#cb1c8d]/40", text: "text-[#f2c6e3]/70" },
  { bg: "bg-[#badc58]/40", text: "text-[#eef6d5]/70" },
  { bg: "bg-[#ff5400]/40", text: "text-[#ffddcc]/70" },
  { bg: "bg-[#3AB0FF]/40", text: "text-[#f0fffd]/70" },
  { bg: "bg-[#6F1AB6]/40", text: "text-[#FFE5F1]/70" },
  { bg: "bg-[#C40B13]/40", text: "text-[#FFDEDE]/70" },
  { bg: "bg-[#332FD0]/40", text: "text-[#DFF6FF]/70" }
];

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
  onSecretDelete: (index: number, id?: string, overrideId?: string) => void;
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
    register,
    setValue,
    isKeyError,
    keyError,
    secUniqId
  }: Props): JSX.Element => {
    const isKeySubDisabled = useRef<boolean>(false);
    // comment management in a row
    const {
      fields: secretTags,
      remove,
      append
    } = useFieldArray({ control, name: `secrets.${index}.tags` });

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
    const [editorRef, setEditorRef] = useState(isOverridden ? secValueOverride : secValue);

    const secId = useWatch({ control, name: `secrets.${index}._id`, exact: true });
    const tags =
      useWatch({ control, name: `secrets.${index}.tags`, exact: true, defaultValue: [] }) || [];
    const selectedTagIds = tags.reduce<Record<string, boolean>>(
      (prev, curr) => ({ ...prev, [curr.slug]: true }),
      {}
    );

    const [isInviteLinkCopied, setInviteLinkCopied] = useToggle(false);

    useEffect(() => {
      let timer: NodeJS.Timeout;
      if (isInviteLinkCopied) {
        timer = setTimeout(() => setInviteLinkCopied.off(), 2000);
      }
      return () => clearTimeout(timer);
    }, [isInviteLinkCopied]);

    useEffect(() => {
      setEditorRef(isOverridden ? secValueOverride : secValue);
    }, [isOverridden]);

    const copyTokenToClipboard = () => {
      navigator.clipboard.writeText((secValueOverride || secValue) as string);
      setInviteLinkCopied.on();
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
        append(selectedTag);
      } else {
        const pos = tags.findIndex(({ slug }) => selectedTag.slug === slug);
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
      <tr className="group flex flex-row" key={index}>
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
                name={`secrets.${index}.valueOverride`}
                render={({ field: { onChange, onBlur } }) => (
                  <SecretInput
                    key={`secrets.${index}.valueOverride`}
                    isDisabled={
                      isReadOnly ||
                      isRollbackMode ||
                      (isOverridden ? isAddOnly : shouldBeBlockedInAddOnly)
                    }
                    value={editorRef}
                    isVisible={!isSecretValueHidden}
                    onChange={(val, html) => {
                      console.log(val);
                      onChange(val);
                      setEditorRef(html);
                    }}
                    onBlur={(html) => {
                      setEditorRef(html);
                      onBlur();
                    }}
                  />
                )}
              />
            ) : (
              <Controller
                control={control}
                name={`secrets.${index}.value`}
                render={({ field: { onBlur, onChange } }) => (
                  <SecretInput
                    key={`secrets.${index}.value`}
                    isVisible={!isSecretValueHidden}
                    isDisabled={
                      isReadOnly ||
                      isRollbackMode ||
                      (isOverridden ? isAddOnly : shouldBeBlockedInAddOnly)
                    }
                    onChange={(val, html) => {
                      onChange(val);
                      setEditorRef(html);
                    }}
                    value={editorRef}
                    onBlur={(html) => {
                      setEditorRef(html);
                      onBlur();
                    }}
                  />
                )}
              />
            )}
          </div>
        </td>
        <td className="min-w-sm flex">
          <div className="flex h-8 items-center pl-2">
            {secretTags.map(({ id, slug }, i) => (
              <Tag
                className={cx(
                  tagColors[i % tagColors.length].bg,
                  tagColors[i % tagColors.length].text
                )}
                isDisabled={isReadOnly || isAddOnly || isRollbackMode}
                onClose={() => remove(i)}
                key={id}
              >
                {slug}
              </Tag>
            ))}
            <div className="w-0 overflow-hidden group-hover:w-6">
              <Tooltip content="Copy value">
                <IconButton
                  variant="plain"
                  size="md"
                  ariaLabel="add-tag"
                  className="py-[0.42rem]"
                  onClick={copyTokenToClipboard}
                >
                  <FontAwesomeIcon icon={isInviteLinkCopied ? faCheck : faCopy} />
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
                  <PopoverContent
                    side="left"
                    className="max-h-96 w-auto min-w-[200px] overflow-y-auto overflow-x-hidden border border-mineshaft-600 bg-mineshaft-800 p-2 text-bunker-200"
                    hideCloseBtn
                  >
                    <div className="mb-2 px-2 text-center text-sm font-medium text-bunker-200">
                      Add tags to {secKey || "this secret"}
                    </div>
                    <div className="flex flex-col space-y-1">
                      {wsTags?.map((wsTag) => (
                        <Button
                          variant="plain"
                          size="sm"
                          className={twMerge(
                            "justify-start bg-mineshaft-600 text-bunker-100 hover:bg-mineshaft-500",
                            selectedTagIds?.[wsTag.slug] && "text-primary"
                          )}
                          onClick={() => onSelectTag(wsTag)}
                          leftIcon={
                            <Checkbox
                              className="mr-0 data-[state=checked]:bg-primary"
                              id="autoCapitalization"
                              isChecked={selectedTagIds?.[wsTag.slug]}
                              onCheckedChange={() => {}}
                            >
                              {}
                            </Checkbox>
                          }
                          key={wsTag._id}
                        >
                          {wsTag.slug}
                        </Button>
                      ))}
                      <Button
                        variant="star"
                        color="primary"
                        size="sm"
                        className="mt-4 h-7 justify-start bg-mineshaft-600 px-1"
                        onClick={onCreateTagOpen}
                        leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      >
                        Add new tag
                      </Button>
                    </div>
                  </PopoverContent>
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
                  <PopoverContent
                    className="w-auto border border-mineshaft-600 bg-mineshaft-800 p-2 drop-shadow-2xl"
                    sticky="always"
                  >
                    <FormControl label="Comment" className="mb-0">
                      <TextArea
                        isDisabled={isReadOnly || isRollbackMode || shouldBeBlockedInAddOnly}
                        className="border border-mineshaft-600 text-sm"
                        {...register(`secrets.${index}.comment`)}
                        rows={8}
                        cols={30}
                      />
                    </FormControl>
                  </PopoverContent>
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
                    onClick={() => onSecretDelete(index, secId, idOverride)}
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
