/**
 * Truncation utility for long command outputs.
 */
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Truncates a really long response
 */
export async function handleTruncation(contents: string) {
  // Apply truncation
  const truncation = truncateHead(contents, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let resultText = truncation.content;

  if (truncation.truncated) {
    // Save full output to a temp file so LLM can access it if needed
    const tempDir = await mkdtemp(join(tmpdir(), "pi-rg-"));
    const tempFile = join(tempDir, "output.txt");
    await withFileMutationQueue(tempFile, async () => {
      await writeFile(tempFile, contents, "utf8");
    });

    // Add truncation notice - this helps the LLM understand the output is incomplete
    const truncatedLines = truncation.totalLines - truncation.outputLines;
    const truncatedBytes = truncation.totalBytes - truncation.outputBytes;

    resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
    resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(
      truncation.totalBytes
    )}).`;
    resultText += ` ${truncatedLines} lines (${formatSize(
      truncatedBytes
    )}) omitted.`;
    resultText += ` Full output saved to: ${tempFile}]`;
  }
  return resultText;
}
