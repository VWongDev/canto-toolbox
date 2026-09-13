import HanziWriter from 'hanzi-writer';
import { loadStrokes } from '../shared/strokes.js';
import type { FlashcardRating } from '../shared/types.js';

/**
 * The stroke-order card. It is the only card in the deck that can grade
 * itself: every other direction asks the reader how well they knew the answer,
 * but a quiz counts exactly how many strokes went in the wrong place, so the
 * rating is measured rather than reported.
 */

/** Size of the practice grid, in CSS pixels. */
const QUIZ_SIZE = 260;
const QUIZ_PADDING = 12;

/** Misses before the correct stroke is shown. */
const HINT_AFTER_MISSES = 3;

/**
 * Misses before the stroke is marked correct anyway. Without this a reader who
 * cannot find a stroke is stuck: the card has no rating buttons to press past,
 * so the quiz has to be able to end on its own.
 */
const SKIP_AFTER_MISSES = 5;

/** Mistakes past which the reader did not know the character's stroke order. */
const FAILING_MISTAKES = 3;

/**
 * Mistakes → the grade FSRS hears. "Easy" is never awarded: a clean quiz means
 * the strokes were recalled, not that the card should be pushed out furthest,
 * and the reader has no button to disagree with.
 */
export function ratingForMistakes(mistakes: number): FlashcardRating {
  if (mistakes === 0) return 'good';
  return mistakes < FAILING_MISTAKES ? 'hard' : 'again';
}

/**
 * hanzi-writer paints an SVG rather than inheriting CSS, so it has to be
 * handed colours. They are read off the page's own palette — which resolves
 * per theme on its own — instead of being a second set kept in step by hand:
 * the ones that used to be here belonged to no palette in the extension.
 *
 * The fallbacks are the light palette, for a document that has not painted
 * yet or a test environment that computes no styles.
 */
export function quizColors(
  root: Element | undefined = globalThis.document?.documentElement,
): { outlineColor: string; strokeColor: string; drawingColor: string } {
  const styles = root ? globalThis.getComputedStyle?.(root) : undefined;
  const read = (name: string, fallback: string): string =>
    styles?.getPropertyValue(name).trim() || fallback;

  return {
    outlineColor: read('--ct-quiz-outline', '#dadce0'),
    strokeColor: read('--ct-quiz-stroke', '#1a1a1a'),
    drawingColor: read('--ct-quiz-drawing', '#0066cc'),
  };
}

export interface WritingQuiz {
  /** Resolves with the total mistakes once every stroke is drawn. */
  completed: Promise<number>;
  /** Abandon the quiz when the card it belongs to is discarded. */
  cancel(): void;
}

/**
 * Draw the character's outline into `target` and quiz the reader on its
 * strokes. The outline is deliberately shown: this card tests the *order* of
 * the strokes, and withholding the character would make it a recall card the
 * deck already has two of.
 */
export function startQuiz(target: HTMLElement, character: string): WritingQuiz {
  let settle: ((mistakes: number) => void) | undefined;
  const completed = new Promise<number>(resolve => {
    settle = resolve;
  });

  const writer = HanziWriter.create(target, character, {
    width: QUIZ_SIZE,
    height: QUIZ_SIZE,
    padding: QUIZ_PADDING,
    showCharacter: false,
    showOutline: true,
    showHintAfterMisses: HINT_AFTER_MISSES,
    markStrokeCorrectAfterMisses: SKIP_AFTER_MISSES,
    ...quizColors(),
    // The strokes are packaged with the extension, so the library's own CDN
    // loader must never be reached for.
    charDataLoader: (char, onLoad, onError) => {
      void loadStrokes(char).then(data => {
        if (data) onLoad(data);
        else onError(new Error(`No stroke data for ${char}`));
      });
    },
  });

  void writer.quiz({
    onComplete: ({ totalMistakes }) => settle?.(totalMistakes),
  });

  return {
    completed,
    cancel: () => writer.cancelQuiz(),
  };
}
