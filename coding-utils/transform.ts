/**
 * Command transformation utilities for grep and find commands.
 */

const IGNORE_DIRS = ["node_modules", "dist", "build"];

/**
 * Exclude all the directories from grep
 */
export function transformGrepCommands(bash: string) {
  let transformedBash = bash;
  transformedBash = transformedBash.replace(
    /\bgrep\b/g,
    `grep ${IGNORE_DIRS.map((dir) => `--exclude-dir=${dir}`).join(" ")}`
  );
  return transformedBash;
}

/**
 * Add exclude directories to find
 */
export function transformFindCommands(bash: string) {
  let transformedBash = bash;
  transformedBash = transformedBash.replace(
    /\bfind \S+(?=\s+-|\s+\||$)/g,
    (match) =>
      `${match} ${IGNORE_DIRS.map((dir) => `-name "${dir}" -prune -o`).join(
        " "
      )}`
  );
  return transformedBash;
}
