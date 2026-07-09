import { Nav } from "@/components/Nav";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Nav />
      <div className="no-print" style={{ padding: 24, maxWidth: 1040, margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}
