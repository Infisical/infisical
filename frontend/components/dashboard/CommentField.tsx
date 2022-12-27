/**
 * This is the text field where people can add comments to particular secrets.
 */
const CommentField = ({ comment, modifyComment, position }: { comment: string; modifyComment: (value: string, posistion: number) => void; position: number;}) => {
  return <div className={`relative mt-4 px-4 pt-4`}>
    <p className='text-sm text-bunker-300'>Comments & notes</p>
    <textarea 
      className="bg-bunker-800 h-32 w-full bg-bunker-800 p-2 rounded-md border border-mineshaft-500 text-sm text-bunker-300 outline-none focus:ring-2 ring-primary-800 ring-opacity-70"
      value={comment}
      onChange={(e) => modifyComment(e.target.value, position)}
      placeholder="Leave any comments here..."
    />
  </div>
}

export default CommentField;
