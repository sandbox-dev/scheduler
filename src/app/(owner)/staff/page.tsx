import { getStaff } from "@/lib/data";
import { Card } from "@/components/ui";
import { AddStaffForm } from "./AddStaffForm";
import { StaffRow } from "./StaffRow";
import { SyncDistancesButton } from "./SyncDistancesButton";

export default async function StaffPage() {
  const staff = await getStaff();

  return (
    <div>
      <div className="display" style={{ fontSize: 21, fontWeight: 800, marginBottom: 4 }}>Staff roster</div>
      <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 16 }}>
        Seniority and distance drive the schedule ranking — distance is measured from each staff member&apos;s home
        city to the actual school, not the studio. Check every role a person can be slated for, and every category
        they&apos;re cleared to shoot.
      </div>

      <AddStaffForm />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
          After adding staff or a new school, click below to look up distances for any new pairs (cached forever
          after that — this never re-looks-up a pair it already has).
        </div>
        <SyncDistancesButton />
      </Card>

      <Card>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Roles</th>
              <th>Categories</th>
              <th>Home city</th>
              <th>Seniority</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <StaffRow key={s.id} staff={s} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
