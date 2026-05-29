import type { FlowGraph } from '$lib/types/graph';

const NODE_W = 160;
const NODE_H = 50;
const H_GAP = 80;
const V_GAP = 70;

export function computeLayout(
  graph: FlowGraph,
  existingPositions: Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const { nodes, edges, direction } = graph;

  // Preserve positions for nodes that were already placed
  const toPlace = nodes.filter((n) => !existingPositions.has(n.id));
  if (toPlace.length === 0) {
    // All nodes have positions, return them as-is
    for (const node of nodes) {
      const p = existingPositions.get(node.id);
      if (p) positions.set(node.id, { ...p });
    }
    return positions;
  }

  // Full re-layout for nodes not yet placed
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    if (!nodes.find((n) => n.id === edge.source) || !nodes.find((n) => n.id === edge.target))
      continue;
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // Assign layers via modified BFS (longest path layering)
  const layer = new Map<string, number>();
  const queue: string[] = [];

  for (const node of nodes) {
    if ((inDegree.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
      layer.set(node.id, 0);
    }
  }

  const bfsQueue = [...queue];
  while (bfsQueue.length > 0) {
    const id = bfsQueue.shift() as string;
    const currentLayer = layer.get(id) ?? 0;
    for (const child of adj.get(id) ?? []) {
      const childLayer = Math.max(layer.get(child) ?? 0, currentLayer + 1);
      layer.set(child, childLayer);
      bfsQueue.push(child);
    }
  }

  // Place unresolved nodes (cycles, isolated)
  let maxLayer = 0;
  for (const [, l] of layer) maxLayer = Math.max(maxLayer, l);
  for (const node of nodes) {
    if (!layer.has(node.id)) layer.set(node.id, maxLayer + 1);
  }

  // Group by layer
  const byLayer = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)?.push(id);
  }

  // Center layers
  const sortedLayers = Array.from(byLayer.keys()).sort((a, b) => a - b);
  const maxWidth = Math.max(...Array.from(byLayer.values()).map((ids) => ids.length));

  for (const l of sortedLayers) {
    const ids = byLayer.get(l) ?? [];
    for (let i = 0; i < ids.length; i++) {
      const offsetCentering = ((maxWidth - ids.length) * (NODE_W + H_GAP)) / 2;
      const horizontal = direction === 'LR' || direction === 'RL';
      const x = horizontal ? l * (NODE_W + H_GAP) : offsetCentering + i * (NODE_W + H_GAP);
      const y = horizontal ? i * (NODE_H + V_GAP) : l * (NODE_H + V_GAP);
      positions.set(ids[i], { x, y });
    }
  }

  // Merge preserved positions over computed ones
  for (const node of nodes) {
    const preserved = existingPositions.get(node.id);
    if (preserved) positions.set(node.id, { ...preserved });
  }

  return positions;
}
