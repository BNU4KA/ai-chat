export function collapseAttempts<T extends { role: string }>(messages: T[]): T[] {
  return messages.filter(
    (message, index) => message.role !== 'assistant' || messages[index + 1]?.role !== 'assistant',
  );
}
