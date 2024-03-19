/* eslint-disable jsx-a11y/label-has-associated-control */
type Props = {
  addAllUsers: boolean;
  setAddAllUsers: (arg: boolean) => void;
};

export const Checkbox = ({ addAllUsers, setAddAllUsers }: Props) => (
  <div className="flex flex-row items-center">
    {addAllUsers === true ? (
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked
        readOnly
        onClick={() => setAddAllUsers(!addAllUsers)}
      />
    ) : (
      <div
        onKeyDown={() => setAddAllUsers(!addAllUsers)}
        role="button"
        tabIndex={0}
        aria-label="add all users"
        className="h-4 w-4 rounded-sm border border-gray-600 bg-bunker"
        onClick={() => setAddAllUsers(!addAllUsers)}
      />
    )}

    <label className="ml-2 text-sm text-gray-500">
      Add all members of my organization to this project.
    </label>
  </div>
);
