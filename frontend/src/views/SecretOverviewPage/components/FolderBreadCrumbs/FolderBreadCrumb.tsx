type Props = {
  isLast?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

export const FolderBreadCrumb = ({ isLast, onClick, children }: Props) => {
  return (
    <div
      className={`breadcrumb relative z-20 ${
        isLast ? "cursor-default" : "cursor-pointer"
      } border-solid border-mineshaft-600 py-1 pl-5 pr-2 text-sm text-mineshaft-200`}
      onClick={onClick}
      onKeyDown={() => null}
      role="button"
      tabIndex={0}
    >
      {children}
    </div>
  );
};
