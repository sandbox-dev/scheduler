import { monthLabel } from "@/lib/month";

export function MonthPicker({
  month,
  months,
  monthsWithData,
}: {
  month: string;
  months: string[];
  monthsWithData: string[];
}) {
  const options = months.includes(month) ? months : [...months, month].sort();

  return (
    <form method="get" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginBottom: 5 }}>Month</div>
        <select className="field-select" name="month" defaultValue={month}>
          {options.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
              {monthsWithData.includes(m) ? "" : " (no Picture Days)"}
            </option>
          ))}
        </select>
      </div>
      <button className="btn-secondary" type="submit">
        View
      </button>
    </form>
  );
}
