import type { EventStatus, TicketStatus } from '@eventmerge/types';

const STATUS_COLORS: Record<string, string> = {
  DRAFT:       'bg-gray-100 text-gray-600',
  PUBLISHED:   'bg-indigo-100 text-indigo-700',
  ONGOING:     'bg-emerald-100 text-emerald-700',
  ENDED:       'bg-gray-200 text-gray-500',
  CANCELLED:   'bg-red-100 text-red-600',
  ACTIVE:      'bg-gray-100 text-gray-600',
  USED:        'bg-emerald-100 text-emerald-700',
  TRANSFERRED: 'bg-amber-100 text-amber-700',
};

interface StatusBadgeProps {
  status: EventStatus | TicketStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors} ${className}`}>
      {label}
    </span>
  );
}
