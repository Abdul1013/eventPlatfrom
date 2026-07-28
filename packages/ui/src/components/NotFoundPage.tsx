import { type ReactNode } from 'react';

export interface NotFoundPageProps {
  /**
   * Optional back-link rendered below the description.
   * The consuming app passes a framework-aware `<Link>` component here.
   * Falls back to a plain `<a href="/">` if omitted.
   */
  backLink?: ReactNode;
}

export function NotFoundPage({ backLink }: NotFoundPageProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 px-4">
      <p className="text-8xl font-extrabold text-gray-200 select-none">404</p>
      <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
      <p className="text-gray-500 text-sm">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      {backLink ?? (
        <a href="/" className="mt-2 text-sm font-medium text-indigo-600 hover:underline">
          Go back home
        </a>
      )}
    </div>
  );
}
