/* Kept dependency-free so client components can build hood URLs without
   pulling the editorial content JSON into the browser bundle. */
export function slugifyHood(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
