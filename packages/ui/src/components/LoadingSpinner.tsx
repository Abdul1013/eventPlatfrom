import { Spinner } from './Spinner';

/** Full-screen centred spinner — used as a Suspense / auth-gate fallback. */
export function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
