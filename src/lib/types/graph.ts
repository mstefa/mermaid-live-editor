export type NodeShape = 'rect' | 'rounded' | 'diamond' | 'circle' | 'stadium' | 'default';
export type EdgeType = 'arrow' | 'open' | 'dotted' | 'thick';
export type Direction = 'TD' | 'LR' | 'BT' | 'RL';

export interface GraphNode {
  id: string;
  label: string;
  shape: NodeShape;
  color?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: EdgeType;
}

export interface FlowGraph {
  direction: Direction;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
