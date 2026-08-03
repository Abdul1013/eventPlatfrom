/**
 * FeedbackToast Component
 *
 * Custom toast component for EventMerge validation feedback.
 * Displays Green (Valid), Amber (Warning), or Red (Invalid) feedback
 * with haptic feedback for mobile devices.
 *
 * Adheres to Apple HIG principles:
 * - Haptic feedback on state change
 * - Color-coded feedback (Green/Amber/Red)
 * - Auto-dismisses after 3 seconds
 * - Accessible and mobile-first
 */

"use client";

import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeedbackState = "valid" | "warning" | "invalid" | null;

export interface FeedbackToastProps {
  /**
   * Current feedback state: Valid (green), Warning (amber), or Invalid (red)
   */
  state: FeedbackState;

  /**
   * Message to display
   */
  message: string;

  /**
   * Optional: Time in milliseconds before auto-dismiss (default: 3000)
   */
  duration?: number;

  /**
   * Optional: Callback when toast dismisses
   */
  onDismiss?: () => void;

  /**
   * Optional: Enable haptic feedback (default: true on mobile)
   */
  enableHaptics?: boolean;
}

export function FeedbackToast({
  state,
  message,
  duration = 3000,
  onDismiss,
  enableHaptics = true,
}: FeedbackToastProps) {
  const [isVisible, setIsVisible] = useState(!!state);

  // Trigger haptic feedback based on state
  useEffect(() => {
    if (!state || !enableHaptics) return;

    const pattern = {
      valid: [30], // Short burst (success)
      warning: [50, 100, 50], // Double pulse (warning)
      invalid: [200, 100, 200], // Long pulse (error)
    }[state];

    if ("vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  }, [state, enableHaptics]);

  // Auto-dismiss after duration
  useEffect(() => {
    if (!state) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    const timer = setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [state, duration, onDismiss]);

  if (!state || !isVisible) {
    return null;
  }

  const config = {
    valid: {
      bgColor: "bg-success/10",
      borderColor: "border-success/30",
      textColor: "text-success",
      Icon: CheckCircle2,
      label: "Valid",
    },
    warning: {
      bgColor: "bg-warning/10",
      borderColor: "border-warning/30",
      textColor: "text-warning",
      Icon: AlertTriangle,
      label: "Warning",
    },
    invalid: {
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/30",
      textColor: "text-destructive",
      Icon: AlertCircle,
      label: "Invalid",
    },
  }[state];

  const { bgColor, borderColor, textColor, Icon, label } = config;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 right-4 md:bottom-6 md:right-6 md:left-auto md:w-96",
        "animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-right-4",
        "z-50 pointer-events-auto"
      )}
      role="status"
      aria-live="polite"
      aria-label={`${label}: ${message}`}
    >
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border px-4 py-3 md:px-5 md:py-4",
          "shadow-lg backdrop-blur-sm",
          bgColor,
          borderColor
        )}
      >
        {/* Icon */}
        <Icon className={cn("mt-0.5 shrink-0 size-5", textColor)} />

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium", textColor)}>{label}</p>
          <p className={cn("text-sm mt-1 break-words", textColor)}>
            {message}
          </p>
        </div>

        {/* Close Button (touch-target compliant) */}
        <button
          onClick={() => {
            setIsVisible(false);
            onDismiss?.();
          }}
          className={cn(
            "shrink-0 p-1 md:p-0.5 rounded-md transition-colors",
            "hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-background focus-visible:ring-foreground/20",
            textColor
          )}
          aria-label="Dismiss"
        >
          <X className="size-4 md:size-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Hook for managing FeedbackToast state
 *
 * @example
 * const { state, show, clear } = useFeedback();
 * 
 * // Show valid feedback
 * show("valid", "Ticket scanned successfully");
 * 
 * // Show invalid feedback
 * show("invalid", "QR code tampered or expired");
 */
export function useFeedback() {
  const [state, setState] = useState<FeedbackState>(null);
  const [message, setMessage] = useState("");

  const show = (feedbackState: FeedbackState, msg: string) => {
    setState(feedbackState);
    setMessage(msg);
  };

  const clear = () => {
    setState(null);
    setMessage("");
  };

  return { state, message, show, clear };
}
