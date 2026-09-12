import { validatePhrase } from '@/lib/poster/validate';

/**
 * Phrase pool behind the editor's RANDOMIZE button. Same register as the
 * gallery seeds - everyday lines with a shape to them, not slogans - and
 * deliberately disjoint from them, so a random draw never lands on a poster
 * the gallery already shows.
 *
 * The renderer upper-cases the phrase itself, so these stay lowercase to
 * match what the textarea shows for the default phrase.
 */
export const RANDOM_PHRASES: readonly string[] = [
  'nobody reads the second page',
  'the kettle is always empty',
  'wear the coat you like',
  'every plan survives until monday',
  'leave room for one more chair',
  'the last bus is a rumour',
  'bring the good scissors back',
  'small rooms hold louder ideas',
  'we agreed on nothing again',
  'the printer knows what it did',
  'turn left at the noise',
  'nobody owns the corner table',
  'two coffees and a decision',
  'the fridge hums in c minor',
  'stop apologising to the door',
  'good ideas arrive at midnight',
  'the dog picked this route',
  'paint it before you explain it',
  'everybody lies about their sleep',
  'the shortcut was never shorter',
  'keep one drawer completely empty',
  'we are late by design',
  'the plant survived without us',
  'answer it tomorrow instead',
];

// Load-time check rather than a comment promising the limits hold: a phrase
// added later that breaks the word or character bounds would otherwise reach
// the editor as a silent validation error under a button the user just
// pressed, with nothing pointing back at this list.
for (const phrase of RANDOM_PHRASES) {
  const result = validatePhrase(phrase);
  if (!result.ok) {
    throw new Error(
      `RANDOM_PHRASES contains an invalid phrase: "${phrase}" (${result.issues
        .map((issue) => issue.code)
        .join(', ')})`,
    );
  }
}
