import type { EdgeType, FlowGraph, GraphNode } from '$lib/types/graph';

function formatNodeSpec(node: GraphNode): string {
  const { id, label, shape } = node;
  const safeLabel = label.replace(/"/g, '#quot;');
  switch (shape) {
    case 'rect':
      return `${id}[${safeLabel}]`;
    case 'rounded':
      return `${id}(${safeLabel})`;
    case 'diamond':
      return `${id}{${safeLabel}}`;
    case 'circle':
      return `${id}((${safeLabel}))`;
    case 'stadium':
      return `${id}([${safeLabel}])`;
    default:
      return label !== id ? `${id}[${safeLabel}]` : id;
  }
}

function formatConnector(type: EdgeType): string {
  switch (type) {
    case 'open':
      return ' --- ';
    case 'dotted':
      return ' -.-> ';
    case 'thick':
      return ' ==> ';
    default:
      return ' --> ';
  }
}

export function graphToMermaid(graph: FlowGraph): string {
  const { direction, nodes, edges } = graph;
  const lines: string[] = [`flowchart ${direction}`];

  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  const emittedNodes = new Set<string>();

  function nodeSpec(id: string): string {
    const node = nodes.find((n) => n.id === id);
    if (!node) return id;
    if (emittedNodes.has(id)) return id;
    emittedNodes.add(id);
    return formatNodeSpec(node);
  }

  for (const edge of edges) {
    const src = nodeSpec(edge.source);
    const tgt = nodeSpec(edge.target);
    const connector = formatConnector(edge.type);
    const label = edge.label ? `|${edge.label}|` : '';
    lines.push(`    ${src}${connector}${label}${tgt}`);
  }

  for (const node of nodes) {
    if (!connectedIds.has(node.id)) {
      lines.push(`    ${formatNodeSpec(node)}`);
    }
  }

  // Emit style lines for colored nodes
  for (const node of nodes) {
    if (node.color) {
      lines.push(`    style ${node.id} fill:${node.color},stroke:${darken(node.color)}`);
    }
  }

  return lines.join('\n');
}

function darken(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - 40);
  const g = Math.max(0, ((n >> 8) & 0xff) - 40);
  const b = Math.max(0, (n & 0xff) - 40);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
