import dagre from '@dagrejs/dagre';
import type { FlowGraph } from '$lib/types/graph';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;

export interface PositionedNode {
  id: string;
  position: { x: number; y: number };
}

export function applyDagreLayout(graph: FlowGraph): PositionedNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  const rankdir =
    graph.direction === 'LR'
      ? 'LR'
      : graph.direction === 'RL'
        ? 'RL'
        : graph.direction === 'BT'
          ? 'BT'
          : 'TB';

  g.setGraph({ rankdir, nodesep: 60, ranksep: 80 });

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return graph.nodes.map((node) => {
    const { x, y } = g.node(node.id);
    return {
      id: node.id,
      position: {
        x: x - NODE_WIDTH / 2,
        y: y - NODE_HEIGHT / 2
      }
    };
  });
}
