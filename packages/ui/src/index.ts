// Shared UI components 
export { Button } from './components/Button';
export { Badge } from './components/Badge';
export { Spinner } from './components/Spinner';
export { LoadingSpinner } from './components/LoadingSpinner';
export { AdminShell } from './components/AdminShell';
export type { AdminShellProps, NavItem } from './components/AdminShell';
export { AttendeeShell } from './components/AttendeeShell';
export type { AttendeeShellProps, AttendeeNavItem } from './components/AttendeeShell';
export { NotFoundPage } from './components/NotFoundPage';
export type { NotFoundPageProps } from './components/NotFoundPage';
export { StatusBadge } from './components/StatusBadge';
export { StepIndicator } from './components/StepIndicator';
export type { StepIndicatorProps } from './components/StepIndicator';

// ─── Formatters ───────────────────────────────────────────────────────────────
export {
  formatNaira,
  formatNairaFromString,
  formatEventDate,
  formatDateShort,
  formatRelativeTime,
  formatSeatInfo,
} from './lib/formatters';

// ─── Utility components ───────────────────────────────────────────────────────
export { EmptyState } from './components/EmptyState';
export type { EmptyStateProps } from './components/EmptyState';
