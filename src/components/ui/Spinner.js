/**
 * @file Loading spinners, shared so every loading state looks the same.
 */

/** The spinning ring on its own (use inside custom layouts/overlays). */
export function Spinner() {
  return (
    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
  );
}

/** Spinner centred on the whole screen — used while checking who is signed in. */
export function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-paper-dark">
      <Spinner />
    </div>
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
