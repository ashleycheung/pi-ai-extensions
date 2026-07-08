import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ExtensionAPI,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";

import Type from "typebox";

import { mkdtemp, writeFile } from "node:fs/promises";

import { tmpdir } from "os";

import { join } from "path";

/**

* Truncates a really long response

*/

async function handleTruncation(contents: string) {
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

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_fetch",

    label: "Fetches a webpage given a url",

    description: "Fetches a webpage given a url",

    promptSnippet: "Fetches a webpage given a url",

    promptGuidelines: [
      "Use the 'web_fetch' tool if you want to get the contents of a page at a given url",
    ],

    parameters: Type.Object({
      url: Type.String(),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx): Promise<any> {
      // Check for cancellation

      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Cancelled" }] };
      }

      // Stream progress updates

      onUpdate?.({
        content: [{ type: "text", text: `Fetching "${params.url}"` }],

        details: { progress: 50 },
      });

      const result = await pi.exec("percollate", ["md", "-o", "-", params.url]);

      const output = result.stdout.trim();

      if (!output) {
        if (result.code !== 0) {
          const err =
            result.stderr.trim() ||
            `percollate exited with code ${result.code}`;

          return { content: [{ type: "text", text: `Search failed: ${err}` }] };
        }

        return {
          content: [
            { type: "text", text: `No content found for "${params.url}"` },
          ],
        };
      }

      const resultText = await handleTruncation(result.stdout);

      return { content: [{ type: "text", text: resultText }] };
    },
  });
}
