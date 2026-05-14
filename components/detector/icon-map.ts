import { Bug, Fingerprint, Globe, Image, Monitor, Network, Type, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ModuleCategory } from '@/lib/detection-modules';

export const iconMap: Record<string, LucideIcon> = {
  Network,
  Browser: Monitor,
  Fingerprint,
  Image,
  Volume2,
  Type,
  Globe,
  Monitor,
  Bug,
};

export function resolveIcon(name: string): LucideIcon {
  return iconMap[name] ?? Network;
}

/**
 * Tailwind class fragments for category accents. Uses semantic CSS variables
 * (defined in globals.css) so light/dark themes share the same source of truth.
 */
export const categoryAccent: Record<
  ModuleCategory,
  { dot: string; tint: string; ring: string; text: string }
> = {
  network: {
    dot: 'bg-[hsl(var(--cat-network))]',
    tint: 'bg-[hsl(var(--cat-network)/0.12)] text-[hsl(var(--cat-network))]',
    ring: 'ring-[hsl(var(--cat-network)/0.35)]',
    text: 'text-[hsl(var(--cat-network))]',
  },
  browser: {
    dot: 'bg-[hsl(var(--cat-browser))]',
    tint: 'bg-[hsl(var(--cat-browser)/0.12)] text-[hsl(var(--cat-browser))]',
    ring: 'ring-[hsl(var(--cat-browser)/0.35)]',
    text: 'text-[hsl(var(--cat-browser))]',
  },
  hardware: {
    dot: 'bg-[hsl(var(--cat-hardware))]',
    tint: 'bg-[hsl(var(--cat-hardware)/0.12)] text-[hsl(var(--cat-hardware))]',
    ring: 'ring-[hsl(var(--cat-hardware)/0.35)]',
    text: 'text-[hsl(var(--cat-hardware))]',
  },
  privacy: {
    dot: 'bg-[hsl(var(--cat-privacy))]',
    tint: 'bg-[hsl(var(--cat-privacy)/0.12)] text-[hsl(var(--cat-privacy))]',
    ring: 'ring-[hsl(var(--cat-privacy)/0.35)]',
    text: 'text-[hsl(var(--cat-privacy))]',
  },
  other: {
    dot: 'bg-[hsl(var(--cat-other))]',
    tint: 'bg-[hsl(var(--cat-other)/0.12)] text-[hsl(var(--cat-other))]',
    ring: 'ring-[hsl(var(--cat-other)/0.35)]',
    text: 'text-[hsl(var(--cat-other))]',
  },
};
