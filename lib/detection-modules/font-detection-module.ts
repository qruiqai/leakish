import type { DetectionModule, DetectionResult } from './types';

export interface FontDetectionData {
  installedFonts: string[];
  totalFonts: number;
  commonFonts: string[];
  uniqueFonts: string[];
}

const TEST_FONTS: readonly string[] = [
  'Arial',
  'Arial Black',
  'Comic Sans MS',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Impact',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Palatino Linotype',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Microsoft Sans Serif',
  'Calibri',
  'Cambria',
  'Candara',
  'Consolas',
  'Constantia',
  'Corbel',
  'Franklin Gothic Medium',
  'Segoe UI',
  'Apple Symbols',
  'Menlo',
  'Monaco',
  'Optima',
  'Hoefler Text',
  'Plaster',
  'Engagement',
  'Federant',
  'Inknut Antiqua',
  'Orbitron',
  'Righteous',
  'Vampiro One',
  'BioRhyme',
  'Space Mono',
  'Changa One',
  'Fascinate',
  'Nosifer',
  'Wallpoet',
  'Creepster',
];

const COMMON_SYSTEM_FONTS: ReadonlySet<string> = new Set([
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Georgia',
  'Tahoma',
  'Trebuchet MS',
  'Arial Black',
  'Impact',
]);

async function detectFonts(): Promise<FontDetectionData> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for font detection');

  const testText = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const fontSize = '72px';
  const baselineFont = `${fontSize} monospace`;

  const measure = (font: string) => {
    ctx.font = font;
    return ctx.measureText(testText).width;
  };

  const baselineWidth = measure(baselineFont);

  const installedFonts: string[] = [];
  for (const font of TEST_FONTS) {
    const width = measure(`${fontSize} "${font}", monospace`);
    if (Math.abs(baselineWidth - width) > 1) {
      installedFonts.push(font);
    }
  }

  const commonFonts = installedFonts.filter(f => COMMON_SYSTEM_FONTS.has(f));
  const uniqueFonts = installedFonts.filter(f => !COMMON_SYSTEM_FONTS.has(f));

  return {
    installedFonts,
    totalFonts: installedFonts.length,
    commonFonts,
    uniqueFonts,
  };
}

export const fontDetectionModule: DetectionModule<FontDetectionData> = {
  id: 'font-detection',
  name: 'Font detection',
  description: 'Probe installed system fonts via Canvas text-width measurement',
  category: 'browser',
  icon: 'Type',
  enabled: true,
  detect: async (): Promise<DetectionResult<FontDetectionData>> => {
    try {
      const data = await detectFonts();
      return {
        success: true,
        data,
        detectedAt: new Date(),
        metadata: {
          totalFonts: data.totalFonts,
          commonFontCount: data.commonFonts.length,
          uniqueFontCount: data.uniqueFonts.length,
          hasUniqueFonts: data.uniqueFonts.length > 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Font detection failed',
        detectedAt: new Date(),
      };
    }
  },
};
