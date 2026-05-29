export type ArrowType = '->' | '->>' | '-->' | '-->>' | '-x' | '--x';

export interface SequenceParticipant {
  id: string;
  label: string;
  type: 'participant' | 'actor';
}

export interface SequenceMessage {
  id: string;
  from: string;
  to: string;
  label: string;
  arrow: ArrowType;
}

export interface SequenceDiagram {
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
}
