type Props = {
  addAllUsers: boolean;
  setAddAllUsers: (arg: boolean) => void;
};

export const Checkbox = ({ addAllUsers, setAddAllUsers }: Props) => {
  return (
    <>
      <div className='flex flex-row items-center'>
        {addAllUsers == true ? (
          <input
            type='checkbox'
            className='accent-primary h-4 w-4'
            checked
            readOnly
            onClick={() => setAddAllUsers(!addAllUsers)}
          />
        ) : (
          <div
            className='h-4 w-4 bg-bunker border border-gray-600 rounded-sm'
            onClick={() => setAddAllUsers(!addAllUsers)}
          ></div>
        )}

        <label className='ml-2 text-gray-500 text-sm'>
          Add all members of my organization to this project.
        </label>
      </div>
    </>
  );
};
