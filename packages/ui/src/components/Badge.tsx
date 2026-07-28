import { clsx } from 'clsx';

type Color = 'indigo' | 'cyan' | 'green' | 'yellow' | 'red' | 'gray';

interface BadgeProps {
  label: string;
  color?: Color;
  icon?: React.ReactNode;
}

const colorClasses: Record<Color, string> = {
  indigo: 'bg-indigo-100 text-indigo-700',
  cyan: 'bg-cyan-100 text-cyan-700',
  green: 'bg-emerald-100 text-emerald-700',
  yellow: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-700',
};

export const Badge = ({ label, color = 'gray', icon }: BadgeProps) => (
  <span
    className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      colorClasses[color],
    )}
  >
    {icon}
    {label}
  </span>
);
