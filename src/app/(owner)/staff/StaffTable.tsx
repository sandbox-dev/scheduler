"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { Staff } from "@/lib/types";
import { StaffRow } from "./StaffRow";

export function StaffTable({ staff }: { staff: Staff[] }) {
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = staff.filter((s) => !s.active).length;
  const visible = showInactive ? staff : staff.filter((s) => s.active);

  return (
    <div>
      {inactiveCount > 0 && (
        <button
          className="btn-secondary"
          style={{ marginBottom: 12 }}
          onClick={() => setShowInactive((v) => !v)}
        >
          {showInactive ? <EyeOff size={14} /> : <Eye size={14} />}
          {showInactive ? "Hide inactive" : `Show inactive (${inactiveCount})`}
        </button>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Roles</th>
              <th>Categories</th>
              <th>Home city</th>
              <th>Priority</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <StaffRow key={s.id} staff={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
