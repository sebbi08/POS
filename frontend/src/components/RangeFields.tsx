interface Props {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

const inputClass =
  "bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700";

function RangeFields({ from, to, onFromChange, onToChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-gray-400 text-sm flex items-center gap-2">
        Von
        <input type="date" className={inputClass} value={from} onChange={(e) => onFromChange(e.target.value)} />
      </label>
      <label className="text-gray-400 text-sm flex items-center gap-2">
        Bis
        <input type="date" className={inputClass} value={to} onChange={(e) => onToChange(e.target.value)} />
      </label>
    </div>
  );
}

export default RangeFields;
