/* eslint-disable react/jsx-no-useless-fragment */
import { SyntheticEvent, useRef } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import {
  faCircle,
  faCodeBranch,
  faComment,
  faEllipsis,
  faInfoCircle,
  faPlus,
  faTags,
  faXmark
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { cx } from 'cva';
import { twMerge } from 'tailwind-merge';

import guidGenerator from '@app/components/utilities/randomId';
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
  Tag,
  TextArea,
  Tooltip
} from '@app/components/v2';
import { useToggle } from '@app/hooks';
import { WsTag } from '@app/hooks/api/types';

import { FormData, SecretActionType } from '../../DashboardPage.utils';

type Props = {
  index: number;
  // permission and external state's that decided to hide or show
  isReadOnly?: boolean;
  isAddOnly?: boolean;
  isRollbackMode?: boolean;
  isSecretValueHidden: boolean;
  searchTerm: string;
  // to record the ids of deleted ones
  onSecretDelete: (index: number, id?: string, overrideId?: string) => void;
  // sidebar control props
  onRowExpand: () => void;
  // tag props
  wsTags?: WsTag[];
  onCreateTagOpen: () => void;
};

const tagColors = [
  { bg: 'bg-[#f1c40f]/40', text: 'text-[#fcf0c3]/70' },
  { bg: 'bg-[#cb1c8d]/40', text: 'text-[#f2c6e3]/70' },
  { bg: 'bg-[#badc58]/40', text: 'text-[#eef6d5]/70' },
  { bg: 'bg-[#ff5400]/40', text: 'text-[#ffddcc]/70' },
  { bg: 'bg-[#3AB0FF]/40', text: 'text-[#f0fffd]/70' },
  { bg: 'bg-[#6F1AB6]/40', text: 'text-[#FFE5F1]/70' },
  { bg: 'bg-[#C40B13]/40', text: 'text-[#FFDEDE]/70' },
  { bg: 'bg-[#332FD0]/40', text: 'text-[#DFF6FF]/70' }
];
const REGEX = /([$]{.*?})/g;

export const SecretInputRow = ({
  index,
  isSecretValueHidden,
  onRowExpand,
  isReadOnly,
  isRollbackMode,
  isAddOnly,
  wsTags,
  onCreateTagOpen,
  onSecretDelete,
  searchTerm
}: Props): JSX.Element => {
  const ref = useRef<HTMLDivElement | null>(null);
  const syncScroll = (e: SyntheticEvent<HTMLDivElement>) => {
    if (ref.current === null) return;

    ref.current.scrollTop = e.currentTarget.scrollTop;
    ref.current.scrollLeft = e.currentTarget.scrollLeft;
  };
  const { register, setValue, control } = useFormContext<FormData>();
  const [canRevealSecret] = useToggle();
  // comment management in a row
  const {
    fields: secretTags,
    remove,
    append
  } = useFieldArray({ control, name: `secrets.${index}.tags` });

  // to get details on a secret
  const secret = useWatch({ name: `secrets.${index}`, control });
  const hasComment = Boolean(secret.comment);
  const tags = secret.tags || [];
  const selectedTagIds = tags.reduce<Record<string, boolean>>(
    (prev, curr) => ({ ...prev, [curr.slug]: true }),
    {}
  );

  // when secret is override by personal values
  const isOverridden =
    secret.overrideAction === SecretActionType.Created ||
    secret.overrideAction === SecretActionType.Modified;

  const onSecretOverride = () => {
    if (isOverridden) {
      // when user created a new override but then removes
      if (secret?.overrideAction === SecretActionType.Created)
        setValue(`secrets.${index}.valueOverride`, '');
      setValue(`secrets.${index}.overrideAction`, SecretActionType.Deleted, { shouldDirty: true });
    } else {
      setValue(`secrets.${index}.valueOverride`, '');
      setValue(
        `secrets.${index}.overrideAction`,
        secret?.idOverride ? SecretActionType.Modified : SecretActionType.Created,
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

  const isCreatedSecret = !secret?._id;
  const shouldBeBlockedInAddOnly = !isCreatedSecret && isAddOnly;

  // Why this instead of filter in parent
  // Because rhf field.map has default values so basically
  // keys are not updated there and index needs to kept so that we can monitor
  // values individually here
  if (
    !(
      secret.key?.toUpperCase().includes(searchTerm?.toUpperCase()) ||
      tags
        ?.map((tag) => tag.name)
        .join(' ')
        ?.toUpperCase()
        .includes(searchTerm?.toUpperCase()) ||
      secret.comment?.toUpperCase().includes(searchTerm?.toUpperCase())
    )
  ) {
    return <></>;
  }

  return (
    <tr className="group min-w-full flex flex-row items-center">
      <td className="w-10 h-10 px-4 flex items-center justify-center"><div className='text-center w-10 text-xs text-bunker-400'>{index + 1}</div></td>
      <Controller
        control={control}
        defaultValue=""
        name={`secrets.${index}.key`}
        render={({ fieldState: { error }, field }) => (
          <HoverCard openDelay={0} open={error?.message ? undefined : false}>
            <HoverCardTrigger asChild>
              <td className={cx(error?.message ? 'rounded ring ring-red/50' : null)}>
                <div className="min-w-[220px] lg:min-w-[240px] xl:min-w-[280px] relative flex items-center justify-end w-full">
                  <Input
                    autoComplete="off"
                    variant="plain"
                    isDisabled={isReadOnly || shouldBeBlockedInAddOnly || isRollbackMode}
                    className="w-full focus:text-bunker-100 focus:ring-transparent"
                    {...field}
                  />
                  <div className="w-max flex flex-row items-center justify-end">
                    <Tooltip content="Comment">
                      <div className={`${hasComment ? "w-5" : "w-0"} overflow-hidden group-hover:w-5 mt-0.5`}>
                        <Popover>
                          <PopoverTrigger asChild>
                            <IconButton 
                              className={twMerge(
                                'w-0 overflow-hidden p-0 group-hover:w-5',
                                hasComment && 'w-5 text-primary'
                              )}
                              variant="plain" 
                              size="md" 
                              ariaLabel="add-tag"
                            >
                              <FontAwesomeIcon icon={faComment} />
                            </IconButton>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto bg-mineshaft-800 border border-mineshaft-600 drop-shadow-2xl p-2">
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
                    {!isAddOnly && (
                      <div>
                        <Tooltip content="Override with a personal value">
                          <IconButton
                            variant="plain"
                            className={twMerge(
                              'w-0 overflow-hidden p-0 group-hover:w-6 group-hover:ml-1 mt-0.5',
                              isOverridden && 'w-6 text-primary ml-1'
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
                  </div>
                </div>
              </td>
            </HoverCardTrigger>
            <HoverCardContent className="w-auto py-2 pt-2">
              <div className="flex items-center space-x-2">
                <div>
                  <FontAwesomeIcon icon={faInfoCircle} className="text-red" />
                </div>
                <div className="text-sm">{error?.message}</div>
              </div>
            </HoverCardContent>
          </HoverCard>
        )}
      />
      <td className="flex flex-row w-full justify-center h-8 items-center">
        <div className="group relative whitespace-pre	flex flex-col justify-center w-full px-1.5">
          {isOverridden 
          ? <input
            {...register(`secrets.${index}.valueOverride`)}
            onScroll={syncScroll}
            readOnly={isReadOnly || isRollbackMode || (isOverridden ? isAddOnly : shouldBeBlockedInAddOnly)}
            className={`${
              (!canRevealSecret && isSecretValueHidden)
                ? 'text-transparent focus:text-transparent active:text-transparent'
                : ''
            } z-10 peer font-mono ph-no-capture bg-transparent caret-white text-transparent text-sm px-2 py-2 w-full min-w-16 outline-none duration-200 no-scrollbar no-scrollbar::-webkit-scrollbar`}
            spellCheck="false"
          />
          : <input
            {...register(`secrets.${index}.value`)}
            onScroll={syncScroll}
            readOnly={isReadOnly || isRollbackMode || (isOverridden ? isAddOnly : shouldBeBlockedInAddOnly)}
            className={`${
              (!canRevealSecret && isSecretValueHidden)
                ? 'text-transparent focus:text-transparent active:text-transparent'
                : ''
            } z-10 peer font-mono ph-no-capture bg-transparent caret-white text-transparent text-sm px-2 py-2 w-full min-w-16 outline-none duration-200 no-scrollbar no-scrollbar::-webkit-scrollbar`}
            spellCheck="false"
          />}
          <div
            ref={ref}
            className={`${
              (!canRevealSecret && isSecretValueHidden) && !isOverridden
                ? 'text-bunker-800 group-hover:text-gray-400 peer-focus:text-gray-100 peer-active:text-gray-400 duration-200'
                : ''
            } ${isOverridden ? 'text-primary-300' : 'text-gray-400'}
            absolute flex flex-row whitespace-pre font-mono z-0 ${(!canRevealSecret && isSecretValueHidden) ? 'invisible' : 'visible'} peer-focus:visible mt-0.5 ph-no-capture overflow-x-scroll bg-transparent h-10 text-sm px-2 py-2 w-full min-w-16 outline-none duration-100 no-scrollbar no-scrollbar::-webkit-scrollbar`}
          >
            {(isOverridden ? secret.valueOverride : secret.value)?.split('').length === 0 && <span className='text-bunker-400/80 font-sans'>EMPTY</span>}
            {(isOverridden ? secret.valueOverride : secret.value)?.split(REGEX).map((word) => {
              if (word.match(REGEX) !== null) {
                return (
                  <span className="ph-no-capture text-yellow" key={index}>
                    {word.slice(0, 2)}
                    <span className="ph-no-capture text-yellow-200/80">
                      {word.slice(2, word.length - 1)}
                    </span>
                    {word.slice(word.length - 1, word.length) === '}' ? (
                      <span className="ph-no-capture text-yellow">
                        {word.slice(word.length - 1, word.length)}
                      </span>
                    ) : (
                      <span className="ph-no-capture text-yellow-400">
                        {word.slice(word.length - 1, word.length)}
                      </span>
                    )}
                  </span>
                );
              }
              return (
                <span key={`${word}_${index + 1}`} className="ph-no-capture">
                  {word}
                </span>
              );
            })}
          </div>
          {(!canRevealSecret && isSecretValueHidden) && (
            <div className='absolute flex flex-row justify-between items-center z-0 peer pr-2 peer-active:hidden peer-focus:hidden group-hover:bg-white/[0.00] duration-100 h-10 w-full text-bunker-400 text-clip'>
              <div className="px-2 flex flex-row items-center overflow-x-scroll no-scrollbar no-scrollbar::-webkit-scrollbar">
                {(isOverridden ? secret.valueOverride : secret.value)?.split('').map(() => (
                  <FontAwesomeIcon
                    key={guidGenerator()}
                    className="text-xxs mr-0.5"
                    icon={faCircle}
                  />
                ))}
                {(isOverridden ? secret.valueOverride : secret.value)?.split('').length === 0 && <span className='text-bunker-400/80 text-sm'>EMPTY</span>}
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="flex items-center min-w-sm h-10">
        <div className="flex items-center pl-2">
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
          {!(isReadOnly || isAddOnly || isRollbackMode) && (
            <div className="w-0 overflow-hidden group-hover:w-8">
              <Popover>
                <PopoverTrigger asChild>
                  <div>
                    <Tooltip content="Add tags">
                      <IconButton variant="star" size="xs" ariaLabel="add-tag" className="py-[0.42rem]">
                        <FontAwesomeIcon icon={faTags} />
                      </IconButton>
                    </Tooltip>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  side="left"
                  className="max-h-96 w-auto min-w-[200px] overflow-y-auto overflow-x-hidden p-2 text-bunker-200 bg-mineshaft-800 border border-mineshaft-600"
                  hideCloseBtn
                >
                  <div className="mb-2 text-sm font-medium text-center text-bunker-200 px-2">Add tags to {secret.key || "this secret"}</div>
                  <div className="flex flex-col space-y-1">
                    {wsTags?.map((wsTag) => (
                      <Button
                        variant="plain"
                        size="sm"
                        className={twMerge(
                          'justify-start bg-mineshaft-600 text-bunker-100 hover:bg-mineshaft-500',
                          selectedTagIds?.[wsTag.slug] && 'text-primary'
                        )}
                        onClick={() => onSelectTag(wsTag)}
                        leftIcon={
                          <Checkbox
                            className="data-[state=checked]:bg-primary mr-0"
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
                      className="mt-4 justify-start bg-mineshaft-600 h-7 px-1"
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
        <div className="flex w-0 group-hover:w-14 invisible group-hover:visible duration-0 items-center justify-end space-x-2 overflow-hidden transition-all">
          {!isAddOnly && (
            <div>
              <Tooltip content="Settings">
                <IconButton size="lg" colorSchema="primary" variant="plain" onClick={onRowExpand} ariaLabel="expand">
                  <FontAwesomeIcon icon={faEllipsis} />
                </IconButton>
              </Tooltip>
            </div>
          )}
          <div>
            <Tooltip content="Delete">
              <IconButton
                size="md"
                variant="plain"
                colorSchema="danger"
                ariaLabel="delete"
                isDisabled={isReadOnly || isRollbackMode}
                onClick={() => onSecretDelete(index, secret._id, secret?.idOverride)}
              >
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      </td>
    </tr>
  );
};
