import type { IdeaFlowNode, IdeaFlowEdge } from '../types';

// =============================================
// 型定義
// =============================================

export type LayoutDirection = 'horizontal' | 'vertical' | 'radial';

export interface ArrangeOptions {
  direction: LayoutDirection;
  scope: 'project' | 'selection';
  selectedNodeIds?: string[];
  viewport?: { width: number; height: number };
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  groupSizes: Map<string, { width: number; height: number }>;
  edgeHandles: Map<string, { sourceHandle: string; targetHandle: string }>;
  nodeColors: Map<string, string>;
}

type Point = { x: number; y: number };
type Size = { width: number; height: number };
type BBox = { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number };

interface SimConfig {
  iterations: number;
  repulsion: number;
  springK: number;
  idealLen: number;
  damping: number;
  maxVel: number;
  collisionPad: number;
  sizeWeightedRepulsion: boolean;
}

// =============================================
// 定数
// =============================================

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 50;
const DEFAULT_SIZE: Size = { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
const GROUP_PADDING = 40;
const GROUP_HEADER = 30;
const FD_CLUSTER_GAP = 300;

// トップレベル Force-directed シミュレーション設定
const TOPLEVEL_SIM: SimConfig = {
  iterations: 400,
  repulsion: 8000,
  springK: 0.008,
  idealLen: 220,
  damping: 0.9,
  maxVel: 50,
  collisionPad: 40,
  sizeWeightedRepulsion: true,
};
const FD_INIT_SPACING = 200;

// グループ内 Force-directed シミュレーション設定
const GROUP_SIM: SimConfig = {
  iterations: 300,
  repulsion: 5000,
  springK: 0.01,
  idealLen: 160,
  damping: 0.9,
  maxVel: 40,
  collisionPad: 30,
  sizeWeightedRepulsion: false,
};
const GI_INIT_SPACING = 180;

// ハブランク固定閾値（スコア ≥ minScore で対応する色）
const RANK_CROSS_GROUP_BONUS = 3;

const RANK_TIERS: Array<{ minScore: number; color: string }> = [
  { minScore: 10, color: '#1e293b' },
  { minScore: 6,  color: '#ef4444' },
  { minScore: 5,  color: '#ea580c' },
  { minScore: 4,  color: '#f59e0b' },
  { minScore: 3,  color: '#22c55e' },
  { minScore: 2,  color: '#8b5cf6' },
];
const RANK_DEFAULT_COLOR = '#3b82f6';

const GROUP_RANK_TIERS: Array<{ minScore: number; color: string }> = [
  { minScore: 15, color: '#f59e0b' },
  { minScore: 8,  color: '#3b82f6' },
  { minScore: 4,  color: '#22c55e' },
  { minScore: 2,  color: '#8b5cf6' },
];
const GROUP_RANK_DEFAULT_COLOR = '#64748b';

// =============================================
// DOM ユーティリティ
// =============================================

function getNodeSize(nodeId: string): Size {
  const el = document.querySelector(`[data-id="${nodeId}"]`) as HTMLElement | null;
  return {
    width: el?.offsetWidth || DEFAULT_NODE_WIDTH,
    height: el?.offsetHeight || DEFAULT_NODE_HEIGHT,
  };
}

// =============================================
// エッジハンドルユーティリティ
// =============================================

function getHandlePoint(pos: Point, size: Size, handle: string): Point {
  switch (handle) {
    case 'top':    return { x: pos.x + size.width / 2, y: pos.y };
    case 'bottom': return { x: pos.x + size.width / 2, y: pos.y + size.height };
    case 'left':   return { x: pos.x,                  y: pos.y + size.height / 2 };
    case 'right':  return { x: pos.x + size.width,     y: pos.y + size.height / 2 };
    default:       return { x: pos.x + size.width / 2, y: pos.y + size.height / 2 };
  }
}

const HANDLE_NAMES = ['top', 'bottom', 'left', 'right'] as const;

function getShortestHandles(
  srcPos: Point, srcSize: Size,
  tgtPos: Point, tgtSize: Size,
): { sourceHandle: string; targetHandle: string } {
  let bestDist = Infinity;
  let bestSrc = 'right';
  let bestTgt = 'left';
  for (const sh of HANDLE_NAMES) {
    const sp = getHandlePoint(srcPos, srcSize, sh);
    for (const th of HANDLE_NAMES) {
      const tp = getHandlePoint(tgtPos, tgtSize, th);
      const dx = tp.x - sp.x, dy = tp.y - sp.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; bestSrc = sh; bestTgt = th; }
    }
  }
  return { sourceHandle: bestSrc, targetHandle: bestTgt };
}

// =============================================
// 幾何ユーティリティ（交差判定・交差削減）
// =============================================

/** 線分 (ax,ay)-(bx,by) と (cx,cy)-(dx,dy) が交差するか判定 */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

/** center 座標ベースでエッジ交差数を計算 */
function countCrossings(
  centers: Map<string, Point>,
  edges: ReadonlyArray<[string, string]>,
): number {
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    const p1 = centers.get(edges[i][0]), p2 = centers.get(edges[i][1]);
    if (!p1 || !p2) continue;
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i][0] === edges[j][0] || edges[i][0] === edges[j][1] ||
          edges[i][1] === edges[j][0] || edges[i][1] === edges[j][1]) continue;
      const p3 = centers.get(edges[j][0]), p4 = centers.get(edges[j][1]);
      if (!p3 || !p4) continue;
      if (segmentsIntersect(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y)) count++;
    }
  }
  return count;
}

/** ノード位置スワップで交差数を貪欲に削減。戻り値: スワップが発生したか */
function reduceCrossingsBySwap(
  swappableIds: string[],
  centerPos: Map<string, Point>,
  edges: ReadonlyArray<[string, string]>,
  maxPasses = 15,
): boolean {
  if (edges.length < 2 || swappableIds.length < 2) return false;
  const edgeNodes = new Set<string>();
  for (const [a, b] of edges) { edgeNodes.add(a); edgeNodes.add(b); }
  const candidates = swappableIds.filter(id => edgeNodes.has(id) && centerPos.has(id));
  if (candidates.length < 2) return false;

  let anySwapped = false;
  for (let pass = 0; pass < maxPasses; pass++) {
    const baseCrossings = countCrossings(centerPos, edges);
    if (baseCrossings === 0) break;
    let bestI = -1, bestJ = -1, bestReduction = 0;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i], b = candidates[j];
        const pa = centerPos.get(a)!, pb = centerPos.get(b)!;
        centerPos.set(a, pb); centerPos.set(b, pa);
        const reduction = baseCrossings - countCrossings(centerPos, edges);
        centerPos.set(a, pa); centerPos.set(b, pb);
        if (reduction > bestReduction) { bestI = i; bestJ = j; bestReduction = reduction; }
      }
    }
    if (bestReduction <= 0) break;
    const a = candidates[bestI], b = candidates[bestJ];
    const pa = centerPos.get(a)!, pb = centerPos.get(b)!;
    centerPos.set(a, pb); centerPos.set(b, pa);
    anySwapped = true;
  }
  return anySwapped;
}

// =============================================
// グラフ・レイアウトユーティリティ
// =============================================

/** 隣接マップから重複なしエッジリストを構築 */
function buildEdgeList(
  adj: Map<string, Set<string>>,
  nodeIds: string[],
): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const a of nodeIds) {
    for (const b of adj.get(a) || []) {
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!seen.has(k)) { seen.add(k); edges.push([a, b]); }
    }
  }
  return edges;
}

/** BFS で初期配置用ツリーを構築。戻り値: 各ノードの子ノードリスト */
function buildBfsTree(
  hubId: string,
  adj: Map<string, Set<string>>,
  nodeIds: string[],
): Map<string, string[]> {
  const children = new Map<string, string[]>();
  const visited = new Set<string>();
  for (const id of nodeIds) children.set(id, []);
  visited.add(hubId);
  const queue: string[] = [hubId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        children.get(cur)!.push(nb);
        queue.push(nb);
      }
    }
  }
  return children;
}

/** BFS ツリーを放射状に初期配置（center 座標） */
function placeRadially(
  hubId: string,
  bfsChildren: Map<string, string[]>,
  centerPos: Map<string, Point>,
  spacing: number,
): void {
  centerPos.set(hubId, { x: 0, y: 0 });
  function place(nodeId: string, angle: number, sector: number): void {
    const ch = bfsChildren.get(nodeId) || [];
    if (ch.length === 0) return;
    const pp = centerPos.get(nodeId)!;
    for (let i = 0; i < ch.length; i++) {
      const a = ch.length === 1
        ? angle
        : angle - sector / 2 + sector * (i + 0.5) / ch.length;
      centerPos.set(ch[i], { x: pp.x + spacing * Math.cos(a), y: pp.y + spacing * Math.sin(a) });
      place(ch[i], a, sector / Math.max(ch.length, 1.5));
    }
  }
  place(hubId, 0, 2 * Math.PI);
}

/** バウンディングボックスを計算。centerCoords=true の場合 center 座標として扱う */
function computeBBox(
  nodeIds: string[],
  positions: Map<string, Point>,
  sizes: Map<string, Size>,
  centerCoords = false,
): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of nodeIds) {
    const p = positions.get(id);
    if (!p) continue;
    const sz = sizes.get(id) || DEFAULT_SIZE;
    if (centerCoords) {
      minX = Math.min(minX, p.x - sz.width / 2);  minY = Math.min(minY, p.y - sz.height / 2);
      maxX = Math.max(maxX, p.x + sz.width / 2);  maxY = Math.max(maxY, p.y + sz.height / 2);
    } else {
      minX = Math.min(minX, p.x);                  minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + sz.width);       maxY = Math.max(maxY, p.y + sz.height);
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** AABB ベースの衝突解消（center 座標ベース） */
function resolveOverlaps(
  nodeIds: string[],
  centerPos: Map<string, Point>,
  nodeSizes: Map<string, Size>,
  pad: number,
  maxIters = 20,
): void {
  for (let iter = 0; iter < maxIters; iter++) {
    let anyOv = false;
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = nodeIds[i], b = nodeIds[j];
        const pa = centerPos.get(a), pb = centerPos.get(b);
        if (!pa || !pb) continue;
        const sA = nodeSizes.get(a) || DEFAULT_SIZE, sB = nodeSizes.get(b) || DEFAULT_SIZE;
        const overlapX = (sA.width / 2 + sB.width / 2 + pad * 2) - Math.abs(pa.x - pb.x);
        const overlapY = (sA.height / 2 + sB.height / 2 + pad * 2) - Math.abs(pa.y - pb.y);
        if (overlapX > 0 && overlapY > 0) {
          anyOv = true;
          let dx = pb.x - pa.x, dy = pb.y - pa.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.01) { dx = 1; dy = 0; dist = 1; }
          const push = Math.min(overlapX, overlapY) / 2 + 2;
          centerPos.set(a, { x: pa.x - (dx / dist) * push, y: pa.y - (dy / dist) * push });
          centerPos.set(b, { x: pb.x + (dx / dist) * push, y: pb.y + (dy / dist) * push });
        }
      }
    }
    if (!anyOv) break;
  }
}

// =============================================
// Force-directed シミュレーション（共通）
// =============================================

/**
 * 汎用 force-directed シミュレーション。centerPos を直接更新する。
 * - 反発力（クーロン力）: sizeWeightedRepulsion で大ノードほど強く反発
 * - バネ引力（フック力）: エッジ接続ノード間
 * - AABB 衝突解消
 * - 重心再センタリング（ドリフト防止）
 */
function runForceSimulation(
  nodeIds: string[],
  centerPos: Map<string, Point>,
  edgeList: ReadonlyArray<[string, string]>,
  nodeSizes: Map<string, Size>,
  config: SimConfig,
): void {
  const vel = new Map<string, { vx: number; vy: number }>();
  for (const id of nodeIds) vel.set(id, { vx: 0, vy: 0 });

  for (let iter = 0; iter < config.iterations; iter++) {
    const temp = Math.max(0.05, 1 - iter / config.iterations);
    const forces = new Map<string, { fx: number; fy: number }>();
    for (const id of nodeIds) forces.set(id, { fx: 0, fy: 0 });

    // (a) 反発力 — 全ノードペア
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = nodeIds[i], b = nodeIds[j];
        const pa = centerPos.get(a)!, pb = centerPos.get(b)!;
        let dx = pb.x - pa.x, dy = pb.y - pa.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) { dx = (Math.random() - 0.5) * 2; dy = (Math.random() - 0.5) * 2; distSq = dx * dx + dy * dy; }
        const dist = Math.sqrt(distSq);
        let repForce = config.repulsion / distSq;
        if (config.sizeWeightedRepulsion) {
          const sA = nodeSizes.get(a) || DEFAULT_SIZE, sB = nodeSizes.get(b) || DEFAULT_SIZE;
          repForce *= 1 + (Math.max(sA.width, sA.height) + Math.max(sB.width, sB.height)) / 200;
        }
        const fx = (dx / dist) * repForce, fy = (dy / dist) * repForce;
        const fa = forces.get(a)!, fb = forces.get(b)!;
        fa.fx -= fx; fa.fy -= fy;
        fb.fx += fx; fb.fy += fy;
      }
    }

    // (b) バネ引力 — エッジ接続
    for (const [a, b] of edgeList) {
      const pa = centerPos.get(a)!, pb = centerPos.get(b)!;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.1) continue;
      const springF = config.springK * (dist - config.idealLen);
      const fx = (dx / dist) * springF, fy = (dy / dist) * springF;
      const fa = forces.get(a)!, fb = forces.get(b)!;
      fa.fx += fx; fa.fy += fy;
      fb.fx -= fx; fb.fy -= fy;
    }

    // (c) 速度・位置更新（冷却スケジュール）
    let totalEnergy = 0;
    for (const id of nodeIds) {
      const f = forces.get(id)!, v = vel.get(id)!;
      v.vx = (v.vx + f.fx) * config.damping;
      v.vy = (v.vy + f.fy) * config.damping;
      const maxV = config.maxVel * temp;
      const speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      if (speed > maxV) { v.vx = (v.vx / speed) * maxV; v.vy = (v.vy / speed) * maxV; }
      const p = centerPos.get(id)!;
      centerPos.set(id, { x: p.x + v.vx, y: p.y + v.vy });
      totalEnergy += v.vx * v.vx + v.vy * v.vy;
    }

    // (d) AABB 衝突解消
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = nodeIds[i], b = nodeIds[j];
        const pa = centerPos.get(a)!, pb = centerPos.get(b)!;
        const sA = nodeSizes.get(a) || DEFAULT_SIZE, sB = nodeSizes.get(b) || DEFAULT_SIZE;
        const hwA = sA.width / 2 + config.collisionPad, hhA = sA.height / 2 + config.collisionPad;
        const hwB = sB.width / 2 + config.collisionPad, hhB = sB.height / 2 + config.collisionPad;
        const overlapX = (hwA + hwB) - Math.abs(pa.x - pb.x);
        const overlapY = (hhA + hhB) - Math.abs(pa.y - pb.y);
        if (overlapX > 0 && overlapY > 0) {
          let dx = pb.x - pa.x, dy = pb.y - pa.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.01) { dx = 1; dy = 0; dist = 1; }
          const push = Math.max(overlapX, overlapY) * 0.6 + 5;
          const px = (dx / dist) * push, py = (dy / dist) * push;
          centerPos.set(a, { x: pa.x - px, y: pa.y - py });
          centerPos.set(b, { x: pb.x + px, y: pb.y + py });
          const vA = vel.get(a)!; vA.vx *= 0.5; vA.vy *= 0.5;
          const vB = vel.get(b)!; vB.vx *= 0.5; vB.vy *= 0.5;
        }
      }
    }

    // (e) 重心再センタリング
    let cx = 0, cy = 0;
    for (const id of nodeIds) { const p = centerPos.get(id)!; cx += p.x; cy += p.y; }
    cx /= nodeIds.length; cy /= nodeIds.length;
    for (const id of nodeIds) {
      const p = centerPos.get(id)!;
      centerPos.set(id, { x: p.x - cx, y: p.y - cy });
    }

    if (totalEnergy < 0.5 && iter > 50) break;
  }
}

// =============================================
// グループ内ミニレイアウト
// =============================================

function computeGroupInternalLayout(
  members: IdeaFlowNode[],
  nodeSizes: Map<string, Size>,
  allEdges: IdeaFlowEdge[],
): { memberPositions: Map<string, Point>; width: number; height: number } {
  if (members.length === 0) return { memberPositions: new Map(), width: 300, height: 200 };

  const memberSet = new Set(members.map(m => m.id));
  const memberIds = members.map(m => m.id);

  // A. 隣接グラフ構築（ツリー + crosslink）
  const adj = new Map<string, Set<string>>();
  for (const id of memberIds) adj.set(id, new Set());
  for (const m of members) {
    const p = m.data.treeParentId;
    if (p && memberSet.has(p)) { adj.get(m.id)!.add(p); adj.get(p)!.add(m.id); }
  }
  const edgeKeys = new Set<string>();
  for (const e of allEdges) {
    if (!memberSet.has(e.source) || !memberSet.has(e.target) || e.source === e.target) continue;
    const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  // B. ハブ検出（次数最大 → 親なし優先）
  let hubId = memberIds[0];
  for (const id of memberIds) {
    const hubDeg = adj.get(hubId)!.size, idDeg = adj.get(id)!.size;
    if (idDeg > hubDeg) { hubId = id; continue; }
    if (idDeg === hubDeg) {
      const hubHasParent = members.find(m => m.id === hubId)?.data.treeParentId;
      const idHasParent = members.find(m => m.id === id)?.data.treeParentId;
      if (!idHasParent && hubHasParent) hubId = id;
    }
  }

  // C. BFS ツリー構築 & 放射状初期配置
  const bfsChildren = buildBfsTree(hubId, adj, memberIds);
  const centerPos = new Map<string, Point>();
  placeRadially(hubId, bfsChildren, centerPos, GI_INIT_SPACING);

  // 孤立ノード配置（BFS 未到達）
  let disconnectedIdx = 0;
  for (const id of memberIds) {
    if (!centerPos.has(id)) {
      const angle = (2 * Math.PI * disconnectedIdx) / Math.max(1, memberIds.length - centerPos.size + disconnectedIdx + 1);
      centerPos.set(id, { x: GI_INIT_SPACING * 2 * Math.cos(angle), y: GI_INIT_SPACING * 2 * Math.sin(angle) });
      disconnectedIdx++;
    }
  }

  // D. エッジリスト構築 & シミュレーション実行
  const edgeList = buildEdgeList(adj, memberIds);
  runForceSimulation(memberIds, centerPos, edgeList, nodeSizes, GROUP_SIM);

  // E. エッジ交差削減（貪欲スワップ）
  if (reduceCrossingsBySwap(memberIds, centerPos, edgeList)) {
    resolveOverlaps(memberIds, centerPos, nodeSizes, GROUP_SIM.collisionPad);
  }

  // F. バウンディングボックス → グループローカル座標に正規化
  const bb = computeBBox(memberIds, centerPos, nodeSizes, true);
  if (bb.minX === Infinity) return { memberPositions: new Map(), width: 300, height: 200 };

  const memberPositions = new Map<string, Point>();
  for (const id of memberIds) {
    const p = centerPos.get(id)!;
    const sz = nodeSizes.get(id) || DEFAULT_SIZE;
    memberPositions.set(id, {
      x: (p.x - sz.width / 2) - bb.minX + GROUP_PADDING,
      y: (p.y - sz.height / 2) - bb.minY + GROUP_PADDING + GROUP_HEADER,
    });
  }
  return {
    memberPositions,
    width: bb.w + GROUP_PADDING * 2,
    height: bb.h + GROUP_PADDING * 2 + GROUP_HEADER,
  };
}

// =============================================
// メインレイアウト関数
// =============================================

export function computeAutoLayout(
  nodes: IdeaFlowNode[],
  edges: IdeaFlowEdge[],
  options: ArrangeOptions,
): LayoutResult {
  const positions = new Map<string, Point>();
  const groupSizes = new Map<string, Size>();
  const edgeHandles = new Map<string, { sourceHandle: string; targetHandle: string }>();

  // ── 1. 対象ノード決定 ──
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  let targetIds: Set<string>;
  if (options.scope === 'selection' && options.selectedNodeIds) {
    targetIds = new Set(options.selectedNodeIds);
    for (const id of [...targetIds]) {
      const node = nodeMap.get(id);
      if (!node) continue;
      if (node.data.nodeType === 'group') {
        for (const n of nodes) { if (n.data.groupId === id) targetIds.add(n.id); }
      } else if (node.data.groupId) {
        targetIds.add(node.data.groupId);
        for (const n of nodes) { if (n.data.groupId === node.data.groupId) targetIds.add(n.id); }
      }
    }
  } else {
    targetIds = new Set(nodes.map(n => n.id));
  }

  const targetNodes = nodes.filter(n => targetIds.has(n.id));
  const ideaNodes = targetNodes.filter(n => n.data.nodeType === 'idea');
  const groupNodes = targetNodes.filter(n => n.data.nodeType === 'group');

  // ── 2. ツリー構造構築 ──
  const childrenMap = new Map<string | null, string[]>();
  for (const n of ideaNodes) {
    const parentId = n.data.treeParentId;
    const effectiveParent = parentId && targetIds.has(parentId) ? parentId : null;
    if (!childrenMap.has(effectiveParent)) childrenMap.set(effectiveParent, []);
    childrenMap.get(effectiveParent)!.push(n.id);
  }
  const roots = childrenMap.get(null) || [];

  // ノードサイズ取得
  const nodeSizes = new Map<string, Size>();
  for (const n of ideaNodes) nodeSizes.set(n.id, getNodeSize(n.id));

  const isRadial = options.direction === 'radial';

  if (isRadial) {
    // =============================================
    // Force-directed レイアウト（力学モデル）
    // =============================================

    // ── A. グループメンバーマッピング ──
    const groupMemberMap = new Map<string, string>();
    for (const n of ideaNodes) {
      if (n.data.groupId) groupMemberMap.set(n.id, n.data.groupId);
    }

    // ── B. グループ内レイアウト事前計算 ──
    const groupLayouts = new Map<string, ReturnType<typeof computeGroupInternalLayout>>();
    for (const group of groupNodes) {
      const members = ideaNodes.filter(n => n.data.groupId === group.id);
      groupLayouts.set(group.id, computeGroupInternalLayout(members, nodeSizes, edges));
    }

    // ── C. 仮想隣接グラフ構築（グループを1仮想ノードに縮約） ──
    const vAdj = new Map<string, Set<string>>();
    const allVNodes = new Set<string>();
    for (const n of ideaNodes) allVNodes.add(groupMemberMap.get(n.id) || n.id);
    for (const g of groupNodes) allVNodes.add(g.id);
    for (const vId of allVNodes) { if (!vAdj.has(vId)) vAdj.set(vId, new Set()); }

    const processedEdgeKeys = new Set<string>();
    // crosslink エッジ
    for (const edge of edges) {
      if (!targetIds.has(edge.source) || !targetIds.has(edge.target)) continue;
      const vs = groupMemberMap.get(edge.source) || edge.source;
      const vt = groupMemberMap.get(edge.target) || edge.target;
      if (vs === vt) continue;
      const key = vs < vt ? `${vs}|${vt}` : `${vt}|${vs}`;
      if (processedEdgeKeys.has(key)) continue;
      processedEdgeKeys.add(key);
      vAdj.get(vs)!.add(vt); vAdj.get(vt)!.add(vs);
    }
    // ツリーエッジ
    for (const [parentId, children] of childrenMap) {
      for (const childId of children) {
        const vChild = groupMemberMap.get(childId) || childId;
        const vParent = parentId === null ? null : (groupMemberMap.get(parentId) || parentId);
        if (vParent === null || vChild === vParent) continue;
        const key = vParent < vChild ? `${vParent}|${vChild}` : `${vChild}|${vParent}`;
        if (processedEdgeKeys.has(key)) continue;
        processedEdgeKeys.add(key);
        if (!vAdj.has(vParent)) vAdj.set(vParent, new Set());
        if (!vAdj.has(vChild)) vAdj.set(vChild, new Set());
        vAdj.get(vParent)!.add(vChild); vAdj.get(vChild)!.add(vParent);
      }
    }

    // ── D. 仮想ノードサイズ ──
    const vSizes = new Map<string, Size>();
    for (const n of ideaNodes) {
      if (!n.data.groupId) vSizes.set(n.id, nodeSizes.get(n.id) || DEFAULT_SIZE);
    }
    for (const [gid, lay] of groupLayouts) vSizes.set(gid, { width: lay.width, height: lay.height });

    const vp = options.viewport;

    // ── E. 連結成分の発見 ──
    const compVisited = new Set<string>();
    const components: string[][] = [];
    const orphanVNodes: string[] = [];
    for (const vId of allVNodes) {
      if (compVisited.has(vId)) continue;
      const neighbors = vAdj.get(vId);
      if (!neighbors || neighbors.size === 0) { compVisited.add(vId); orphanVNodes.push(vId); continue; }
      const comp: string[] = [];
      const queue = [vId]; compVisited.add(vId);
      while (queue.length > 0) {
        const cur = queue.shift()!; comp.push(cur);
        for (const nb of vAdj.get(cur) || []) {
          if (!compVisited.has(nb)) { compVisited.add(nb); queue.push(nb); }
        }
      }
      components.push(comp);
    }

    // ── F. ハブ検出（ブリッジノード優先） ──
    const groupNodeIds = new Set(groupNodes.map(g => g.id));

    function hubScore(id: string): number {
      if (groupNodeIds.has(id)) return -1000;
      let groupLinks = 0, totalDeg = 0;
      for (const nb of vAdj.get(id) || []) { totalDeg++; if (groupNodeIds.has(nb)) groupLinks++; }
      return groupLinks * 100 + totalDeg;
    }
    function findHub(component: string[]): string {
      return component.reduce((best, id) => hubScore(id) > hubScore(best) ? id : best);
    }

    // ── G. 各連結成分を Force-directed シミュレーション ──
    const componentPositions: Array<{ comp: string[]; centerPos: Map<string, Point> }> = [];

    for (const comp of components) {
      const hubId = findHub(comp);
      const bfsChildren = buildBfsTree(hubId, vAdj, comp);
      const centerPos = new Map<string, Point>();
      placeRadially(hubId, bfsChildren, centerPos, FD_INIT_SPACING);

      const edgeList = buildEdgeList(vAdj, comp);
      runForceSimulation(comp, centerPos, edgeList, vSizes, TOPLEVEL_SIM);

      componentPositions.push({ comp, centerPos });
    }

    // ── H. コンポーネント内再配置（グループ横並び + ブリッジ上配置） ──
    for (const { comp, centerPos } of componentPositions) {
      const compGroups = comp.filter(id => groupNodeIds.has(id));
      const compBridges = comp.filter(id => !groupNodeIds.has(id));
      if (compGroups.length === 0) continue;

      // グループをサイズ降順で横一列配置
      compGroups.sort((a, b) => {
        const sA = vSizes.get(a) || DEFAULT_SIZE, sB = vSizes.get(b) || DEFAULT_SIZE;
        return (sB.width * sB.height) - (sA.width * sA.height);
      });
      const groupGap = 200;
      let rowX = 0, rowMaxH = 0;
      for (const gid of compGroups) {
        const sz = vSizes.get(gid) || DEFAULT_SIZE;
        centerPos.set(gid, { x: rowX + sz.width / 2, y: 0 });
        rowX += sz.width + groupGap;
        rowMaxH = Math.max(rowMaxH, sz.height);
      }
      // 列全体を x 中心にセンタリング
      const rowCenterX = (rowX - groupGap) / 2;
      for (const gid of compGroups) {
        const p = centerPos.get(gid)!;
        centerPos.set(gid, { x: p.x - rowCenterX, y: 0 });
      }

      // ブリッジノードをグループ列の上に配置
      if (compBridges.length > 0) {
        const bridgeBaseY = -(rowMaxH / 2 + 120);
        // x 目標 = 接続先グループの重心 x
        const bridgeTargetX = new Map<string, number>();
        for (const bid of compBridges) {
          const conn = compGroups.filter(gid => vAdj.get(bid)?.has(gid));
          bridgeTargetX.set(bid,
            conn.length > 0 ? conn.reduce((s, gid) => s + centerPos.get(gid)!.x, 0) / conn.length : 0
          );
        }
        compBridges.sort((a, b) => (bridgeTargetX.get(a) || 0) - (bridgeTargetX.get(b) || 0));
        // 最小間隔を確保して配置
        const placedXs: number[] = [];
        for (const bid of compBridges) {
          let x = bridgeTargetX.get(bid) || 0;
          const sz = vSizes.get(bid) || DEFAULT_SIZE;
          const minGap = sz.width + 60;
          for (const px of placedXs) { if (Math.abs(x - px) < minGap) x = px + minGap; }
          placedXs.push(x);
          centerPos.set(bid, { x, y: bridgeBaseY });
        }
        // ブリッジ群を再センタリング
        if (placedXs.length > 1) {
          const bCx = (Math.min(...placedXs) + Math.max(...placedXs)) / 2;
          for (const bid of compBridges) {
            const p = centerPos.get(bid)!;
            centerPos.set(bid, { x: p.x - bCx, y: p.y });
          }
        }
      }
    }

    // ── H2. トップレベルのエッジ交差削減 ──
    for (const { comp, centerPos } of componentPositions) {
      const compEdges: Array<[string, string]> = [];
      for (const a of comp) {
        for (const b of vAdj.get(a) || []) { if (a < b && comp.includes(b)) compEdges.push([a, b]); }
      }
      const bridgeIds = comp.filter(id => !groupNodeIds.has(id));
      if (reduceCrossingsBySwap(bridgeIds, centerPos, compEdges)) {
        resolveOverlaps(comp, centerPos, vSizes, TOPLEVEL_SIM.collisionPad);
      }
    }

    // ── I. ビューポートを考慮したコンポーネント配置 ──
    const vpIsLandscape = !vp || vp.width >= vp.height;
    const compBounds = componentPositions.map(({ comp, centerPos }) => {
      const bb = computeBBox(comp, centerPos, vSizes, true);
      return { comp, centerPos, ...bb };
    });

    if (vpIsLandscape) {
      let xOffset = 0;
      for (const cb of compBounds) {
        const shiftX = xOffset - cb.minX, shiftY = -cb.minY;
        for (const id of cb.comp) {
          const c = cb.centerPos.get(id)!;
          const sz = vSizes.get(id) || DEFAULT_SIZE;
          positions.set(id, { x: c.x + shiftX - sz.width / 2, y: c.y + shiftY - sz.height / 2 });
        }
        xOffset += cb.w + FD_CLUSTER_GAP;
      }
    } else {
      let yOffset = 0;
      for (const cb of compBounds) {
        const shiftX = -cb.minX, shiftY = yOffset - cb.minY;
        for (const id of cb.comp) {
          const c = cb.centerPos.get(id)!;
          const sz = vSizes.get(id) || DEFAULT_SIZE;
          positions.set(id, { x: c.x + shiftX - sz.width / 2, y: c.y + shiftY - sz.height / 2 });
        }
        yOffset += cb.h + FD_CLUSTER_GAP;
      }
    }

    // ── J. 孤立ノード配置 ──
    if (orphanVNodes.length > 0) {
      let placedBB = computeBBox([...positions.keys()], positions, vSizes);
      if (placedBB.minX === Infinity) {
        placedBB = { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
      }

      const orphanGroups = orphanVNodes.filter(id => groupNodeIds.has(id));
      const orphanNormals = orphanVNodes.filter(id => !groupNodeIds.has(id));

      // 孤立グループ: 既存グループの y に揃えて横に並べる
      if (orphanGroups.length > 0) {
        let existingGroupY = placedBB.minY;
        for (const g of groupNodes) {
          const gp = positions.get(g.id);
          if (gp && !orphanGroups.includes(g.id)) { existingGroupY = gp.y; break; }
        }
        if (vpIsLandscape) {
          let gxOff = placedBB.maxX + FD_CLUSTER_GAP;
          for (const gid of orphanGroups) {
            const sz = vSizes.get(gid) || { width: 300, height: 200 };
            positions.set(gid, { x: gxOff, y: existingGroupY });
            gxOff += sz.width + FD_CLUSTER_GAP;
            placedBB.maxX = Math.max(placedBB.maxX, gxOff);
          }
        } else {
          let gyOff = placedBB.maxY + FD_CLUSTER_GAP;
          for (const gid of orphanGroups) {
            const sz = vSizes.get(gid) || { width: 300, height: 200 };
            positions.set(gid, { x: placedBB.minX, y: gyOff });
            gyOff += sz.height + FD_CLUSTER_GAP;
            placedBB.maxY = Math.max(placedBB.maxY, gyOff);
          }
        }
      }

      // 孤立通常ノード: デッドスペースに配置
      if (orphanNormals.length > 0) {
        placedBB = computeBBox([...positions.keys()], positions, vSizes);
        const ORPHAN_GAP_Y = 80;
        // 右端要素の下の空きスペースを探す
        let rightMostId = '', rightMostRight = -Infinity;
        for (const [id, pos] of positions) {
          const sz = vSizes.get(id) || DEFAULT_SIZE;
          if (pos.x + sz.width > rightMostRight) { rightMostRight = pos.x + sz.width; rightMostId = id; }
        }
        const rmPos = positions.get(rightMostId)!;
        const rmSz = vSizes.get(rightMostId) || DEFAULT_SIZE;
        const spaceBelow = placedBB.maxY - (rmPos.y + rmSz.height);

        if (spaceBelow > orphanNormals.length * ORPHAN_GAP_Y) {
          const startX = rmPos.x, startY = rmPos.y + rmSz.height + 100;
          for (let i = 0; i < orphanNormals.length; i++) {
            positions.set(orphanNormals[i], { x: startX, y: startY + i * ORPHAN_GAP_Y });
          }
        } else {
          const startX = placedBB.maxX + 100;
          const startY = placedBB.maxY - orphanNormals.length * ORPHAN_GAP_Y;
          for (let i = 0; i < orphanNormals.length; i++) {
            positions.set(orphanNormals[i], { x: startX, y: Math.max(placedBB.minY, startY) + i * ORPHAN_GAP_Y });
          }
        }
      }
    }

    // ── K. グループサイズ設定 & メンバー座標セット ──
    for (const [gid, lay] of groupLayouts) {
      groupSizes.set(gid, { width: lay.width, height: lay.height });
      for (const [mid, mpos] of lay.memberPositions) positions.set(mid, mpos);
    }
    for (const group of groupNodes) {
      if (!positions.has(group.id)) {
        positions.set(group.id, { x: group.position.x, y: group.position.y });
        if (!groupSizes.has(group.id)) groupSizes.set(group.id, { width: 300, height: 200 });
      }
    }

    // ── L. 最終重なり解消（top-left 座標） ──
    const topLevelNodeIds: string[] = [];
    for (const n of ideaNodes) { if (!n.data.groupId && positions.has(n.id)) topLevelNodeIds.push(n.id); }
    const gIds = [...groupSizes.keys()];

    for (let iter = 0; iter < 50; iter++) {
      let overlapFound = false;
      // ノード vs グループ
      for (const nId of topLevelNodeIds) {
        const np = positions.get(nId);
        if (!np) continue;
        const ns = nodeSizes.get(nId) || DEFAULT_SIZE;
        for (const gid of gIds) {
          const gp = positions.get(gid), gs = groupSizes.get(gid);
          if (!gp || !gs) continue;
          const ox = Math.min(np.x + ns.width, gp.x + gs.width) - Math.max(np.x, gp.x);
          const oy = Math.min(np.y + ns.height, gp.y + gs.height) - Math.max(np.y, gp.y);
          if (ox > 0 && oy > 0) {
            overlapFound = true;
            const ncx = np.x + ns.width / 2, ncy = np.y + ns.height / 2;
            const gcx = gp.x + gs.width / 2, gcy = gp.y + gs.height / 2;
            let dx = ncx - gcx, dy = ncy - gcy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.01) { dx = 1; dy = 0; } else { dx /= dist; dy /= dist; }
            const t = Math.min(
              dx !== 0 ? Math.abs(gs.width / 2 / dx) : Infinity,
              dy !== 0 ? Math.abs(gs.height / 2 / dy) : Infinity,
            );
            positions.set(nId, { x: gcx + dx * (t + 100) - ns.width / 2, y: gcy + dy * (t + 100) - ns.height / 2 });
          }
        }
      }
      // グループ vs グループ
      for (let i = 0; i < gIds.length; i++) {
        for (let j = i + 1; j < gIds.length; j++) {
          const p1 = positions.get(gIds[i]), s1 = groupSizes.get(gIds[i]);
          const p2 = positions.get(gIds[j]), s2 = groupSizes.get(gIds[j]);
          if (!p1 || !s1 || !p2 || !s2) continue;
          const ox = Math.min(p1.x + s1.width, p2.x + s2.width) - Math.max(p1.x, p2.x);
          const oy = Math.min(p1.y + s1.height, p2.y + s2.height) - Math.max(p1.y, p2.y);
          if (ox > 0 && oy > 0) {
            overlapFound = true;
            let dx = (p2.x + s2.width / 2) - (p1.x + s1.width / 2);
            let dy = (p2.y + s2.height / 2) - (p1.y + s1.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.01) { dx = 1; dy = 0; } else { dx /= dist; dy /= dist; }
            const push = (Math.min(ox, oy) + 80) / 2;
            positions.set(gIds[i], { x: p1.x - dx * push, y: p1.y - dy * push });
            positions.set(gIds[j], { x: p2.x + dx * push, y: p2.y + dy * push });
          }
        }
      }
      // ノード vs ノード
      for (let i = 0; i < topLevelNodeIds.length; i++) {
        for (let j = i + 1; j < topLevelNodeIds.length; j++) {
          const idA = topLevelNodeIds[i], idB = topLevelNodeIds[j];
          const pA = positions.get(idA), pB = positions.get(idB);
          if (!pA || !pB) continue;
          const sA = nodeSizes.get(idA) || DEFAULT_SIZE, sB = nodeSizes.get(idB) || DEFAULT_SIZE;
          const ox = Math.min(pA.x + sA.width, pB.x + sB.width) - Math.max(pA.x, pB.x);
          const oy = Math.min(pA.y + sA.height, pB.y + sB.height) - Math.max(pA.y, pB.y);
          if (ox > 0 && oy > 0) {
            overlapFound = true;
            let dx = (pB.x + sB.width / 2) - (pA.x + sA.width / 2);
            let dy = (pB.y + sB.height / 2) - (pA.y + sA.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.01) { dx = 1; dy = 0; } else { dx /= dist; dy /= dist; }
            const push = (Math.min(ox, oy) + 50) / 2;
            positions.set(idA, { x: pA.x - dx * push, y: pA.y - dy * push });
            positions.set(idB, { x: pB.x + dx * push, y: pB.y + dy * push });
          }
        }
      }
      if (!overlapFound) break;
    }

    // ── M. ビューポートアスペクト比補正 ──
    if (vp && vp.width > 0 && vp.height > 0) {
      const vpAspect = vp.width / vp.height;
      const allTopIds = [...topLevelNodeIds, ...gIds];
      const allTopSizes = new Map<string, Size>();
      for (const id of allTopIds) allTopSizes.set(id, groupSizes.get(id) || nodeSizes.get(id) || DEFAULT_SIZE);

      const bb = computeBBox(allTopIds, positions, allTopSizes);
      if (bb.w > 1 && bb.h > 1) {
        const mismatch = vpAspect / (bb.w / bb.h);
        if (mismatch > 1.2 || mismatch < 0.83) {
          // 面積加重重心
          let cx = 0, cy = 0, totalArea = 0;
          for (const id of allTopIds) {
            const p = positions.get(id);
            if (!p) continue;
            const sz = allTopSizes.get(id)!;
            const area = sz.width * sz.height;
            cx += (p.x + sz.width / 2) * area; cy += (p.y + sz.height / 2) * area;
            totalArea += area;
          }
          cx /= totalArea; cy /= totalArea;

          // 70% ブレンドでスケーリング（自然さ維持）
          const blend = 0.7;
          let scaleX = 1, scaleY = 1;
          if (mismatch > 1) scaleY = 1 - (1 - 1 / mismatch) * blend;
          else scaleX = 1 - (1 - mismatch) * blend;

          for (const id of allTopIds) {
            const p = positions.get(id);
            if (!p) continue;
            const sz = allTopSizes.get(id)!;
            const eCx = p.x + sz.width / 2, eCy = p.y + sz.height / 2;
            positions.set(id, {
              x: cx + (eCx - cx) * scaleX - sz.width / 2,
              y: cy + (eCy - cy) * scaleY - sz.height / 2,
            });
          }

          // スケーリング後の重なり解消
          for (let ri = 0; ri < 30; ri++) {
            let anyOv = false;
            for (const nId of topLevelNodeIds) {
              const np = positions.get(nId);
              if (!np) continue;
              const ns = nodeSizes.get(nId) || DEFAULT_SIZE;
              for (const gid of gIds) {
                const gp = positions.get(gid), gs = groupSizes.get(gid);
                if (!gp || !gs) continue;
                const ox = Math.min(np.x + ns.width, gp.x + gs.width) - Math.max(np.x, gp.x);
                const oy = Math.min(np.y + ns.height, gp.y + gs.height) - Math.max(np.y, gp.y);
                if (ox > 0 && oy > 0) {
                  anyOv = true;
                  const ncx = np.x + ns.width / 2, ncy = np.y + ns.height / 2;
                  const gcx = gp.x + gs.width / 2, gcy = gp.y + gs.height / 2;
                  let dx = ncx - gcx, dy = ncy - gcy;
                  const d = Math.sqrt(dx * dx + dy * dy);
                  if (d < 0.01) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
                  const t = Math.min(
                    dx !== 0 ? Math.abs(gs.width / 2 / dx) : Infinity,
                    dy !== 0 ? Math.abs(gs.height / 2 / dy) : Infinity,
                  );
                  positions.set(nId, { x: gcx + dx * (t + 80) - ns.width / 2, y: gcy + dy * (t + 80) - ns.height / 2 });
                }
              }
            }
            for (let i = 0; i < gIds.length; i++) {
              for (let j = i + 1; j < gIds.length; j++) {
                const p1 = positions.get(gIds[i]), s1 = groupSizes.get(gIds[i]);
                const p2 = positions.get(gIds[j]), s2 = groupSizes.get(gIds[j]);
                if (!p1 || !s1 || !p2 || !s2) continue;
                const ox = Math.min(p1.x + s1.width, p2.x + s2.width) - Math.max(p1.x, p2.x);
                const oy = Math.min(p1.y + s1.height, p2.y + s2.height) - Math.max(p1.y, p2.y);
                if (ox > 0 && oy > 0) {
                  anyOv = true;
                  let dx = (p2.x + s2.width / 2) - (p1.x + s1.width / 2);
                  let dy = (p2.y + s2.height / 2) - (p1.y + s1.height / 2);
                  const d = Math.sqrt(dx * dx + dy * dy);
                  if (d < 0.01) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
                  const push = (Math.min(ox, oy) + 80) / 2;
                  positions.set(gIds[i], { x: p1.x - dx * push, y: p1.y - dy * push });
                  positions.set(gIds[j], { x: p2.x + dx * push, y: p2.y + dy * push });
                }
              }
            }
            if (!anyOv) break;
          }

          // 負座標補正
          let newMinX = Infinity, newMinY = Infinity;
          for (const id of allTopIds) { const p = positions.get(id); if (p) { newMinX = Math.min(newMinX, p.x); newMinY = Math.min(newMinY, p.y); } }
          if (newMinX < 0 || newMinY < 0) {
            const sx = newMinX < 0 ? -newMinX : 0, sy = newMinY < 0 ? -newMinY : 0;
            for (const id of allTopIds) { const p = positions.get(id); if (p) positions.set(id, { x: p.x + sx, y: p.y + sy }); }
          }
        }
      }
    }

  } else {
    // =============================================
    // 横方向・縦方向ツリーレイアウト
    // =============================================
    const isHorizontal = options.direction === 'horizontal';
    const depthSpacing = isHorizontal ? 250 : 200;
    const siblingSpacing = isHorizontal ? 100 : 200;

    const visited = new Set<string>();
    const subtreeSpan = new Map<string, number>();

    function calcSubtreeSpan(nodeId: string): number {
      if (visited.has(nodeId)) return 0;
      visited.add(nodeId);
      const children = (childrenMap.get(nodeId) || []).filter(c => !visited.has(c));
      const size = nodeSizes.get(nodeId) || DEFAULT_SIZE;
      const nodeSpan = isHorizontal ? size.height : size.width;
      if (children.length === 0) { subtreeSpan.set(nodeId, nodeSpan); return nodeSpan; }
      let totalChildSpan = 0;
      for (let i = 0; i < children.length; i++) {
        if (i > 0) totalChildSpan += siblingSpacing;
        totalChildSpan += calcSubtreeSpan(children[i]);
      }
      const span = Math.max(nodeSpan, totalChildSpan);
      subtreeSpan.set(nodeId, span);
      return span;
    }
    for (const root of roots) calcSubtreeSpan(root);
    visited.clear();

    function layoutSubtree(nodeId: string, depth: number, offset: number): void {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const children = (childrenMap.get(nodeId) || []).filter(c => !visited.has(c));
      const size = nodeSizes.get(nodeId) || DEFAULT_SIZE;
      const span = subtreeSpan.get(nodeId) || (isHorizontal ? size.height : size.width);

      if (children.length === 0) {
        const nodeSpan = isHorizontal ? size.height : size.width;
        const center = offset + span / 2 - nodeSpan / 2;
        if (isHorizontal) positions.set(nodeId, { x: depth * depthSpacing, y: center });
        else positions.set(nodeId, { x: center, y: depth * depthSpacing });
        return;
      }

      let totalChildSpan = 0;
      for (let i = 0; i < children.length; i++) {
        if (i > 0) totalChildSpan += siblingSpacing;
        totalChildSpan += subtreeSpan.get(children[i]) || 0;
      }
      let childOffset = offset + (span - totalChildSpan) / 2;
      for (const child of children) {
        layoutSubtree(child, depth + 1, childOffset);
        childOffset += (subtreeSpan.get(child) || 0) + siblingSpacing;
      }

      const firstPos = positions.get(children[0]);
      const lastPos = positions.get(children[children.length - 1]);
      if (firstPos && lastPos) {
        const firstSz = nodeSizes.get(children[0]) || DEFAULT_SIZE;
        const lastSz = nodeSizes.get(children[children.length - 1]) || DEFAULT_SIZE;
        if (isHorizontal) {
          positions.set(nodeId, { x: depth * depthSpacing, y: (firstPos.y + lastPos.y + lastSz.height) / 2 - size.height / 2 });
        } else {
          positions.set(nodeId, { x: (firstPos.x + lastPos.x + lastSz.width) / 2 - size.width / 2, y: depth * depthSpacing });
        }
      }
    }

    let rootOffset = 0;
    for (const root of roots) {
      layoutSubtree(root, 0, rootOffset);
      rootOffset += (subtreeSpan.get(root) || 0) + siblingSpacing * 2;
    }

    // グループ処理
    for (const group of groupNodes) {
      const members = ideaNodes.filter(n => n.data.groupId === group.id);
      if (members.length === 0) {
        positions.set(group.id, { x: group.position.x, y: group.position.y });
        groupSizes.set(group.id, { width: 300, height: 200 });
        continue;
      }
      const bb = computeBBox(members.map(m => m.id), positions, nodeSizes);
      if (bb.minX === Infinity) {
        positions.set(group.id, { x: group.position.x, y: group.position.y });
        groupSizes.set(group.id, { width: 300, height: 200 });
        continue;
      }
      const gx = bb.minX - GROUP_PADDING, gy = bb.minY - GROUP_PADDING - GROUP_HEADER;
      const gw = bb.w + GROUP_PADDING * 2, gh = bb.h + GROUP_PADDING * 2 + GROUP_HEADER;
      positions.set(group.id, { x: gx, y: gy });
      groupSizes.set(group.id, { width: gw, height: gh });
      for (const m of members) {
        const pos = positions.get(m.id);
        if (pos) positions.set(m.id, { x: pos.x - gx, y: pos.y - gy });
      }
    }
  }

  // ── 共通後処理 ──

  // 選択モード時の位置調整
  if (options.scope === 'selection' && options.selectedNodeIds && options.selectedNodeIds.length > 0) {
    const nonGroupTargets = ideaNodes.filter(n => !n.data.groupId);
    if (nonGroupTargets.length > 0) {
      let origMinX = Infinity, origMinY = Infinity, origMaxX = -Infinity, origMaxY = -Infinity;
      for (const n of nonGroupTargets) {
        const globalPos = n.parentId
          ? { x: (nodeMap.get(n.parentId)?.position.x || 0) + n.position.x, y: (nodeMap.get(n.parentId)?.position.y || 0) + n.position.y }
          : n.position;
        const size = nodeSizes.get(n.id) || DEFAULT_SIZE;
        origMinX = Math.min(origMinX, globalPos.x); origMinY = Math.min(origMinY, globalPos.y);
        origMaxX = Math.max(origMaxX, globalPos.x + size.width); origMaxY = Math.max(origMaxY, globalPos.y + size.height);
      }
      const origCX = (origMinX + origMaxX) / 2, origCY = (origMinY + origMaxY) / 2;
      const topLevelIds = [...positions.keys()].filter(id => { const n = nodeMap.get(id); return n && !n.data.groupId; });
      if (topLevelIds.length > 0) {
        const bb = computeBBox(topLevelIds, positions, new Map([...nodeSizes, ...groupSizes]));
        const dx = origCX - (bb.minX + bb.maxX) / 2, dy = origCY - (bb.minY + bb.maxY) / 2;
        for (const id of topLevelIds) {
          const pos = positions.get(id)!;
          positions.set(id, { x: pos.x + dx, y: pos.y + dy });
        }
      }
    }
  }

  // エッジハンドル更新
  if (isRadial) {
    const globalPositions = new Map<string, Point>();
    for (const [id, pos] of positions) {
      const node = nodeMap.get(id);
      if (node?.data.groupId && positions.has(node.data.groupId)) {
        const gp = positions.get(node.data.groupId)!;
        globalPositions.set(id, { x: gp.x + pos.x, y: gp.y + pos.y });
      } else {
        globalPositions.set(id, pos);
      }
    }
    for (const edge of edges) {
      if (!targetIds.has(edge.source) || !targetIds.has(edge.target)) continue;
      const sp = globalPositions.get(edge.source), tp = globalPositions.get(edge.target);
      if (!sp || !tp) continue;
      const ss = nodeSizes.get(edge.source) || groupSizes.get(edge.source) || DEFAULT_SIZE;
      const ts = nodeSizes.get(edge.target) || groupSizes.get(edge.target) || DEFAULT_SIZE;
      edgeHandles.set(edge.id, getShortestHandles(sp, ss, tp, ts));
    }
  } else {
    const isHorizontal = options.direction === 'horizontal';
    const sourceHandle = isHorizontal ? 'right' : 'bottom';
    const targetHandle = isHorizontal ? 'left' : 'top';
    for (const edge of edges) {
      if (edge.data?.edgeType !== 'tree') continue;
      if (targetIds.has(edge.source) && targetIds.has(edge.target)) {
        edgeHandles.set(edge.id, { sourceHandle, targetHandle });
      }
    }
  }

  // ハブランクに基づくノード色割り当て
  const nodeColors = new Map<string, string>();
  if (isRadial) {
    const nodeScore = new Map<string, number>();
    for (const n of ideaNodes) nodeScore.set(n.id, 0);

    const getGroupOf = (id: string): string | null => {
      const n = nodeMap.get(id);
      if (!n) return null;
      if (n.data.nodeType === 'group') return id;
      return n.data.groupId || null;
    };
    const countedEdges = new Set<string>();

    // ツリーエッジ
    for (const n of ideaNodes) {
      if (!n.data.treeParentId || !targetIds.has(n.data.treeParentId)) continue;
      const pid = n.data.treeParentId;
      const key = n.id < pid ? `${n.id}|${pid}` : `${pid}|${n.id}`;
      if (countedEdges.has(key)) continue;
      countedEdges.add(key);
      const ga = getGroupOf(n.id), gb = getGroupOf(pid);
      const cross = (ga !== gb && (ga !== null || gb !== null)) ? RANK_CROSS_GROUP_BONUS : 0;
      nodeScore.set(n.id, nodeScore.get(n.id)! + 1 + cross);
      if (nodeScore.has(pid)) nodeScore.set(pid, nodeScore.get(pid)! + 1 + cross);
    }
    // crosslink エッジ
    for (const edge of edges) {
      const s = edge.source, t = edge.target;
      if (s === t || !targetIds.has(s) || !targetIds.has(t)) continue;
      const key = s < t ? `${s}|${t}` : `${t}|${s}`;
      if (countedEdges.has(key)) continue;
      countedEdges.add(key);
      const ga = getGroupOf(s), gb = getGroupOf(t);
      const cross = (ga !== gb && (ga !== null || gb !== null)) ? RANK_CROSS_GROUP_BONUS : 0;
      if (nodeScore.has(s)) nodeScore.set(s, nodeScore.get(s)! + 1 + cross);
      if (nodeScore.has(t)) nodeScore.set(t, nodeScore.get(t)! + 1 + cross);
    }
    // グループノード: スコア = メンバー数
    for (const group of groupNodes) {
      nodeScore.set(group.id, ideaNodes.filter(n => n.data.groupId === group.id).length);
    }
    // 固定閾値で色割り当て
    for (const [id, score] of nodeScore) {
      const isGroup = groupNodes.some(g => g.id === id);
      const tiers = isGroup ? GROUP_RANK_TIERS : RANK_TIERS;
      const defaultColor = isGroup ? GROUP_RANK_DEFAULT_COLOR : RANK_DEFAULT_COLOR;
      let color = defaultColor;
      for (const tier of tiers) { if (score >= tier.minScore) { color = tier.color; break; } }
      nodeColors.set(id, color);
    }
  }

  return { positions, groupSizes, edgeHandles, nodeColors };
}
