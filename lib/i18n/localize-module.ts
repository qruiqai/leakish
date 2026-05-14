import type { DetectionModule } from '@/lib/detection-modules';
import type { Messages } from '@/lib/i18n/messages';

/**
 * Resolve a detection module's display strings via i18n, falling back to the
 * module constant if a locale is missing an entry. Module constants stay as
 * the source-of-truth shape; locale files override the user-visible copy.
 */
export function localizeModule(
  m: Messages,
  module: DetectionModule
): { name: string; description: string } {
  const entry = (m.modules as Record<string, { name?: string; description?: string } | undefined>)[
    module.id
  ];
  return {
    name: entry?.name ?? module.name,
    description: entry?.description ?? module.description,
  };
}
