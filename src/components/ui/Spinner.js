/**
 * @file Loading spinners, shared so every loading state looks the same.
 */

/** The spinning ring on its own (use inside custom layouts/overlays). */
export function Spinner() {
  return (
    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
  );
}

/** Spinner centred in the page body — used while a page loads its data. */
export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner />
    </div>
  );
}
