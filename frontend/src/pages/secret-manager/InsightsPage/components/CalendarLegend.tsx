export const CalendarLegend = () => {
  return (
    <div className="float-right mt-3 -mb-2 flex items-center gap-4">
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-info" />
        <span className="text-xs text-muted">Rotation</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-warning" />
        <span className="text-xs text-muted">Reminder</span>
      </div>
    </div>
  );
};
