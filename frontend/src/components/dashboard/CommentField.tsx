import { useTranslation } from "react-i18next";

/**
 * This is the text field where people can add comments to particular secrets.
 */
const CommentField = ({
  comment,
  modifyComment,
  id
}: {
  comment: string;
  modifyComment: (value: string, id: string) => void;
  id: string;
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative mt-4 px-4 pt-6">
      <p className="pl-0.5 text-sm text-bunker-300">{t("dashboard.sidebar.comments")}</p>
      <textarea
        className="h-32 w-full rounded-md border border-mineshaft-500 bg-bunker-800 px-2 py-1.5 text-sm text-bunker-300 outline-none ring-primary-800 ring-opacity-70 placeholder:text-bunker-400 focus:ring-2 dark:[color-scheme:dark]"
        value={comment}
        onChange={(e) => modifyComment(e.target.value, id)}
        placeholder="Leave any comments here..."
      />
    </div>
  );
};

export default CommentField;
