/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 *
 * Safety model (fixed allowlist):
 * - Commands are normalized first: harmless redirects to /dev/null and
 *   stderr/stdout fd redirects are removed, and `git -C <path>` / `-c <k>=<v>`
 *   flag prefixes are flattened so `git <subcommand>` patterns match.
 * - The normalized command is split into segments on `&&`, `||`, `;`, `|` and
 *   newlines (quote-aware, so `echo "a && b"` stays one segment).
 * - A command is safe iff EVERY segment is non-destructive AND matches an
 *   allowlist pattern. Unknown commands stay blocked.
 */

// Harmless redirect forms stripped before matching (they don't touch files).
// Covers: 2>/dev/null, >/dev/null, 1>/dev/null, &>/dev/null, >>/dev/null,
// 2>&1, 1>&2, 2>&- and whitespace variants.
const HARMLESS_REDIRECTS = [
  /\s*(?:[12]&?|&)?>>?\s*\/dev\/null\b/g,
  /\s*[12]?&>[12]\b/g,
  /\s*[12]>&-/g,
];

// Flatten `git -C <path> ...` / `git -c <k>=<v> ...` to `git ...`.
const GIT_FLAG_PREFIX = /\bgit(\s+-C\s+\S+|\s+-c\s+\S+)+\s+/gi;

function normalizeCommand(command: string): string {
  let normalized = command;
  for (const pattern of HARMLESS_REDIRECTS) {
    normalized = normalized.replace(pattern, " ");
  }
  normalized = normalized.replace(GIT_FLAG_PREFIX, "git ");
  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * Splits a command into segments on `&&`, `||`, `;`, `|` and newlines while
 * respecting single/double quotes and backslash escapes, so quoted operators
 * (e.g. `grep "a|b"`, `echo "a && b"`) stay inside one segment.
 */
function splitSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: string | undefined;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (quote) {
      current += ch;
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "\\") {
      current += ch + (command[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === "|" || ch === ";" || ch === "\n") {
      segments.push(current);
      current = "";
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      segments.push(current);
      current = "";
      i++;
      continue;
    }
    current += ch;
  }
  segments.push(current);

  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

// Destructive commands blocked in plan mode.
// The `>` patterns match redirects to real files; stderr/fd redirects and
// /dev/null targets are stripped by normalizeCommand first, and `->`/`2>`
// inside prose no longer match.
const DESTRUCTIVE_PATTERNS = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /\bshred\b/i,
  /(?:^|[\s;&|()])>/, // `> file` (truncate). `->`, `2>`, `&>` no longer match.
  /(?:^|\s)[12]>/, // `1> file` / `2> file` to a real file (2>/dev/null stripped above).
  />>/, // append redirect to a real file (>>/dev/null stripped above).
  /\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
  /\byarn\s+(add|remove|install|publish)/i,
  /\bpnpm\s+(add|remove|install|publish)/i,
  /\bpip\s+(install|uninstall)/i,
  /\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
  /\bbrew\s+(install|uninstall|upgrade)/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash\s+(push|save|pop|drop|apply|clear|create|store|branch)|cherry-pick|revert|tag|init|clone)/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)/i,
  /\bservice\s+\S+\s+(start|stop|restart)/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

// Safe read-only commands allowed in plan mode.
// Patterns are matched per segment after normalization.
const SAFE_PATTERNS = [
  // Navigation
  /^\s*cd\b/,
  // Basic read-only tools
  /^\s*cat\b/,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*less\b/,
  /^\s*more\b/,
  /^\s*grep\b/,
  /^\s*find\b/,
  /^\s*ls\b/,
  /^\s*pwd\b/,
  /^\s*echo\b/,
  /^\s*printf\b/,
  /^\s*wc\b/,
  /^\s*sort\b/,
  /^\s*uniq\b/,
  /^\s*diff\b/,
  /^\s*file\b/,
  /^\s*stat\b/,
  /^\s*du\b/,
  /^\s*df\b/,
  /^\s*tree\b/,
  /^\s*which\b/,
  /^\s*whereis\b/,
  /^\s*type\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
  /^\s*uname\b/,
  /^\s*whoami\b/,
  /^\s*id\b/,
  /^\s*date\b/,
  /^\s*cal\b/,
  /^\s*uptime\b/,
  /^\s*ps\b/,
  /^\s*top\b/,
  /^\s*htop\b/,
  /^\s*free\b/,
  // Read-only coreutils
  /^\s*(cut|tr|column|fmt|fold|tac|nl|od|xxd|hexdump|strings|readlink|realpath|basename|dirname)\b/,
  /^\s*(test|\[|true|false)\b/,
  /^\s*(base64|sha256sum|shasum|md5|md5sum)\b/,
  /^\s*openssl\s+dgst\b/,
  // Git (read-only subcommands; -C / -c flag prefixes are flattened by
  // normalization so `git -C /x status` matches `git status`)
  /\bgit\s+(status|log|diff|show|blame|grep|cat-file|rev-parse|remote\s+-v|remote\s+show|config\s+--get|help)\b/i,
  /\bgit\s+ls-/i,
  /\bgit\s+branch\s*(?:-[avr]|--list)?\s*$/i,
  // Package managers (read-only)
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
  /^\s*yarn\s+(list|info|why|audit)/i,
  // Version checks / typechecks (read-only)
  /^\s*node\s+(-v|--version)\b/i,
  /^\s*python3?\s+--version\b/i,
  /^\s*(npx|bunx|npm\s+exec|yarn)\s+.*\btsc\b.*--noEmit/i,
  /^\s*tsc\b.*--noEmit/i,
  // Network reads
  /^\s*curl\s/i,
  /^\s*wget\s+-O\s*-/i,
  // Data processing (stdin/stdout only)
  /^\s*jq\b/,
  /^\s*sed\s+-n/i,
  /^\s*awk\b/,
  /^\s*rg\b/,
  /^\s*fd\b/,
  /^\s*bat\b/,
  /^\s*eza\b/,
];

function isSafeSegment(segment: string): boolean {
  if (DESTRUCTIVE_PATTERNS.some((p) => p.test(segment))) return false;
  return SAFE_PATTERNS.some((p) => p.test(segment));
}

/**
 * Returns true when the whole (compound) command is safe: every segment must
 * be non-destructive and match the allowlist.
 */
export function isSafeCommand(command: string): boolean {
  const segments = splitSegments(normalizeCommand(command));
  if (segments.length === 0) return false;
  return segments.every(isSafeSegment);
}

/**
 * Returns a human-readable reason why a command is blocked, for use in the
 * steer message / block reason. Returns undefined when the command is safe.
 */
export function getUnsafeReason(command: string): string | undefined {
  const segments = splitSegments(normalizeCommand(command));
  if (segments.length === 0) return "empty command";

  for (const segment of segments) {
    const destructive = DESTRUCTIVE_PATTERNS.find((p) => p.test(segment));
    if (destructive) {
      return `"${segment}" matches destructive pattern ${destructive}`;
    }
  }
  for (const segment of segments) {
    if (!SAFE_PATTERNS.some((p) => p.test(segment))) {
      return `"${segment}" is not in the allowlist`;
    }
  }
  return undefined;
}
