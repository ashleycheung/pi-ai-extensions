/**
 * Formatting utilities.
 */

/**
 * Convert a hex color to an ANSI escape sequence for terminal output.
 */
export function hexAnsi(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (text: string) => `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}
