import "server-only";

const METERS_PER_MILE = 1609.344;

// Distance Matrix API allows up to 25 origins per request; keep destinations
// to one school at a time to keep requests small and easy to reason about.
const MAX_ORIGINS_PER_REQUEST = 25;

type DistanceResult = { origin: string; miles: number | null };

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Looks up round-trip-equivalent driving distance (one-way, in miles) from
// each origin address/city to a single destination address/city.
export async function lookupDistancesToDestination(
  origins: string[],
  destination: string
): Promise<DistanceResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");

  const results: DistanceResult[] = [];

  for (const batch of chunk(origins, MAX_ORIGINS_PER_REQUEST)) {
    const params = new URLSearchParams({
      origins: batch.join("|"),
      destinations: destination,
      units: "imperial",
      key: apiKey,
    });

    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);
    if (!res.ok) throw new Error(`Distance Matrix API request failed: ${res.status}`);
    const data = await res.json();

    if (data.status !== "OK") {
      throw new Error(`Distance Matrix API error: ${data.status} ${data.error_message || ""}`.trim());
    }

    batch.forEach((origin, i) => {
      const element = data.rows[i]?.elements?.[0];
      const miles = element?.status === "OK" ? element.distance.value / METERS_PER_MILE : null;
      results.push({ origin, miles: miles !== null ? +miles.toFixed(1) : null });
    });
  }

  return results;
}
