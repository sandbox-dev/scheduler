import { ExternalLink } from "lucide-react";
import type { TimelineBuilderLink } from "@/lib/data";

// Job Details + School buttons into Timeline Builder (a separate site). Only
// shown for a job that's actually in Timeline Builder; School only once that
// job is linked to a school there.
export function TimelineBuilderLinks({ link }: { link: TimelineBuilderLink | undefined }) {
  const base = process.env.NEXT_PUBLIC_TIMELINE_BUILDER_URL;
  if (!link || !base) return null;
  return (
    <>
      <a href={`${base}/jobs/${link.jobId}/details`} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: 12 }}>
        <ExternalLink size={12} /> Job Details
      </a>
      {link.schoolId && (
        <a href={`${base}/schools/${link.schoolId}`} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: 12 }}>
          <ExternalLink size={12} /> School
        </a>
      )}
    </>
  );
}
