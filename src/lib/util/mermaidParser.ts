import type { Direction, EdgeType, FlowGraph, GraphEdge, GraphNode } from '$lib/types/graph';

const DIRECTION_RE = /^(?:flowchart|graph)\s+(TD|LR|BT|RL|TB)/i;

// Supported connectors — longer patterns must come first to avoid partial matches
const CONNECTOR_RE = /===>|==>|===|<-->|-.->|-\.-|--o|--x|-->|---/;

// Optional edge label between pipes: |label|
const EDGE_LABEL_RE = /\|([^|]*)\|/;

function parseNodeSpec(spec: string): GraphNode {
  const trimmed = spec.trim();

  const circleMatch = /^([A-Za-z0-9_"]+)\(\(([^)]*)\)\)$/.exec(trimmed);
  if (circleMatch) return { id: circleMatch[1], label: circleMatch[2], shape: 'circle' };

  const stadiumMatch = /^([A-Za-z0-9_"]+)\(\[([^\]]*)\]\)$/.exec(trimmed);
  if (stadiumMatch) return { id: stadiumMatch[1], label: stadiumMatch[2], shape: 'stadium' };

  const rectMatch = /^([A-Za-z0-9_"]+)\[([^\]]*)\]$/.exec(trimmed);
  if (rectMatch) return { id: rectMatch[1], label: rectMatch[2], shape: 'rect' };

  const diamondMatch = /^([A-Za-z0-9_"]+)\{([^}]*)\}$/.exec(trimmed);
  if (diamondMatch) return { id: diamondMatch[1], label: diamondMatch[2], shape: 'diamond' };

  const roundedMatch = /^([A-Za-z0-9_"]+)\(([^)]*)\)$/.exec(trimmed);
  if (roundedMatch) return { id: roundedMatch[1], label: roundedMatch[2], shape: 'rounded' };

  // Plain id with no label syntax
  return { id: trimmed, label: trimmed, shape: 'default' };
}

function connectorToEdgeType(connector: string): EdgeType {
  if (connector.startsWith('=')) return 'thick';
  if (connector.includes('-.-') || connector.includes('-.->')) return 'dotted';
  if (connector === '---') return 'open';
  return 'arrow';
}

export function mermaidToGraph(code: string): FlowGraph | null {
  const lines = code.split('\n');
  let direction: Direction = 'TD';
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  let edgeCount = 0;

  for (const raw of lines) {
    const line = raw.trim();

    if (!line || line.startsWith('%%') || line.startsWith('subgraph') || line === 'end') continue;

    const dirMatch = DIRECTION_RE.exec(line);
    if (dirMatch) {
      const d = dirMatch[1].toUpperCase();
      direction = (d === 'TB' ? 'TD' : d) as Direction;
      continue;
    }

    // Try to find a connector in the line
    const connectorMatch = CONNECTOR_RE.exec(line);
    if (connectorMatch) {
      const connectorIdx = connectorMatch.index;
      const connectorStr = connectorMatch[0];

      const sourceSpec = line.slice(0, connectorIdx).trim();
      let remainder = line.slice(connectorIdx + connectorStr.length).trim();

      // Extract optional edge label: |label|
      let edgeLabel: string | undefined;
      const edgeLabelMatch = EDGE_LABEL_RE.exec(remainder);
      if (edgeLabelMatch && remainder.startsWith('|')) {
        edgeLabel = edgeLabelMatch[1].trim();
        remainder = remainder.slice(edgeLabelMatch[0].length).trim();
      }

      const targetSpec = remainder;

      if (!sourceSpec || !targetSpec) continue;

      const sourceNode = parseNodeSpec(sourceSpec);
      const targetNode = parseNodeSpec(targetSpec);

      if (!nodeMap.has(sourceNode.id)) nodeMap.set(sourceNode.id, sourceNode);
      else if (sourceNode.shape !== 'default') nodeMap.set(sourceNode.id, sourceNode);

      if (!nodeMap.has(targetNode.id)) nodeMap.set(targetNode.id, targetNode);
      else if (targetNode.shape !== 'default') nodeMap.set(targetNode.id, targetNode);

      edges.push({
        id: `e${edgeCount++}`,
        label: edgeLabel,
        source: sourceNode.id,
        target: targetNode.id,
        type: connectorToEdgeType(connectorStr)
      });
    } else {
      // Standalone node definition
      const nodeCandidate = parseNodeSpec(line);
      if (nodeCandidate.id && !nodeMap.has(nodeCandidate.id)) {
        nodeMap.set(nodeCandidate.id, nodeCandidate);
      }
    }
  }

  // Second pass: parse style lines to extract colors
  for (const raw of lines) {
    const line = raw.trim();
    const styleMatch = /^style\s+([A-Za-z0-9_]+)\s+(.+)$/.exec(line);
    if (styleMatch) {
      const nodeId = styleMatch[1];
      const styleStr = styleMatch[2];
      const fillMatch = /fill:([#A-Za-z0-9]+)/.exec(styleStr);
      if (fillMatch && nodeMap.has(nodeId)) {
        const node = nodeMap.get(nodeId);
        if (node) nodeMap.set(nodeId, { ...node, color: fillMatch[1] });
      }
    }
  }

  if (nodeMap.size === 0 && edges.length === 0) return null;

  return {
    direction,
    nodes: Array.from(nodeMap.values()),
    edges
  };
}
