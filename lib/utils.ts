import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatGb(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1024) return `${(value / 1024).toFixed(2)} TB`;
  if (value < 0.01 && value > 0) return `${(value * 1024).toFixed(1)} MB`;
  return `${value.toFixed(2)} GB`;
}

export function formatInt(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "—";
}
