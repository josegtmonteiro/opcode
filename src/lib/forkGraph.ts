import type { Session } from "@/lib/api";

export interface SessionTreeNode {
  session: Session;
  children: SessionTreeNode[];
  depth: number;
}

/**
 * Builds a fork tree from a flat array of sessions.
 * Sessions with `forked_from` are nested under their parent.
 * Sessions without a parent (or whose parent is not in the array) become roots.
 * Returns root nodes sorted by created_at (newest first), children sorted the same way.
 */
export function buildForkTree(sessions: Session[]): SessionTreeNode[] {
  const nodeMap = new Map<string, SessionTreeNode>();
  const childrenMap = new Map<string, SessionTreeNode[]>();

  // Create nodes for all sessions
  for (const session of sessions) {
    nodeMap.set(session.id, { session, children: [], depth: 0 });
  }

  // Link children to parents
  for (const session of sessions) {
    if (session.forked_from) {
      const parentId = session.forked_from.sessionId;
      if (nodeMap.has(parentId)) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(nodeMap.get(session.id)!);
      }
    }
  }

  // Assign children and compute depths
  function assignDepth(node: SessionTreeNode, depth: number) {
    node.depth = depth;
    const children = childrenMap.get(node.session.id) || [];
    children.sort((a, b) => b.session.created_at - a.session.created_at);
    node.children = children;
    for (const child of children) {
      assignDepth(child, depth + 1);
    }
  }

  // Find roots: sessions without forked_from, or whose parent is not in this project
  const roots: SessionTreeNode[] = [];
  for (const session of sessions) {
    if (!session.forked_from || !nodeMap.has(session.forked_from.sessionId)) {
      roots.push(nodeMap.get(session.id)!);
    }
  }

  roots.sort((a, b) => b.session.created_at - a.session.created_at);
  for (const root of roots) {
    assignDepth(root, 0);
  }

  return roots;
}

/**
 * Flattens a fork tree into a depth-first ordered array.
 * Useful for rendering the tree as a flat list with indentation.
 */
export function flattenTree(roots: SessionTreeNode[]): SessionTreeNode[] {
  const result: SessionTreeNode[] = [];
  function walk(node: SessionTreeNode) {
    result.push(node);
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const root of roots) {
    walk(root);
  }
  return result;
}

/**
 * Builds a set of session IDs that have at least one child (are parents).
 */
export function getParentSessionIds(sessions: Session[]): Set<string> {
  const parentIds = new Set<string>();
  for (const session of sessions) {
    if (session.forked_from && sessions.some(s => s.id === session.forked_from!.sessionId)) {
      parentIds.add(session.forked_from.sessionId);
    }
  }
  return parentIds;
}

/**
 * Counts the number of children (forks) for a given session.
 */
export function countForks(sessionId: string, sessions: Session[]): number {
  return sessions.filter(s => s.forked_from?.sessionId === sessionId).length;
}
