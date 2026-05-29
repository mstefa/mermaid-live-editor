import type {
  ArrowType,
  SequenceDiagram,
  SequenceMessage,
  SequenceParticipant
} from '$lib/types/sequence';

const ARROWS: ArrowType[] = ['-->>', '->>', '-->', '-x', '--x', '->'];

export function sequenceToModel(code: string): SequenceDiagram | null {
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines[0]?.toLowerCase().startsWith('sequencediagram')) return null;

  const participants: SequenceParticipant[] = [];
  const messages: SequenceMessage[] = [];
  let msgCount = 0;

  // Ensure a participant exists, creating it if needed
  function ensureParticipant(id: string) {
    if (!participants.find((p) => p.id === id)) {
      participants.push({ id, label: id, type: 'participant' });
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('%%')) continue;

    // participant / actor declarations
    const pMatch = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(line);
    if (pMatch) {
      const id = pMatch[2].trim();
      const label = pMatch[3]?.trim() ?? id;
      const type = pMatch[1] as 'participant' | 'actor';
      if (!participants.find((p) => p.id === id)) {
        participants.push({ id, label, type });
      }
      continue;
    }

    // Message lines: From ArrowType To: Label
    const arrow = ARROWS.find((a) => line.includes(a));
    if (arrow) {
      const arrowIdx = line.indexOf(arrow);
      const from = line.slice(0, arrowIdx).trim();
      const rest = line.slice(arrowIdx + arrow.length).trim();
      const colonIdx = rest.indexOf(':');
      const to = colonIdx >= 0 ? rest.slice(0, colonIdx).trim() : rest.trim();
      const label = colonIdx >= 0 ? rest.slice(colonIdx + 1).trim() : '';

      ensureParticipant(from);
      ensureParticipant(to);
      messages.push({ arrow, from, id: `m${msgCount++}`, label, to });
    }
  }

  if (participants.length === 0 && messages.length === 0) return null;
  return { participants, messages };
}
