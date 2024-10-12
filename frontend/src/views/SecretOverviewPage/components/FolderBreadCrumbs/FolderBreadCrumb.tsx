type Props = {
  position?: number;
  pathList: string[];
  onClick: () => void;
  children: React.ReactNode;
};

export const FolderBreadCrumb = ({ position, pathList, onClick, children }: Props) => {
  return (
    <div
      className={`breadcrumb relative z-20 ${
        position != null && position + 1 === pathList.length ? "cursor-default" : "cursor-pointer"
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
