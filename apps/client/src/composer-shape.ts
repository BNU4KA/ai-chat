export interface ComposerShape {
  hasText: boolean;
  multiline: boolean;
  tall: boolean;
}

export const EMPTY_SHAPE: ComposerShape = { hasText: false, multiline: false, tall: false };

export function composerShape(text: string, height: number): ComposerShape {
  return {
    hasText: !!text.trim(),
    multiline: text.includes('\n') || height > 28,
    tall: height >= 140,
  };
}

export function sameShape(a: ComposerShape, b: ComposerShape) {
  return a.hasText === b.hasText && a.multiline === b.multiline && a.tall === b.tall;
}
