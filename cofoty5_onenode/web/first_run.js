// cofoty5_onenode · 처음 켰을 때 OneNode 노드 하나만 놓인 화면으로
//  - 처음 한 번만: 화면이 비어 있거나 ComfyUI 기본 예제(저장 안 된 새 탭 + 기본 노드만)라면 지우고 CoFoTy5 OneNode ® 노드를 놓음
//    (사용자가 저장한 워크플로·다른 노드팩 노드가 있는 화면은 건드리지 않음)
//  - "처음"은 서버의 표시 파일(first_run.done) 기준 — 새로 설치할 때마다 한 번. 그 뒤로는 손대지 않음. 메뉴 CoFoTy5 OneNode › OneNode 노드 새로 놓기 로 언제든 다시 놓을 수 있음
import { app } from "../../scripts/app.js";

const NODE = "CoFoTy5_OneNode";

function nodesOf(g) { return g?._nodes || g?.nodes || []; }

// 기본(코어) 노드인지: ComfyUI 본체 모듈(nodes, comfy_extras…)에서 온 노드
function isCore(type) {
  const def = globalThis.LiteGraph?.registered_node_types?.[type];
  const mod = def?.nodeData?.python_module ?? def?.prototype?.constructor?.nodeData?.python_module ?? "";
  return !!mod && !String(mod).startsWith("custom_nodes");
}
function isUnsavedTab() {
  try {
    const wf = app.extensionManager?.workflow?.activeWorkflow;
    if (!wf) return true;
    if (wf.isTemporary === true) return true;
    if (wf.isPersisted === false) return true;
    return false;
  } catch { return true; }
}
function isStockOrEmpty() {
  const ns = nodesOf(app.graph);
  if (!ns.length) return true;
  return isUnsavedTab() && ns.length <= 20 && ns.every((n) => isCore(n.type));
}

// 노드가 화면을 꽉 채우도록 확대 · 위치 맞추기 (위쪽 메뉴 바 · 아래 여백 피해서)
export function fitNode(n) {
  try {
    const el = app.canvas.canvas, ds = app.canvas.ds;
    const W = el.clientWidth || window.innerWidth, H = el.clientHeight || window.innerHeight;
    const TITLE = globalThis.LiteGraph?.NODE_TITLE_HEIGHT || 30;
    const TOP = 64, SIDE = 16, BOTTOM = 16;
    const nw = n.size[0], nh = n.size[1] + TITLE;
    const scale = Math.max(0.3, Math.min(2, Math.min((W - SIDE * 2) / nw, (H - TOP - BOTTOM) / nh)));
    ds.scale = scale;
    const left = (W - nw * scale) / 2;
    ds.offset = [left / scale - n.pos[0], (TOP + TITLE * scale) / scale - n.pos[1]];
    app.graph.setDirtyCanvas(true, true);
  } catch (e) { console.warn("[cofoty5_onenode] fit", e); }
}

function placeNode(clear) {
  const LG = globalThis.LiteGraph;
  if (!LG) return;
  if (clear) app.graph.clear();
  const n = LG.createNode(NODE);
  if (!n) return;
  n.pos = [0, 0];
  app.graph.add(n);
  setTimeout(() => fitNode(n), 50);
}

app.registerExtension({
  name: "cofoty5_onenode.first_run",
  commands: [{ id: "cofoty5_onenode.fit", label: "OneNode 노드를 화면에 꽉 차게", icon: "pi pi-window-maximize",
    function: () => {
      const ns = nodesOf(app.graph).filter((n) => n.type === NODE);
      const sel = Object.values(app.canvas?.selected_nodes || {}).find((n) => n.type === NODE);
      const n = sel || ns[0];
      if (n) fitNode(n);
    } },
    { id: "cofoty5_onenode.place", label: "OneNode 노드 새로 놓기", icon: "pi pi-plus",
    function: () => {
      const has = nodesOf(app.graph).some((n) => n.type === NODE);
      if (has && !confirm("이미 OneNode 노드가 있습니다. 하나 더 놓을까요?")) return;
      placeNode(false);
    } }],
  menuCommands: [{ path: ["CoFoTy5 OneNode"], commands: ["cofoty5_onenode.place", "cofoty5_onenode.fit"] }],
  setup() {
    // 불러올 워크플로가 없어 afterConfigureGraph가 안 오는 경우 대비
    setTimeout(() => this.afterConfigureGraph(), 2500);
  },
  async afterConfigureGraph() {
    // 워크플로를 불러온 뒤 한 번만 판단. "처음"은 브라우저 기록이 아니라 이 설치(서버의 표시 파일) 기준 —
    // 예전에 같은 주소(127.0.0.1:8188)로 ComfyUI를 열어 본 브라우저여도 새로 설치하면 다시 놓임
    if (this._asked) return;
    this._asked = true;
    let fresh = false;
    try { fresh = !!(await (await fetch("/cofoty5_onenode/first_run")).json()).fresh; } catch {}
    if (!fresh) return;
    setTimeout(() => { if (isStockOrEmpty()) placeNode(true); }, 300);
  },
});
