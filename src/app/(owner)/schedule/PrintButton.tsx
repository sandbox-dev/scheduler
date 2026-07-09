import Link from "next/link";
import { Camera } from "lucide-react";

export function PrintButton({ weekStart }: { weekStart?: string }) {
  return (
    <Link
      href={weekStart ? `/print?week=${weekStart}` : "/print"}
      target="_blank"
      className="btn-secondary"
      style={{ marginLeft: 10 }}
    >
      <Camera size={14} /> Print weekly sheet
    </Link>
  );
}
