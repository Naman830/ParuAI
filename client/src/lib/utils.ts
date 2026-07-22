import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import axios from "axios"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalises anything thrown by axios/JS into a user-facing string.
 * Replaces the `catch (error: any) => error?.response?.data?.message ||
 * error.message` pattern that was copy-pasted into every handler (and crashed
 * on non-Error throws).
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message
  }
  if (error instanceof Error) return error.message
  return "Something went wrong. Please try again."
}
