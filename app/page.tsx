import { redirect } from "next/navigation";

// Forward the full query string so Prolific's PROLIFIC_PID / STUDY_ID / SESSION_ID
// reach /consent, where they are captured into sessionStorage.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, v);
    }
  }
  const qs = params.toString();
  redirect(qs ? `/consent?${qs}` : "/consent");
}
