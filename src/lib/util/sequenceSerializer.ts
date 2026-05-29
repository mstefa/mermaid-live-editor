import type { SequenceDiagram } from '$lib/types/sequence';

export function modelToSequence(diagram: SequenceDiagram): string {
  const lines = ['sequenceDiagram'];

  for (const p of diagram.participants) {
    if (p.label !== p.id) {
      lines.push(`    ${p.type} ${p.id} as ${p.label}`);
    } else {
      lines.push(`    ${p.type} ${p.id}`);
    }
  }

  for (const m of diagram.messages) {
    const label = m.label ? `: ${m.label}` : '';
    lines.push(`    ${m.from}${m.arrow}${m.to}${label}`);
  }

  return lines.join('\n');
}
