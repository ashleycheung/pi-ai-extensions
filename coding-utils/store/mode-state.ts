/**
 * Shared mutable mode state.
 *
 * Uses a shared mutable object instead of `export let` to ensure
 * cross-module changes are visible under CommonJS transpilation.
 * Babel's plugin-transform-modules-commonjs compiles `export let` to
 * `let x = exports.x = value`, where reassignment only updates the
 * local variable but not the exports object. By keeping the object
 * reference constant (const) and only mutating its properties, other
 * modules always see the current value.
 */
import { AIMode } from "./mode-messages";

export const modeState = {
  mode: AIMode.None as AIMode,
  hasSentInitialModeMessage: false,
  showModeMessage: false,
};
