'use client';

import { useMessages } from '@/lib/i18n/locale-client';
import type { ModuleCategory } from '@/lib/detection-modules';
import { categoryAccent } from './icon-map';

interface Props {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
}

export function CategoryFilter({ categories, selected, onSelect }: Props) {
  const m = useMessages();
  const labelFor = (c: string): string => {
    if (c === 'all') return m.category.all;
    return m.category[c as ModuleCategory] ?? c;
  };
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={m.category.all}>
      {categories.map(category => {
        const isActive = selected === category;
        const accent = category !== 'all' ? categoryAccent[category as ModuleCategory] : null;

        return (
          <button
            key={category}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onSelect(category)}
            className={`
              inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
              text-xs font-medium transition-colors outline-none
              focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1
              focus-visible:ring-offset-background
              ${
                isActive
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
              }
            `}
          >
            {accent && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-background' : accent.dot}`}
                aria-hidden="true"
              />
            )}
            {labelFor(category)}
          </button>
        );
      })}
    </div>
  );
}
