import { FormEventHandler, Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";

import Button from "../buttons/Button";
import InputField from "../InputField";

type FormFields = { name: string; slug: string };

type Props = {
  isOpen?: boolean;
  isEditMode?: boolean;
  // on edit mode load up initial values
  initialValues?: FormFields;
  onClose: () => void;
  onCreateSubmit: (data: FormFields) => void;
  onEditSubmit: (data: FormFields) => void;
};

// TODO: Migrate to better form management and validation. Preferable react-hook-form + yup
/**
 * The dialog modal for when the user wants to create a new workspace
 * @param {*} param0
 * @returns
 */
export const AddUpdateEnvironmentDialog = ({
  isOpen,
  onClose,
  onCreateSubmit,
  onEditSubmit,
  initialValues,
  isEditMode,
}: Props) => {
  const [formInput, setFormInput] = useState<FormFields>({
    name: "",
    slug: "",
  });

  // This use effect can be removed when the unmount is happening from outside the component
  // When unmount happens outside state gets unmounted also
  useEffect(() => {
    setFormInput(initialValues || { name: "", slug: "" });
  }, [isOpen]);

  // REFACTOR: Move to react-hook-form with yup for better form management
  const onInputChange = (fieldName: string, fieldValue: string) => {
    setFormInput((state) => ({ ...state, [fieldName]: fieldValue }));
  };

  const onFormSubmit: FormEventHandler = (e) => {
    e.preventDefault();
    const data = {
      name: formInput.name,
      slug: formInput.slug.toLowerCase(),
    };
    if (isEditMode) {
      onEditSubmit(data);
      return;
    }
    onCreateSubmit(data);
  };

  return (
    <div>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as='div' className='relative z-20' onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter='ease-out duration-300'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='ease-out duration-150'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <div className='fixed inset-0 bg-black bg-opacity-70' />
          </Transition.Child>

          <div className='fixed inset-0 overflow-y-auto z-50'>
            <div className='flex min-h-full items-center justify-center p-4 text-center'>
              <Transition.Child
                as={Fragment}
                enter='ease-out duration-300'
                enterFrom='opacity-0 scale-95'
                enterTo='opacity-100 scale-100'
                leave='ease-in duration-200'
                leaveFrom='opacity-100 scale-100'
                leaveTo='opacity-0 scale-95'
              >
                <Dialog.Panel className='w-full max-w-md transform overflow-hidden rounded-md bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all'>
                  <Dialog.Title
                    as='h3'
                    className='text-lg font-medium leading-6 text-gray-400'
                  >
                    {isEditMode
                      ? "Update environment"
                      : "Create a new environment"}
                  </Dialog.Title>
                  <form onSubmit={onFormSubmit}>
                    <div className='max-h-28 mt-4'>
                      <InputField
                        label='Environment Name'
                        onChangeHandler={(val) => onInputChange("name", val)}
                        type='varName'
                        value={formInput.name}
                        placeholder=''
                        isRequired
                        // error={error.length > 0}
                        // errorText={error}
                      />
                    </div>
                    <div className='max-h-28 mt-4'>
                      <InputField
                        label='Environment Slug'
                        onChangeHandler={(val) => onInputChange("slug", val)}
                        type='varName'
                        value={formInput.slug}
                        placeholder=''
                        isRequired
                        // error={error.length > 0}
                        // errorText={error}
                      />
                    </div>
                    <p className='text-xs text-gray-500 mt-2'>
                      Slugs are shorthands used in cli to access environment
                    </p>
                    <div className='mt-4 max-w-min'>
                      <Button
                        onButtonPressed={() => null}
                        type='submit'
                        color='mineshaft'
                        text={isEditMode ? "Update" : "Create"}
                        active={formInput.name !== "" && formInput.slug !== ""}
                        size='md'
                      />
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};
