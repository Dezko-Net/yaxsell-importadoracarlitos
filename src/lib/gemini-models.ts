// Single source of truth for the Gemini text models, in fallback priority
// order (first one is tried first; the rest are used only if it errors out).
//
// Default: gemini-3.1-flash-lite (cheapest/fastest, right tier for Yaxbot) with
// flash / 2.5-flash as resilience fallbacks.
//
// Override without touching code by setting the GEMINI_MODELS env var to a
// comma-separated list, e.g.  GEMINI_MODELS=gemini-3.5-flash,gemini-2.5-flash
const DEFAULT_TEXT_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

const fromEnv = process.env.GEMINI_MODELS
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const GEMINI_TEXT_MODELS: string[] =
  fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_TEXT_MODELS;
