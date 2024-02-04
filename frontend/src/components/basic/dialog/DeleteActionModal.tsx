import { Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";

import InputField from "../InputField";

// REFACTOR: Move all these modals into one reusable one 
type Props = {
  isOpen?: boolean;
  onClose: ()=>void;
  title: string;
  onSubmit:()=>void;
  deleteKey?:string;
}

const DeleteActionModal = ({
  isOpen,
  onClose,
  title,
  onSubmit,
  deleteKey
}:Props) => {
  const [deleteInputField, setDeleteInputField] = useState("")

    useEffect(() => {
      setDeleteInputField("");
    }, [isOpen]);

  return (
    <div>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as='div' className='relative z-10' onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter='ease-out duration-300'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='ease-in duration-150'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <div className='fixed inset-0 bg-black bg-opacity-70' />
          </Transition.Child>
          <div className='fixed inset-0 overflow-y-auto'>
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
                <Dialog.Panel className='w-full max-w-md transform overflow-hidden rounded-md bg-grey border border-gray-700 p-6 text-left align-middle shadow-xl transition-all'>
                  <Dialog.Title
                    as='h3'
                    className='text-lg font-medium leading-6 text-gray-400'
                  >
                    {title}
                  </Dialog.Title>
                  <div className='mt-2'>
                    <p className='text-sm text-gray-500'>
                      This action is irrevertible.
                    </p>
                  </div>
                  <div className='mt-2'>
                    <InputField
                      isRequired
                      label={`Type ${deleteKey} to delete the resource`}
                      onChangeHandler={(val) => setDeleteInputField(val)}
                      value={deleteInputField}
                      type='text'
                    />
                  </div>
                  <div className='mt-6'>
                    <button
                      type='button'
                      className='inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2 text-sm font-medium text-gray-400 hover:bg-alizarin hover:text-white hover:text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
                      onClick={onSubmit}
                      disabled={
                        Boolean(deleteKey) && deleteInputField !== deleteKey
                      }
                    >
                      Delete
                    </button>
                    <button
                      type='button'
                      className='ml-2 inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2 text-sm font-medium text-gray-400 hover:border-white hover:text-white hover:text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
                      onClick={onClose}
                    >
                      Cancel
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default DeleteActionModal;
