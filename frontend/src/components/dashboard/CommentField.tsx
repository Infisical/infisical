import { useTranslation } from 'next-i18next';

/**
 * This is the text field where people can add comments to particular secrets.
 */
const CommentField = ({
  comment,
  modifyComment,
  position
}: {
  comment: string;
  modifyComment: (value: string, posistion: number) => void;
  position: number;
}) => {
  const { t } = useTranslation();

  return (
    <div className="relative mt-4 px-4 pt-6">
      <p className="text-sm text-bunker-300 pl-0.5">{t('dashboard:sidebar.comments')}</p>
      <textarea
        className="placeholder:text-bunker-400 dark:[color-scheme:dark] h-32 w-full bg-bunker-800 px-2 py-1.5 rounded-md border border-mineshaft-500 text-sm text-bunker-300 outline-none focus:ring-2 ring-primary-800 ring-opacity-70"
        value={comment}
        onChange={(e) => modifyComment(e.target.value, position)}
        placeholder="Leave any comments here..."
      />
    </div>
  );
};

export default CommentField;
