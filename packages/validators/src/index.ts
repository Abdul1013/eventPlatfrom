import { z } from 'zod';

// ─── Shared primitive validators ──────────────────────────────────────────────

export const emailSchema = z.string().email('Invalid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const uuidSchema = z.string().uuid('Invalid ID format');

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── Auth schemas (with complexity rules + UI variants with confirmPassword) ──
export {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  registerFormSchema,
  resetPasswordFormSchema,
  type RegisterInput,
  type LoginInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type RegisterFormValues,
  type ResetPasswordFormValues,
} from './auth.schemas';
