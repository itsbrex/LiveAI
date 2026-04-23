import type { AxChatLogEntry } from '../../dsp/types.js';
import type { AxAgentGuidancePayload } from '../completion.js';
import type { AxAgentGuidanceLogEntry } from './types.js';

/**
 * Extract plain {role, content} messages from the actor's chat log,
 * skipping tool-result entries that can't be serialized cleanly.
 */
export function snapshotChatLogMessages(
  chatLog: readonly AxChatLogEntry[]
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  for (const entry of chatLog) {
    for (const msg of entry.messages) {
      if (msg.role === 'tool') continue;
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  return messages;
}

export function renderGuidanceLog(
  entries: readonly AxAgentGuidanceLogEntry[]
): string | undefined {
  if (entries.length === 0) {
    return undefined;
  }

  return entries
    .map(
      (entry) =>
        `- ${entry.triggeredBy ?? '(unknown function)'}, ${entry.guidance.replace(/\s+/g, ' ').trim()}`
    )
    .join('\n');
}

export function buildGuidanceActionLogOutput(
  payload: Readonly<AxAgentGuidancePayload>
): string {
  const functionName = payload.triggeredBy ?? '(unknown function)';
  return `Execution stopped at \`${functionName}\`. Guidance recorded in \`guidanceLog\`.`;
}

export function buildGuidanceActionLogCode(
  payload: Readonly<AxAgentGuidancePayload>
): string {
  const functionName = payload.triggeredBy ?? '(unknown function)';
  return `await ${functionName}(...)`;
}
