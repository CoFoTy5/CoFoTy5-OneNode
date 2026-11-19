// cofoty5_onenode · CoFoTy5 OneNode ® — 노드 하나짜리 화면 (3단 / 2단)
//  왼쪽(설정): ① 모델 설정(Anima / 체크포인트)  ② 크기·배치 + LoRA  ③ 업스케일 · 보정
//  프롬프트: 품질 · 본 · 배경 · 부정 + 구도 버튼 → 미리보기 → [생성] [그대로 저장] [업스케일 저장] → 저장 폴더 규칙
//  가운데 세로줄을 끌면 좌우 폭이 바뀜(노드마다 기억). 실제 값은 노드의 숨은 칸에 저장되어 워크플로·PNG에 남음.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { panPassthrough } from "./mmb.js";
import { fitNode } from "./first_run.js";
import { loraFam, famOk, FAM_NAME, famOnly, setFamOnly, onFamOnly, loraStore, setBar, THUMB_SIZES, thumbIdx, nextThumb, gridStyle } from "./cofoty5_lora_core.js";

const NODE = "CoFoTy5_OneNode";
const C = {
  text: "#e6e6e6", dim: "#9a9aa4", bg: "#1b1b1f", box: "#24242a", line: "#3a3a42", sep: "#34343c",
  accent: "#2c8a8a", accent2: "#45b0b0", warn: "#e0a040", bad: "#e06060", ok: "#4caf50", ko: "#a9b8c8", gold: "#e8c46a",
};
const css = (el, s) => (Object.assign(el.style, s), el);
const h = (tag, s = {}, text) => { const e = css(document.createElement(tag), s); if (text != null) e.textContent = text; return e; };
const noKeys = (el) => ["keydown", "keyup", "keypress"].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
const shortName = (n) => String(n || "").split(/[\\/]/).pop().replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "");
const fmt = (x) => String(+(+x).toFixed(2));
const INPUT = { background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: "4px", padding: "3px 5px",
  fontSize: "12px", boxSizing: "border-box", outline: "none", minWidth: "0" };
const CHIP = { border: `1px solid ${C.line}`, borderRadius: "10px", padding: "1px 7px", cursor: "pointer", background: C.bg,
  color: C.text, whiteSpace: "nowrap", userSelect: "none", fontSize: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const ON = { background: C.accent, borderColor: C.accent2, color: "#fff" };
const toast = (msg, severity = "info", life = 4000) => { try { app.extensionManager?.toast?.add({ severity, summary: msg, life }); } catch {} };
const url = (p) => (api.apiURL ? api.apiURL(p) : "/api" + p);
const prevURL = (name) => url("/cofoty5_onenode/lora_preview?name=" + encodeURIComponent(name));
const HIDE = ["positive", "negative", "width", "height", "batch", "loras", "seed_value", "random_seed", "model", "steps", "cfg", "sampler",
  "scheduler", "text_encoder", "vae", "quality_on", "quality", "up_scale", "up_denoise", "up_sampler", "up_scheduler",
  "face_fix", "hand_fix", "face_denoise", "hand_denoise", "save_folder", "save_name", "date_folder", "extra", "action", "pick", "src",
  "model_type", "ckpt", "clip_skip", "toggles", "auto", "lora_prompt"];

const NAME_RULES = ["날짜_번호", "날짜_시드", "번호만"];
const SIZE3 = [1500, 1020], SIZE2 = [1110, 1160]; // 3단 · 2단 기본 노드 크기
// 1차 버전(입력 칸이 적던 때)의 저장 순서 — 예전 워크플로를 불러올 때 이름으로 맞춰 넣기 위해
const V1_ORDER = ["positive", "negative", "width", "height", "batch", "seed_value", "random_seed", "model", "steps", "cfg", "sampler",
  "scheduler", "text_encoder", "vae", "quality_on", "quality", "up_scale", "up_denoise", "up_sampler", "up_scheduler",
  "face_fix", "hand_fix", "face_denoise", "hand_denoise", "action", "pick"];
const SAVED = HIDE.filter((n) => n !== "action" && n !== "pick" && n !== "src" && n !== "auto");
const AUTO_MODES = [
  ["save", "⚡ 바로 저장", "체크한 항목을 끝까지 자동으로 만들고, 나온 그림을 전부 그대로 저장합니다"],
  ["upscale", "⚡ 업스케일 저장", "체크한 항목을 끝까지 자동으로 만들고, 나온 그림을 전부 업스케일해서 저장합니다 (③ 설정 사용)"],
  ["watch", "👀 보면서 진행", "한 항목씩 만들고 멈춥니다. 마음에 드는 그림을 골라 저장하고 [다음 생성]으로 넘어갑니다"],
];

// 비율 (세로 기준 w×h, Anima는 16배수)
const MAIN = [["1:1", 1024, 1024], ["3:4", 864, 1152]];
const MORE = [["7:9", 896, 1152], ["2:3", 832, 1216], ["4:7", 768, 1344], ["9:21", 640, 1536]];

const HANGUL = /[\uac00-\ud7a3\u3131-\u318e]/;

// ================================================================ LoRA 라이브러리 
const BASE = {
  Illustrious: ["IL", "#6fae6f"], NoobAI: ["NB", "#6fae6f"], SDXL: ["XL", "#6fae6f"], Pony: ["PN", "#c9a94a"],
  "SD1.5": ["1.5", "#d06a6a"], SD2: ["SD2", "#d06a6a"], Flux: ["FLX", "#d06a6a"], SD3: ["SD3", "#d06a6a"], Anima: ["AN", "#6fae6f"],
};
// LoRA · 모델 계열 판정(loraFam · famOk · FAM_NAME)은 cofoty5_lora_core.js 
const MODELS = { data: null, loading: null };
async function loadModels(force) {
  if (MODELS.data && !force) return MODELS.data;
  if (MODELS.loading && !force) return MODELS.loading;
  MODELS.loading = (async () => {
    try { MODELS.data = await (await api.fetchApi("/cofoty5_onenode/models")).json(); } catch { MODELS.data = MODELS.data || null; }
    MODELS.loading = null; PANELS.forEach((fn) => fn());
    return MODELS.data;
  })();
  return MODELS.loading;
}
// 모델 종류를 바꿀 때 같이 바뀌는 값 (종류마다 따로 기억 — 처음엔 아래 기본값)
const TYPE_F = ["steps", "cfg", "sampler", "scheduler", "up_sampler", "up_scheduler", "up_denoise", "quality", "negative", "loras", "lora_prompt"];
const PRESET = {
  anima: { steps: 12, cfg: 1.5, sampler: "er_sde", scheduler: "beta57", up_sampler: "er_sde", up_scheduler: "simple", up_denoise: 0.35, loras: "[]", lora_prompt: "",
    quality: "(masterpiece:1.25), (best quality:1.25), (ultra detailed:1.2), (absurdres:1.15), (very aesthetic:1.1)",
    negative: "bad quality,worst quality,worst detail,sketch,censor,low quality, worst quality, bad anatomy, bad hands, text, error, blurry, extra digit, fewer digits, cropped, ugly, displaced eyes, makeup, color bleeding, intertwined, merged clothing, mixed features" },
  ckpt: { steps: 28, cfg: 5.5, sampler: "euler_ancestral", scheduler: "normal", up_sampler: "euler_ancestral", up_scheduler: "normal", up_denoise: 0.35, loras: "[]", lora_prompt: "",
    quality: "masterpiece, best quality, amazing quality, very aesthetic, absurdres, newest",
    negative: "lowres, worst quality, bad quality, bad anatomy, bad hands, extra fingers, missing fingers, fewer digits, extra digits, jpeg artifacts, signature, watermark, username, text, logo, blurry, sketch" },
};
// 구도 버튼 (자주 쓰는 것은 사용자가 추가 — ComfyUI/user 폴더에 저장)
const it2 = (label, tags) => ({ label, tags: tags || label });
const GROUPS = [
  { name: "앵글", type: "multi", items: [it2("위에서", "from above"), it2("아래에서", "from below"), it2("옆에서", "from side"), it2("뒤에서", "from behind"),
    it2("정면", "straight-on"), it2("기울임", "dutch angle"), it2("1인칭", "pov")] },
  { name: "프레이밍", type: "multi", items: [it2("클로즈업", "close-up"), it2("얼굴", "portrait"), it2("상반신", "upper body"), it2("카우보이샷", "cowboy shot"),
    it2("전신", "full body"), it2("원경", "wide shot")] },
  { name: "시선", type: "multi", items: [it2("정면 응시", "looking at viewer"), it2("외면", "looking away"), it2("뒤돌아봄", "looking back"),
    it2("올려다봄", "looking up"), it2("내려다봄", "looking down"), it2("옆을 봄", "looking to the side")] },
];
const FAVS = { items: [], loaded: false };
async function loadFavs() {
  try { FAVS.items = (await (await api.fetchApi("/cofoty5_onenode/favs")).json()).items || []; FAVS.loaded = true; } catch {}
  PANELS.forEach((fn) => fn());
}
async function saveFavs(items) {
  try { FAVS.items = (await (await api.fetchApi("/cofoty5_onenode/favs", { method: "POST", body: JSON.stringify({ items }) })).json()).items || items; }
  catch { toast("자주 쓰는 버튼을 저장하지 못했습니다", "warn"); }
  PANELS.forEach((fn) => fn());
}
const safePlay = (m) => { try { const p = m?.play?.(); p?.catch?.(() => {}); } catch {} };
const LIB = { items: null, byName: new Map(), loading: null };
const PANELS = new Set();
// 탭을 바꿨다 돌아오면 ComfyUI가 노드를 새로 만듦 → 미리보기 · 저장본 · 진행 상태를 여기 맡겨 두었다가 되살림
// (파일 이름 목록만 기억 · 새로고침하거나 ComfyUI를 끄면 비워짐)
const MEM = new Map();
const MEM_KEEP = ["prev", "saved", "pick", "view", "auto", "msg"];
const wfKey = () => { try { const w = app.extensionManager?.workflow?.activeWorkflow; return w?.key || w?.path || ""; } catch { return ""; } };
async function loadLibrary(force) {
  if (LIB.items && !force) return LIB.items;
  if (LIB.loading && !force) return LIB.loading;
  LIB.loading = (async () => {
    try { LIB.items = (await (await api.fetchApi("/cofoty5_onenode/loras")).json()).items || []; }
    catch { LIB.items = LIB.items || []; }
    LIB.byName = new Map(LIB.items.map((x) => [x.name, x]));
    LIB.loading = null;
    PANELS.forEach((fn) => fn());
    return LIB.items;
  })();
  return LIB.loading;
}
function media(it, { fit = "cover", autoplay = false } = {}) {
  if (!it?.has_preview) return null;
  if (it.kind === "video") {
    const v = h("video", { width: "100%", height: "100%", objectFit: fit, display: "block" });
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = autoplay ? "auto" : "metadata"; v.autoplay = autoplay;
    v.src = prevURL(it.name);
    return v;
  }
  const img = h("img", { width: "100%", height: "100%", objectFit: fit, display: "block" });
  img.loading = "lazy"; img.src = prevURL(it.name);
  return img;
}
function thumbBox(it, size, fallbackName) {
  const box = h("div", { width: size + "px", height: size + "px", flexShrink: "0", borderRadius: "5px", overflow: "hidden", background: "#151515",
    display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontWeight: "bold", fontSize: Math.round(size / 3) + "px" });
  const initials = () => { box.textContent = shortName(fallbackName).slice(0, 2).toUpperCase(); };
  const m = media(it);
  if (m) { m.onerror = () => { m.remove(); initials(); }; box.append(m); if (it.kind === "video") { box.onmouseenter = () => safePlay(m); box.onmouseleave = () => m.pause?.(); } }
  else initials();
  return box;
}
let FLOAT = null;
function showFloat(it, e) {
  hideFloat();
  const f = h("div", { position: "fixed", zIndex: "10001", pointerEvents: "none", width: "340px", background: "#1b1b1b",
    border: `1px solid ${C.accent2}`, borderRadius: "8px", overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.7)", color: C.text, fontSize: "12px" });
  const mBox = h("div", { width: "100%", height: "420px", background: "#0e0e0e", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: "40px", fontWeight: "bold" });
  const m = media(it, { fit: "contain", autoplay: true });
  if (m) { m.onerror = () => { m.remove(); mBox.textContent = it.label.slice(0, 2).toUpperCase(); }; mBox.append(m); }
  else { mBox.textContent = it.label.slice(0, 2).toUpperCase(); mBox.style.height = "120px"; }
  const body = h("div", { padding: "8px 10px", display: "flex", flexDirection: "column", gap: "4px", lineHeight: "1.4" });
  body.append(h("div", { fontWeight: "bold", fontSize: "13px", wordBreak: "break-all" }, it.title || it.label));
  const meta = [it.base, it.folder].filter(Boolean).join(" · ");
  if (meta) body.append(h("div", { color: C.dim, fontSize: "11px" }, meta));
  if (it.keywords.length) body.append(h("div", { color: C.ko, fontStyle: it.guess ? "italic" : "normal" }, "키워드: " + it.keywords.join(", ") + (it.guess ? " (추정)" : "")));
  if (it.desc) body.append(h("div", { color: "#bbb", fontSize: "11px", maxHeight: "80px", overflow: "hidden" }, it.desc));
  f.append(mBox, body);
  document.body.append(f);
  FLOAT = f; moveFloat(e);
}
function moveFloat(e) {
  if (!FLOAT || !e) return;
  const W0 = 340, H0 = FLOAT.offsetHeight || 560, pad = 18;
  let x = e.clientX + pad, y = e.clientY - 40;
  if (x + W0 > window.innerWidth - 8) x = e.clientX - W0 - pad;
  if (y + H0 > window.innerHeight - 8) y = window.innerHeight - H0 - 8;
  css(FLOAT, { left: Math.max(8, x) + "px", top: Math.max(8, y) + "px" });
}
function hideFloat() { FLOAT?.remove(); FLOAT = null; }

function openPicker({ current = [], title = "LoRA 선택", fam = "anima", onPick }) {
  const back = h("div", { position: "fixed", inset: "0", background: "rgba(0,0,0,.55)", zIndex: "10000", display: "flex", alignItems: "center", justifyContent: "center" });
  const pane = h("div", { width: "min(1100px, 92vw)", height: "min(820px, 88vh)", background: "#1e1e1e",
    border: `1px solid ${C.accent2}`, borderRadius: "10px", display: "flex", flexDirection: "column", overflow: "hidden",
    color: C.text, fontSize: "12px", boxShadow: "0 10px 40px rgba(0,0,0,.6)" });
  back.append(pane);
  const close = () => { hideFloat(); back.remove(); document.removeEventListener("keydown", esc, true); };
  const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", esc, true);
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  ["keydown", "keyup", "keypress", "wheel"].forEach((ev) => pane.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev === "wheel" }));
  const top = h("div", { display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" });
  const q = h("input", { ...INPUT, flex: "1", minWidth: "160px", fontSize: "13px", padding: "5px 8px" }); q.placeholder = "이름 · 키워드 · 폴더 검색";
  const folder = h("select", { ...INPUT, fontSize: "12px", padding: "4px" });
  const anOnly = h("label", { display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", color: C.dim });
  const anCb = document.createElement("input"); anCb.type = "checkbox"; anCb.checked = famOnly(); anOnly.append(anCb, document.createTextNode(`지금 모델용만 (${FAM_NAME[fam]})`));
  anOnly.title = "LoRA는 만든 모델 계열에서만 제대로 작동합니다. 계열을 알 수 없는 LoRA는 항상 보입니다.";
  const sz = h("span", { ...CHIP });
  const paintSz = () => { const [lab, px] = THUMB_SIZES[thumbIdx()]; sz.textContent = `▦ ${lab}`; sz.title = `썸네일 크기: ${lab} (${px}px) — 누를 때마다 바뀜`; };
  paintSz();
  const re = h("span", { ...CHIP }, "↻ 새로고침");
  const x = h("span", { ...CHIP, fontSize: "14px", padding: "0 9px" }, "×");
  top.append(h("b", { fontSize: "14px" }, title), q, folder, anOnly, sz, re, x);
  const grid = h("div", { flex: "1", overflowY: "auto", padding: "12px", display: "grid",
    ...gridStyle(THUMB_SIZES[thumbIdx()][1]), gap: "10px", alignContent: "start", minHeight: "0" });
  sz.onclick = () => { nextThumb(); paintSz(); Object.assign(grid.style, gridStyle(THUMB_SIZES[thumbIdx()][1])); };
  grid.addEventListener("scroll", hideFloat);
  const foot = h("div", { padding: "6px 12px", borderTop: `1px solid ${C.line}`, color: C.dim, fontSize: "11px" },
    "마우스를 올리면 크게 보기 · 썸네일과 키워드는 LoRA 파일 옆의 미리보기 이미지/영상과 Civitai 정보 파일에서 읽습니다 (LoRA Manager가 받아 둔 것 포함).");
  pane.append(top, grid, foot);
  x.onclick = close;
  document.body.append(back);
  setTimeout(() => q.focus(), 0);
  const have = new Set(current);
  function render() {
    hideFloat();
    const items = LIB.items || [];
    const s = q.value.trim().toLowerCase(), f = folder.value;
    grid.innerHTML = "";
    const list = items.filter((it) => (!f || it.folder === f) && (!anCb.checked || famOk(it, fam))
      && (!s || (it.label + " " + it.folder + " " + (it.title || "") + " " + it.keywords.join(" ")).toLowerCase().includes(s)));
    if (!list.length) grid.append(h("div", { color: C.dim, gridColumn: "1/-1", padding: "20px" }, items.length ? "조건에 맞는 LoRA가 없습니다. ('지금 모델용만'을 끄면 전부 보입니다)" : "LoRA 목록을 불러오는 중… (models/loras 폴더가 비어 있으면 아무것도 나오지 않습니다)"));
    for (const it of list) {
      const used = have.has(it.name);
      const card = h("div", { border: `1px solid ${used ? C.accent2 : C.line}`, borderRadius: "8px", overflow: "hidden", minHeight: "max-content",
        cursor: "pointer", background: "rgba(255,255,255,.03)", display: "flex", flexDirection: "column" });
      const th = h("div", { position: "relative", width: "100%", aspectRatio: "3 / 4", flexShrink: "0", background: "#151515" });
      const inner = h("div", { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: "26px", fontWeight: "bold" });
      const m = media(it);
      if (m) { m.onerror = () => { m.remove(); inner.textContent = it.label.slice(0, 2).toUpperCase(); }; inner.append(m); }
      else inner.textContent = it.label.slice(0, 2).toUpperCase();
      th.append(inner);
      if (it.base) { const b = BASE[it.base] || [it.base, C.dim]; th.append(h("span", { position: "absolute", left: "5px", top: "5px", fontSize: "10px", padding: "0 5px", borderRadius: "6px",
        background: "rgba(0,0,0,.75)", color: b[1], border: `1px solid ${b[1]}` }, b[0])); }
      if (it.kind === "video") th.append(h("span", { position: "absolute", right: "5px", bottom: "5px", fontSize: "10px", padding: "0 4px", borderRadius: "4px", background: "rgba(0,0,0,.7)", color: "#ddd" }, "▶"));
      if (used) th.append(h("span", { position: "absolute", right: "5px", top: "5px", fontSize: "10px", padding: "0 5px", borderRadius: "6px", background: C.accent, color: "#fff" }, "사용 중"));
      const body = h("div", { padding: "5px 7px 7px", display: "flex", flexDirection: "column", gap: "2px" });
      body.append(h("div", { fontWeight: "bold", fontSize: "12px", lineHeight: "1.25", wordBreak: "break-all" }, it.label));
      if (it.keywords.length) body.append(h("div", { color: C.ko, fontSize: "10px", fontStyle: it.guess ? "italic" : "normal",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, it.keywords.slice(0, 3).join(", ")));
      card.append(th, body);
      card.onmouseenter = (e) => { card.style.borderColor = C.gold; if (it.kind === "video") safePlay(m); showFloat(it, e); };
      card.onmousemove = moveFloat;
      card.onmouseleave = () => { card.style.borderColor = used ? C.accent2 : C.line; if (it.kind === "video") m?.pause?.(); hideFloat(); };
      card.onclick = () => { close(); onPick(it.name); };
      grid.append(card);
    }
  }
  function fillFolders() {
    const cur = folder.value;
    folder.innerHTML = "";
    const all = document.createElement("option"); all.value = ""; all.textContent = "모든 폴더"; folder.append(all);
    [...new Set((LIB.items || []).map((i) => i.folder).filter(Boolean))].sort().forEach((f) => { const o = document.createElement("option"); o.value = f; o.textContent = f; folder.append(o); });
    folder.value = cur;
  }
  q.oninput = render; folder.onchange = render; anCb.onchange = () => { setFamOnly(anCb.checked); render(); };
  re.onclick = async () => { grid.innerHTML = ""; await loadLibrary(true); fillFolders(); render(); };
  loadLibrary().then(() => { fillFolders(); render(); });
  render();
}

// 숨긴 설정 칸마다 ComfyUI가 입력 소켓(구멍)을 만들어 노드 왼쪽 위에 겹쳐 보임 → 연결할 일이 없으니 없앰 (칸의 값은 그대로)
function dropSockets(node) {
  try {
    for (let i = (node.inputs?.length || 0) - 1; i >= 0; i--) {
      const sk = node.inputs[i];
      if (sk?.widget && HIDE.includes(sk.widget.name) && sk.link == null) node.removeInput(i);
    }
  } catch (e) { console.warn("[cofoty5_onenode] 소켓 정리", e); }
}

// ================================================================ 노드 화면
app.registerExtension({
  name: "cofoty5_onenode.anima",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE) return;

    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated?.apply(this, arguments);
      const node = this;
      node.color = "#1f4d4d"; node.bgcolor = "#1d2a2a";
      node.properties = node.properties || {};
      const W = (n) => node.widgets?.find((w) => w.name === n);
      HIDE.forEach((n) => { const w = W(n); if (w) { w.hidden = true; w.type = "hidden"; w.computeSize = () => [0, -4]; } });
      dropSockets(node);
      const val = (n) => W(n)?.value;
      const setVal = (n, v) => { const w = W(n); if (w) { w.value = v; w.callback?.(v); } node.setDirtyCanvas(true, true); };
      const syncers = [];
      const sync = () => syncers.forEach((f) => { try { f(); } catch (e) { console.warn("[cofoty5_onenode]", e); } });
      const st = { kwEdit: null, kwOpen: new Set(), saving: false, dragIdx: null, batchEdit: false, prev: [], pick: 0, favAdd: false, favEdit: false };

      // ---------------- 작은 부품 ----------------
      const label = (t, tip, w) => { const e = h("span", { color: C.dim, fontSize: "11px", whiteSpace: "nowrap", flexShrink: "0", ...(w ? { width: w } : {}) }, t); if (tip) e.title = tip; return e; };
      const row = (...kids) => { const e = h("div", { display: "flex", alignItems: "center", gap: "6px", minWidth: "0" }); e.append(...kids); return e; };
      const btn = (t, fn, extra = {}, tip) => { const b = h("span", { ...CHIP, ...extra }, t); b.onclick = (e) => { e.stopPropagation(); fn(e); }; if (tip) b.title = tip; return b; };
      function textArea(name, rows, ph) {
        const t = h("textarea", { ...INPUT, width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: "1.4", flexShrink: "0" });
        t.rows = rows; t.placeholder = ph || ""; noKeys(t);
        t.oninput = () => { setVal(name, t.value); if (name === "positive") renderLoras(); paintHist?.(); };
        syncers.push(() => { if (document.activeElement !== t) t.value = val(name) ?? ""; });
        return t;
      }
      function numBox(name, step, min, max, isInt, width = "58px") {
        const i = h("input", { ...INPUT, width, textAlign: "center" });
        i.type = "number"; i.step = String(step); noKeys(i);
        i.onchange = () => {
          let v = +i.value; if (!Number.isFinite(v)) v = +val(name);
          v = Math.min(max, Math.max(min, isInt ? Math.round(v) : Math.round(v * 100) / 100));
          setVal(name, v); i.value = v; sync();
        };
        syncers.push(() => { if (document.activeElement !== i) i.value = val(name); });
        return i;
      }
      function picker(name, s0 = {}) {
        const s = h("select", { ...INPUT, flex: "1", ...s0 });
        const fill = () => {
          const opts = W(name)?.options?.values || [], v = val(name);
          s.innerHTML = "";
          opts.forEach((o) => { const e = document.createElement("option"); e.value = o; e.textContent = shortName(o); e.title = o; s.append(e); });
          if (v && !opts.includes(v)) { const e = document.createElement("option"); e.value = v; e.textContent = "⚠ " + shortName(v) + " (없음)"; s.append(e); }
          s.value = v ?? ""; s.title = v || "";
        };
        s.addEventListener("mousedown", fill); s.addEventListener("focus", fill);
        s.onchange = () => { setVal(name, s.value); sync(); };
        syncers.push(fill);
        return s;
      }
      function toggle(name, text, tip, onChange) {
        const b = h("button", { ...INPUT, cursor: "pointer", padding: "4px 10px", fontWeight: "600", whiteSpace: "nowrap" }, text);
        if (tip) b.title = tip;
        const paint = () => {
          const on = !!val(name);
          css(b, on ? { background: C.accent, borderColor: C.accent2, color: "#fff" } : { background: C.bg, borderColor: C.line, color: C.dim });
        };
        b.onclick = () => { if (b.disabled) return; setVal(name, !val(name)); paint(); onChange?.(); };
        syncers.push(paint);
        return b;
      }
      function fold(key, title, body, open = false) {
        const wrap = h("div", { border: `1px solid ${C.line}`, borderRadius: "6px", background: C.box });
        const head = h("div", { display: "flex", alignItems: "center", gap: "6px", padding: "4px 8px", cursor: "pointer", userSelect: "none", fontSize: "12px" });
        const arrow = h("span", { width: "10px", color: C.dim });
        const extra = h("span", { marginLeft: "auto", color: C.dim, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: "0" });
        head.append(arrow, h("span", { fontWeight: "600", whiteSpace: "nowrap" }, title), extra);
        const inner = h("div", { padding: "2px 8px 8px", display: "flex", flexDirection: "column", gap: "6px" });
        inner.append(...body);
        const pk = "fold_" + key;
        if (node.properties[pk] === undefined) node.properties[pk] = open;
        const paint = () => { const o = !!node.properties[pk]; inner.style.display = o ? "flex" : "none"; arrow.textContent = o ? "▾" : "▸"; };
        head.onclick = () => { node.properties[pk] = !node.properties[pk]; paint(); };
        wrap.append(head, inner); paint();
        wrap._extra = extra;
        return wrap;
      }
      // 구획: 제목 + 내용. foldKey가 있으면 제목을 눌러 통째로 접고 펼침 (노드마다 기억)
      const section = (num, title, tip, foldKey) => {
        const s = h("div", { display: "flex", flexDirection: "column", gap: "6px", paddingBottom: "10px", marginBottom: "8px", borderBottom: `1px solid ${C.sep}` });
        const t = h("div", { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "700", userSelect: "none" });
        const arrow = h("span", { color: C.dim, width: "10px", fontSize: "11px" });
        t.append(h("span", { color: C.accent2 }, num), h("span", {}, title));
        if (tip) t.append(h("span", { color: C.dim, fontSize: "10px", fontWeight: "400", marginLeft: "auto" }, tip));
        const body = h("div", { display: "flex", flexDirection: "column", gap: "6px" });
        HTMLElement.prototype.append.call(s, t, body);
        s._head = t;
        s.append = (...k) => body.append(...k);
        if (foldKey) {
          t.prepend(arrow); t.style.cursor = "pointer"; t.title = "눌러서 접기 / 펼치기";
          const pk = "sec_" + foldKey;
          const paint = () => { const closed = !!node.properties[pk]; body.style.display = closed ? "none" : "flex"; arrow.textContent = closed ? "▸" : "▾"; };
          t.onclick = () => { node.properties[pk] = !node.properties[pk]; paint(); };
          paint();
          s._paint = paint;
        }
        return s;
      };
      const card = (title, right) => {
        const c = h("div", { border: `1px solid ${C.line}`, borderRadius: "6px", padding: "4px 6px 6px", background: C.box,
          display: "flex", flexDirection: "column", gap: "4px", minHeight: "0" });
        const hd = h("div", { display: "flex", alignItems: "center", gap: "5px", minHeight: "18px" });
        hd.append(h("b", { fontSize: "11px", color: C.dim, flexShrink: "0" }, title));
        if (right) hd.append(right);
        c.append(hd);
        return c;
      };

      // ---------------- 뼈대: 왼쪽 | 줄 | 오른쪽 ----------------
      const root = h("div", { display: "flex", flexDirection: "row", gap: "0", color: C.text, fontSize: "12px", boxSizing: "border-box",
        padding: "4px 2px", height: "100%", fontFamily: "sans-serif", minHeight: "0" });
      const left = h("div", { display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden", minWidth: "0", paddingRight: "6px", boxSizing: "border-box" });
      const split = h("div", { width: "7px", flexShrink: "0", cursor: "col-resize", display: "flex", justifyContent: "center", alignItems: "stretch" });
      split.append(h("div", { width: "2px", background: C.sep, borderRadius: "1px" }));
      split.title = "끌어서 좌우 폭 조절 · 두 번 눌러 기본값";
      const mid = h("div", { display: "none", flexDirection: "column", gap: "6px", minWidth: "0", padding: "0 6px", boxSizing: "border-box" });
      const split2 = h("div", { width: "7px", flexShrink: "0", cursor: "col-resize", display: "none", justifyContent: "center", alignItems: "stretch" });
      split2.append(h("div", { width: "2px", background: C.sep, borderRadius: "1px" }));
      split2.title = "끌어서 가운데 폭 조절 · 두 번 눌러 기본값";
      const right = h("div", { display: "flex", flexDirection: "column", gap: "6px", flex: "1", minWidth: "0", paddingLeft: "6px", boxSizing: "border-box" });
      root.append(left, split, mid, split2, right);
      left.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
      // 2단: 왼쪽 35% | 오른쪽.  3단: 왼쪽 | 가운데(프롬프트) | 오른쪽(미리보기) = 1:1:1
      if (node.properties.split == null) node.properties.split = 0.3;
      if (node.properties.s3a == null) node.properties.s3a = 0.23;
      if (node.properties.s3b == null) node.properties.s3b = 0.28;
      if (node.properties.layout == null) node.properties.layout = 3; // 기본은 3단
      const is3 = () => node.properties.layout === 3;
      const pct = (f) => Math.round(f * 1000) / 10 + "%";
      const applySplit = () => {
        left.style.flex = "0 0 auto";
        left.style.width = pct(is3() ? node.properties.s3a : node.properties.split);
        mid.style.flex = "0 0 auto";
        mid.style.width = pct(node.properties.s3b);
      };
      applySplit();
      const vdrag = (handle, onMove) => handle.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const rect = root.getBoundingClientRect();
        const move = (ev) => { onMove((ev.clientX - rect.left) / rect.width); applySplit(); };
        const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
        window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
      });
      vdrag(split, (f) => {
        if (is3()) node.properties.s3a = Math.min(0.5, Math.max(0.2, f));
        else node.properties.split = Math.min(0.62, Math.max(0.25, f));
      });
      vdrag(split2, (f) => { node.properties.s3b = Math.min(0.6, Math.max(0.2, f - node.properties.s3a)); });
      split.addEventListener("dblclick", () => { if (is3()) node.properties.s3a = 0.23; else node.properties.split = 0.3; applySplit(); });
      split2.addEventListener("dblclick", () => { node.properties.s3b = 0.28; applySplit(); });

      // ================= 왼쪽 ① 모델 설정 =================
      const curType = () => (val("model_type") === "ckpt" ? "ckpt" : "anima");
      const ckFam = () => MODELS.data?.ckpt_family?.[val("ckpt")] || { arch: "", label: "" };
      const curFam = () => (curType() === "anima" ? "anima" : ckFam().arch === "SD1.5" ? "sd15" : "xl");
      const s1 = section("①", "모델 설정", null, "model");
      // 지금 모델 종류 — 눈에 띄게
      const typeBadge = h("span", { padding: "1px 9px", borderRadius: "9px", fontSize: "11px", fontWeight: "800", letterSpacing: ".4px", marginLeft: "4px",
        color: "#fff", whiteSpace: "nowrap", lineHeight: "17px" });
      s1._head.insertBefore(typeBadge, s1._head.children[3] || null);
      syncers.push(() => {
        const t = curType(), f = ckFam();
        if (t === "anima") { typeBadge.textContent = "ANIMA"; css(typeBadge, { background: C.accent, border: `1px solid ${C.accent2}` }); typeBadge.title = "Anima 모델 (diffusion_models + 텍스트 인코더 + VAE)"; }
        else {
          const sd15 = f.arch === "SD1.5";
          typeBadge.textContent = sd15 ? "SD1.5 ⚠" : !f.label || f.label === "SDXL" ? "SDXL·IL" : f.label;
          css(typeBadge, { background: sd15 ? "#8a4a2a" : "#b8702a", border: "1px solid #e8a050" });
          typeBadge.title = "체크포인트 (models/checkpoints)" + (f.arch ? ` · ${f.arch}` : "") + (sd15 ? "\nSD1.5 체크포인트는 크기 · 기본값이 맞지 않을 수 있습니다 (512~768 크기 권장)" : "");
        }
      });
      s1.append(row(label("스텝", "몇 번에 걸쳐 그릴지 · Anima 터보 12 전후 · 체크포인트 25~30", "62px"), numBox("steps", 1, 1, 150, true, "56px"),
        label("CFG", "프롬프트를 얼마나 강하게 따를지 · Anima 터보 1~2 · 체크포인트 5~7"), numBox("cfg", 0.1, 0, 30, false, "56px")));
      s1.append(row(label("샘플러 · 스케줄러", "샘플러 = 그리는 방법, 스케줄러 = 단계마다 노이즈를 얼마나 걷어낼지 정하는 순서"),
        h("span", { flex: "1" })));
      s1.append(row(picker("sampler"), picker("scheduler")));
      const seedBox = numBox("seed_value", 1, 0, Number.MAX_SAFE_INTEGER, true, "100%");
      css(seedBox, { flex: "1" });
      const seedSel = h("select", { ...INPUT, flex: "0 0 66px" });
      [["랜덤", "1"], ["고정", "0"]].forEach(([t, v]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; seedSel.append(o); });
      seedSel.title = "랜덤: 생성 · 업스케일 · 보정할 때마다 시드가 바뀜 (같은 그림도 누를 때마다 조금씩 다르게)\n고정: 오른쪽 시드로 고정 — 같은 그림은 업스케일해도 매번 같은 결과";
      seedSel.onchange = () => { setVal("random_seed", seedSel.value === "1"); sync(); };
      syncers.push(() => {
        const r0 = !!val("random_seed");
        seedSel.value = r0 ? "1" : "0";
        seedBox.disabled = r0; seedBox.style.opacity = r0 ? ".45" : "1";
      });
      s1.append(row(label("시드", "같은 시드 + 같은 설정이면 같은 그림이 나옵니다", "62px"), seedSel, seedBox));

      // 모델 목록: Anima(diffusion_models)와 체크포인트(checkpoints)를 한 목록에. 고르면 종류가 자동으로 바뀜
      const addOpt = (parent, value, text, title, disabled) => { const o = document.createElement("option"); o.value = value; o.textContent = text; if (title) o.title = title; o.disabled = !!disabled; parent.append(o); return o; };
      const modelSel = h("select", { ...INPUT, flex: "1" });
      const fillModels = () => {
        const d = MODELS.data || {}, cur = curType() === "ckpt" ? "c:" + (val("ckpt") || "") : "a:" + (val("model") || "");
        modelSel.innerHTML = "";
        const gA = document.createElement("optgroup"); gA.label = "Anima (models/diffusion_models)";
        const gC = document.createElement("optgroup"); gC.label = "체크포인트 · Illustrious 등 (models/checkpoints)";
        (d.diffusion || []).forEach((n) => addOpt(gA, "a:" + n, shortName(n), n));
        if (!(d.diffusion || []).length) addOpt(gA, "", "(비어 있음)", "", true);
        (d.ckpt || []).forEach((n) => { const f = d.ckpt_family?.[n]; addOpt(gC, "c:" + n, shortName(n) + (f?.label ? `  [${f.label}]` : ""), n); });
        if (!(d.ckpt || []).length) addOpt(gC, "", "(비어 있음 — 받은 체크포인트를 이 폴더에 넣으세요)", "", true);
        modelSel.append(gA, gC);
        if (![...modelSel.options].some((o) => o.value === cur)) addOpt(modelSel, cur, "⚠ " + shortName(cur.slice(2)) + " (없음)", cur.slice(2));
        modelSel.value = cur; modelSel.title = cur.slice(2);
      };
      modelSel.addEventListener("mousedown", () => { fillModels(); loadModels(true).then(fillModels); });
      modelSel.onchange = () => {
        const v = modelSel.value; if (!v) return;
        const t = v.startsWith("c:") ? "ckpt" : "anima";
        switchType(t);
        setVal(t === "ckpt" ? "ckpt" : "model", v.slice(2));
        sync();
      };
      syncers.push(fillModels);
      // 텍스트 인코더 · VAE (Anima 전용 — 체크포인트는 안에 들어 있음)
      function listPicker(name, key) {
        const sel = h("select", { ...INPUT, flex: "1" });
        const fill = () => {
          const opts = MODELS.data?.[key] || [], v = val(name) ?? "";
          sel.innerHTML = "";
          opts.forEach((o) => addOpt(sel, o, shortName(o), o));
          if (v && !opts.includes(v)) addOpt(sel, v, "⚠ " + shortName(v) + " (없음)", v);
          if (!opts.length && !v) addOpt(sel, "", "(비어 있음)", "", true);
          sel.value = v; sel.title = v;
          const ck = curType() === "ckpt";
          sel.disabled = ck; sel.style.opacity = ck ? ".4" : "1";
          if (ck) sel.title = "체크포인트에는 텍스트 인코더와 VAE가 들어 있어 따로 고르지 않습니다";
        };
        sel.addEventListener("mousedown", fill);
        sel.onchange = () => { setVal(name, sel.value); sync(); };
        syncers.push(fill);
        return sel;
      }
      const csBox = numBox("clip_skip", 1, 1, 12, true, "56px");
      const csRow = row(label("CLIP Skip", "텍스트 인코더의 마지막 몇 층을 건너뛸지. Illustrious · NoobAI 등 애니 계열 체크포인트는 보통 2", "64px"), csBox,
        h("span", { color: C.dim, fontSize: "10px" }, "애니 계열은 보통 2"));
      const ckNote = h("div", { color: C.dim, fontSize: "10px", lineHeight: "1.4" });
      syncers.push(() => {
        const ck = curType() === "ckpt";
        csRow.style.display = ck ? "flex" : "none";
        ckNote.textContent = ck ? "체크포인트 = 모델 · 인코더 · VAE가 한 파일에 들어 있습니다. LoRA도 이 계열(SDXL·IL)용만 쓸 수 있습니다."
          : "체크포인트(Illustrious 등)를 쓰려면 받은 파일을 models/checkpoints 폴더에 넣고 위 목록에서 고르세요.";
      });
      const mFold = fold("model", "모델 · 인코더 · VAE", [
        row(label("모델", "Anima 모델 또는 체크포인트. 고르면 스텝 · CFG · 샘플러 · 품질 태그 · 부정 프롬프트 · LoRA가 그 종류에 맞게 바뀝니다 (종류마다 따로 기억)", "46px"), modelSel),
        row(label("인코더", "텍스트 인코더 (Anima: Qwen3 0.6B)", "46px"), listPicker("text_encoder", "te")),
        row(label("VAE", "", "46px"), listPicker("vae", "vae")),
        csRow, ckNote,
      ]);
      syncers.push(() => { mFold._extra.textContent = shortName(curType() === "ckpt" ? val("ckpt") : val("model")); });
      s1.append(mFold);
      left.append(s1);

      // 모델 종류 바꾸기: 지금 값을 이 종류 몫으로 기억해 두고, 다른 종류의 기억(없으면 기본값)을 꺼냄
      function switchType(t) {
        const old = curType();
        if (t === old) return;
        const tv = (node.properties.type_vals = node.properties.type_vals || {});
        tv[old] = Object.fromEntries(TYPE_F.map((n) => [n, val(n)]));
        const next = { ...PRESET[t], ...(tv[t] || {}) };
        TYPE_F.forEach((n) => { if (next[n] !== undefined && next[n] !== null) setVal(n, next[n]); });
        setVal("model_type", t);
        const what = t === "ckpt" ? "체크포인트" : "Anima";
        status.style.color = C.gold;
        status.textContent = `${what}로 바꿈 — 스텝 · CFG · 샘플러 · 품질 태그 · 부정 프롬프트 · LoRA를 ${what}용으로 바꿨습니다 (이전 값은 기억해 둠)`;
        status.title = status.textContent;
        toast(`${what} 모드: 설정을 ${what}용으로 바꿨습니다`, "info", 3500);
      }

      // ================= 왼쪽 ② 크기 · 배치 + LoRA =================
      const s2 = section("②", "크기 · LoRA");
      const orient = h("span", { display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: "8px", overflow: "hidden", marginLeft: "auto" });
      const oP = h("span", { padding: "0 8px", cursor: "pointer" }, "세로"), oL = h("span", { padding: "0 8px", cursor: "pointer" }, "가로");
      orient.append(oP, oL);
      const sizeTitle = h("div", { display: "flex", alignItems: "center", flex: "1", gap: "6px" });
      const sizeInfo = h("span", { color: C.gold, fontSize: "11px", fontWeight: "600" });
      sizeTitle.append(sizeInfo, orient);
      const sizeCard = card("크기 · 배치", sizeTitle);
      const BIG = { flex: "1", height: "24px", borderRadius: "6px", fontSize: "14px", fontWeight: "bold", padding: "0" };
      const batchRow = h("div", { display: "flex", gap: "3px", alignItems: "center" });
      const ratioRow = h("div", { display: "flex", gap: "3px", alignItems: "center" });
      const moreRow = h("div", { display: "flex", gap: "3px", alignItems: "center", flexWrap: "wrap" });
      const sizeIn = (n) => {
        const i = h("input", { ...INPUT, width: "52px", fontSize: "11px", textAlign: "center", padding: "0 2px" }); i.type = "number"; noKeys(i);
        i.onchange = () => { let v = Math.round(+i.value || 0); if (n === "batch") v = Math.min(16, Math.max(1, v)); else v = Math.max(256, Math.round(v / 16) * 16); setVal(n, v); st.batchEdit = false; renderSize(); };
        return i;
      };
      const wIn = sizeIn("width"), hIn = sizeIn("height");
      sizeCard.append(batchRow, ratioRow, moreRow);
      s2.append(sizeCard);
      const setOrient = (land) => { const w = +val("width"), hh = +val("height"); if ((w > hh) !== land && w !== hh) { setVal("width", hh); setVal("height", w); } renderSize(); };
      oP.onclick = () => setOrient(false); oL.onclick = () => setOrient(true);
      function renderSize() {
        const w = +val("width"), hh = +val("height"), b = +val("batch") || 1;
        const land = w > hh;
        css(oP, !land ? { background: C.accent, color: "#fff" } : { background: "transparent", color: C.dim });
        css(oL, land ? { background: C.accent, color: "#fff" } : { background: "transparent", color: C.dim });
        sizeInfo.textContent = `${w}×${hh} · ${b}장`;
        batchRow.innerHTML = "";
        batchRow.append(h("span", { color: C.dim, width: "26px", flexShrink: "0" }, "배치"));
        [1, 2, 3, 4].forEach((n) => batchRow.append(btn(String(n), () => { setVal("batch", n); st.batchEdit = false; renderSize(); }, { ...BIG, ...(b === n ? ON : {}) }, `한 번에 ${n}장`)));
        if (st.batchEdit) { const bi = sizeIn("batch"); css(bi, { height: "22px", fontSize: "13px", width: "40px" }); bi.value = b; batchRow.append(bi); setTimeout(() => { bi.focus(); bi.select(); }, 0); }
        else batchRow.append(btn(b > 4 ? String(b) : "…", () => { st.batchEdit = true; renderSize(); }, { ...BIG, flex: "0 0 34px", fontSize: "12px", ...(b > 4 ? ON : {}) }, "5장 이상 직접 입력 (최대 16)"));
        const flip = (lab) => lab.split(":").reverse().join(":");
        ratioRow.innerHTML = "";
        ratioRow.append(h("span", { color: C.dim, width: "26px", flexShrink: "0" }, "비율"));
        MAIN.forEach(([lab, pw, ph]) => {
          const [a, c] = land && pw !== ph ? [ph, pw] : [pw, ph];
          ratioRow.append(btn(land && pw !== ph ? flip(lab) : lab, () => { setVal("width", a); setVal("height", c); renderSize(); },
            { ...BIG, fontSize: "13px", ...(a === w && c === hh ? ON : {}) }, `${a} × ${c}`));
        });
        moreRow.innerHTML = "";
        moreRow.append(h("span", { width: "26px", flexShrink: "0" }));
        MORE.forEach(([lab, pw, ph]) => {
          const [a, c] = land ? [ph, pw] : [pw, ph];
          moreRow.append(btn(land ? flip(lab) : lab, () => { setVal("width", a); setVal("height", c); renderSize(); }, { fontSize: "10px", padding: "0 6px", ...(a === w && c === hh ? ON : {}) }, `${a} × ${c}`));
        });
        wIn.value = w; hIn.value = hh;
        moreRow.append(h("span", { flex: "1" }), wIn, h("span", { color: C.dim }, "×"), hIn);
      }
      syncers.push(renderSize);

      // LoRA
      const getL = () => { try { const v = JSON.parse(val("loras") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
      const setL = (arr) => { setVal("loras", JSON.stringify(arr.map((x) => ({ name: x.name, strength: +(+x.strength).toFixed(2), on: x.on !== false })))); renderLoras(); };
      const loraCount = h("span", { color: C.dim, fontSize: "10px" });
      const loraTitle = h("div", { display: "flex", alignItems: "center", gap: "3px", flex: "1", minWidth: "0" });
      // 세트 줄: 공통 부품 (세트 = LoRA 목록 + 종류 + 로라 프롬프트, 저장 위치 바꾸기, 지금 모델용만)
      const sets = setBar({ store: loraStore("/cofoty5_onenode"), toast, getL, setL, getFam: () => curFam(),
        getP: () => val("lora_prompt") || "", setP: (v) => setVal("lora_prompt", v),
        theme: { text: C.text, dim: C.dim, bg: C.bg, line: C.line, accent: C.accent, accent2: C.accent2, gold: C.gold, warn: C.warn } });
      const renderSets = () => sets.render();
      loraTitle.append(loraCount, h("span", { flex: "1" }), ...sets.head);
      const loraCard = card("LoRA", loraTitle);
            const list = h("div", { display: "flex", flexDirection: "column", gap: "3px", minHeight: "30px" });
      const addBtn = h("div", { ...CHIP, borderStyle: "dashed", padding: "4px", borderRadius: "6px", color: C.accent2 }, "+ LoRA 추가");
      addBtn.onclick = () => openPicker({ current: getL().map((x) => x.name), title: "LoRA 추가", fam: curFam(), onPick: (name) => { const L = getL(); if (!L.some((x) => x.name === name)) L.push({ name, strength: 0.6, on: true }); setL(L); } });
      loraCard.append(sets.body, list, addBtn);
      s2.append(loraCard);
      left.append(s2);

      // 키워드 ↔ 긍정 프롬프트
      const tagsOf = (t) => String(t || "").split(",").map((x) => x.trim()).filter(Boolean);
      const has = (kw) => tagsOf(val("positive")).some((t) => t.toLowerCase() === kw.toLowerCase());
      const addTags = (kws) => { const T = tagsOf(val("positive")); kws.forEach((k) => { if (!T.some((t) => t.toLowerCase() === k.toLowerCase())) T.push(k); }); setVal("positive", T.join(", ")); sync(); };
      const removeTags = (kws) => { const low = kws.map((k) => k.toLowerCase()); setVal("positive", tagsOf(val("positive")).filter((t) => !low.includes(t.toLowerCase())).join(", ")); sync(); };
      function kwChip(kw, guess, maxW) {
        const on = has(kw);
        const c = h("span", { fontSize: "10px", padding: "0 6px", borderRadius: "8px", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden",
          textOverflow: "ellipsis", maxWidth: maxW || "none", lineHeight: "15px", border: `1px solid ${on ? C.ok : C.line}`,
          background: on ? "rgba(76,175,80,.18)" : "transparent", color: on ? "#a8dca8" : C.ko, fontStyle: guess ? "italic" : "normal" }, (on ? "✓ " : "+ ") + kw);
        c.title = (on ? "긍정 프롬프트에서 빼기" : "긍정 프롬프트에 넣기") + ` — ${kw}` + (guess ? "\n(학습 태그로 추정한 키워드)" : "");
        c.onclick = (e) => { e.stopPropagation(); on ? removeTags([kw]) : addTags([kw]); };
        return c;
      }
      function renderLoras() {
        if (LIB.items && !st.healing) { // 폴더를 옮긴 LoRA: 같은 파일 이름을 찾아 고침
          const fileOf = (n) => String(n || "").split(/[\\/]/).pop().toLowerCase();
          let fixed = false;
          const healed = getL().map((x) => {
            if (LIB.byName.has(x.name)) return x;
            const hit = LIB.items.filter((it) => fileOf(it.name) === fileOf(x.name)).sort((a, b) => a.name.length - b.name.length)[0];
            if (!hit) return x;
            fixed = true;
            return { ...x, name: hit.name };
          });
          if (fixed) { st.healing = true; try { setL(healed); } finally { st.healing = false; } return; }
        }
        const L = getL();
        const onN = L.filter((x) => x.on !== false).length;
        loraCount.textContent = L.length ? `${onN}/${L.length}` : "";
        list.innerHTML = "";
        if (!L.length) list.append(h("div", { color: C.dim, padding: "6px", textAlign: "center", fontSize: "11px" }, "LoRA 없음"));
        L.forEach((x, i) => {
          const meta = LIB.byName.get(x.name);
          const off = x.on === false;
          const open = st.kwOpen.has(x.name);
          const rowE = h("div", { display: "flex", gap: "4px", alignItems: "flex-start", padding: "3px", borderRadius: "6px",
            border: `1px solid ${C.line}`, background: off ? "transparent" : "rgba(69,176,176,.07)" });
          const fade = off ? "0.45" : "1";
          const lead = h("div", { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingTop: "2px" });
          const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !off; css(cb, { margin: "0", cursor: "pointer" });
          cb.title = "켜기/끄기 (세기는 그대로)";
          cb.onchange = () => { const A = getL(); A[i].on = cb.checked; setL(A); };
          const grip = h("div", { cursor: "grab", color: "#666", fontSize: "10px", lineHeight: "10px", userSelect: "none" }, "⋮⋮");
          grip.draggable = true; grip.title = "끌어서 순서 변경 (위에서부터 적용)";
          grip.addEventListener("dragstart", (e) => { st.dragIdx = i; try { e.dataTransfer.setData("text/plain", String(i)); } catch {} });
          rowE.addEventListener("dragover", (e) => { if (st.dragIdx != null) { e.preventDefault(); rowE.style.borderTopColor = C.accent2; } });
          rowE.addEventListener("dragleave", () => (rowE.style.borderTopColor = ""));
          rowE.addEventListener("drop", (e) => { e.preventDefault(); if (st.dragIdx == null) return; const A = getL(); const [m] = A.splice(st.dragIdx, 1); A.splice(i, 0, m); st.dragIdx = null; setL(A); });
          lead.append(cb, grip);
          const th = thumbBox(meta, 38, x.name);
          css(th, { cursor: "pointer", opacity: fade });
          th.title = "눌러서 다른 LoRA로 바꾸기";
          const repick = () => openPicker({ current: getL().map((y) => y.name), title: "LoRA 바꾸기", fam: curFam(), onPick: (name) => { const A = getL(); A[i] = { ...A[i], name }; setL(A); } });
          th.onclick = repick;
          th.onmouseenter = (e) => meta && showFloat(meta, e); th.onmousemove = moveFloat; th.onmouseleave = hideFloat;
          const body = h("div", { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px", opacity: fade });
          const nm = h("div", { fontWeight: "bold", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", lineHeight: "16px" }, shortName(x.name));
          nm.title = x.name + (meta?.title ? "\n" + meta.title : "") + "\n눌러서 다른 LoRA로 바꾸기"; nm.onclick = repick;
          const l2 = h("div", { display: "flex", alignItems: "center", gap: "3px", minWidth: "0" });
          const lf = loraFam(meta || { name: x.name });
          if (meta?.base || lf) {
            const b = meta?.base ? BASE[meta.base] || [meta.base.slice(0, 3), C.dim] : [lf === "anima" ? "AN" : lf === "xl" ? "XL" : lf.toUpperCase()];
            const okB = !lf || lf === curFam(), col = okB ? "#6fae6f" : "#d06a6a";
            const bd = h("span", { fontSize: "9px", padding: "0 3px", borderRadius: "4px", border: `1px solid ${col}`, color: col, flexShrink: "0", lineHeight: "13px" }, b[0] + (okB ? "" : "⚠"));
            bd.title = (meta?.base || FAM_NAME[lf] || "") + (okB ? "" : ` — 지금 모델(${FAM_NAME[curFam()]})용 LoRA가 아니라 적용되지 않거나 그림이 깨질 수 있습니다`);
            l2.append(bd);
          }
          if (!meta && LIB.items) l2.append(h("span", { fontSize: "9px", color: "#e88", flexShrink: "0" }, "⚠없음"));
          const kws = meta?.keywords || [];
          const kwWrap = h("div", { display: "flex", alignItems: "center", gap: "3px", minWidth: "0", flex: "1", overflow: "hidden" });
          if (kws.length) kwWrap.append(kwChip(kws[0], meta?.guess, "100%"));
          const more = h("span", { fontSize: "10px", padding: "0 5px", borderRadius: "8px", cursor: "pointer", border: `1px solid ${C.line}`,
            color: C.dim, flexShrink: "0", lineHeight: "15px" }, open ? "▴" : kws.length > 1 ? `+${kws.length - 1}` : kws.length ? "▾" : "✎");
          more.title = open ? "접기" : kws.length ? "키워드 모두 보기 / 고치기" : "키워드 넣기";
          more.onclick = (e) => { e.stopPropagation(); if (!kws.length && !open) st.kwEdit = x.name; open ? st.kwOpen.delete(x.name) : st.kwOpen.add(x.name); renderLoras(); };
          kwWrap.append(more);
          l2.append(kwWrap);
          const step = (d) => { const A = getL(); A[i].strength = Math.max(-3, Math.min(3, +(+A[i].strength + d).toFixed(2))); setL(A); };
          const mini = (t, fn) => { const b = h("span", { width: "15px", height: "15px", lineHeight: "14px", textAlign: "center", borderRadius: "8px",
            border: `1px solid ${C.line}`, cursor: "pointer", fontSize: "12px", userSelect: "none", flexShrink: "0" }, t); b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
          const sv = h("span", { minWidth: "28px", textAlign: "center", fontSize: "12px", fontWeight: "bold", cursor: "text", flexShrink: "0", color: off ? C.dim : C.gold }, fmt(x.strength));
          sv.title = "세기 — 눌러서 직접 입력";
          sv.onclick = () => {
            const inp = h("input", { ...INPUT, width: "42px", textAlign: "center", fontSize: "12px", padding: "0" }); inp.type = "number"; inp.step = "0.05"; inp.value = x.strength; noKeys(inp);
            const ok = () => { const A = getL(); A[i].strength = Math.max(-3, Math.min(3, +inp.value || 0)); setL(A); };
            inp.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") renderLoras(); });
            inp.addEventListener("blur", ok);
            sv.replaceWith(inp); inp.focus(); inp.select();
          };
          const del = h("span", { color: "#e88", cursor: "pointer", fontSize: "13px", padding: "0 1px", flexShrink: "0" }, "×"); del.title = "목록에서 빼기";
          del.onclick = (e) => { e.stopPropagation(); const A = getL(); A.splice(i, 1); st.kwOpen.delete(x.name); setL(A); };
          l2.append(mini("−", () => step(-0.05)), sv, mini("+", () => step(0.05)), del);
          body.append(nm, l2);
          if (open) {
            const ex = h("div", { display: "flex", flexWrap: "wrap", gap: "3px", alignItems: "center", paddingTop: "1px" });
            if (st.kwEdit === x.name) {
              const inp = h("input", { ...INPUT, flex: "1", minWidth: "100px", fontSize: "11px" }); noKeys(inp); inp.value = kws.join(", "); inp.placeholder = "키워드를 쉼표로 구분";
              const save = async () => { try { await api.fetchApi("/cofoty5_onenode/lora_keywords", { method: "POST", body: JSON.stringify({ name: x.name, keywords: inp.value }) }); } catch {} st.kwEdit = null; await loadLibrary(true); };
              inp.addEventListener("keydown", (e) => { if (e.isComposing) return; if (e.key === "Enter") save(); if (e.key === "Escape") { st.kwEdit = null; renderLoras(); } });
              ex.append(inp, btn("저장", save, ON), btn("원래대로", async () => { try { await api.fetchApi("/cofoty5_onenode/lora_keywords", { method: "POST", body: JSON.stringify({ name: x.name, keywords: null }) }); } catch {} st.kwEdit = null; loadLibrary(true); }, {}, "직접 고친 키워드를 지우고 파일 정보로 되돌리기"));
              setTimeout(() => inp.focus(), 0);
            } else {
              kws.slice(1).forEach((k) => ex.append(kwChip(k, meta?.guess)));
              if (kws.length > 1) {
                const allOn = kws.every(has);
                ex.append(btn(allOn ? "모두 빼기" : "모두 넣기", () => { allOn ? removeTags(kws) : addTags(kws); }, { fontSize: "10px", padding: "0 6px" }));
              }
              ex.append(btn("✎ 고치기", () => { st.kwEdit = x.name; renderLoras(); }, { fontSize: "10px", padding: "0 6px", color: C.dim }));
            }
            body.append(ex);
          }
          rowE.append(lead, th, body);
          list.append(rowE);
        });
        renderSets();
      }
      syncers.push(renderLoras);

      // ================= 왼쪽 ③ 업스케일 · 보정 =================
      const s3 = section("③", "업스케일 · 보정", "저장할 때 적용", "upfix");
      const upCard = card("업스케일", h("span", { color: C.dim, fontSize: "10px", marginLeft: "auto" }, "[업스케일 저장]에만"));
      upCard.append(
        row(label("배율", "몇 배로 키울지", "62px"), numBox("up_scale", 0.05, 1, 2, false, "56px"),
          label("디노이즈", "키운 그림을 얼마나 다시 그릴지. 낮을수록 원본 유지"), numBox("up_denoise", 0.05, 0.05, 1, false, "56px")),
        row(label("샘플러 · 스케줄러", "업스케일 때 쓰는 샘플러 · 스케줄러")),
        row(picker("up_sampler"), picker("up_scheduler")),
      );
      s3.append(upCard);
      const fixCard = card("손 · 얼굴 보정", null);
      const faceTg = toggle("face_fix", "얼굴 보정", "저장할 때 얼굴을 찾아 다시 그립니다.", () => show());
      const handTg = toggle("hand_fix", "손 보정", "저장할 때 손을 찾아 다시 그립니다.", () => show());
      const fixNote = h("span", { color: C.warn, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
      fixCard.append(
        row(faceTg, label("디노이즈"), numBox("face_denoise", 0.05, 0.05, 1, false, "56px")),
        row(handTg, label("디노이즈"), numBox("hand_denoise", 0.05, 0.05, 1, false, "56px")),
        fixNote,
      );
      css(faceTg, { width: "84px" }); css(handTg, { width: "84px" });
      s3.append(fixCard);
      left.append(s3);
      api.fetchApi("/cofoty5_onenode/info").then((r) => r.json()).then((d) => {
        const im = d.impact || {};
        if (!im.ok) {
          [faceTg, handTg].forEach((b) => { b.disabled = true; b.style.opacity = ".4"; b.style.cursor = "not-allowed"; });
          fixNote.textContent = "Impact Pack이 없어 보정을 쓸 수 없습니다"; fixNote.title = im.msg || "";
        } else if (im.msg) { fixNote.textContent = "⚠ 감지 모델 없음"; fixNote.title = im.msg; }
      }).catch(() => {});

      // ================= 왼쪽 ④ 목록으로 연속 생성 =================
      // input/onenode 폴더의 엑셀 · CSV · 메모장 항목을 체크해서, 항목마다 태그를 붙여 이어서 생성
      const P = node.properties;
      if (P.sec_auto == null) P.sec_auto = true; // 처음엔 접혀 있음
      if (!Array.isArray(P.auto_sel)) P.auto_sel = [];
      if (!AUTO_MODES.some((m) => m[0] === P.auto_mode)) P.auto_mode = "save";
      const s4 = section("④", "목록으로 연속 생성", null, "auto");
      css(s4, { borderBottom: "0", marginBottom: "0" });
      const helpB = btn("? 사용법", () => openHelp(), { marginLeft: "auto", fontWeight: "400", fontSize: "11px", color: C.accent2 }, "자동 생성 사용법 · 항목 파일 작성법");
      s4._head.append(helpB);
      const IT = { rows: [], files: [], err: "", q: "", dir: "", bar: false };
      const fileSel = h("select", { ...INPUT, flex: "1" });
      fileSel.title = "ComfyUI/input/onenode 폴더의 항목 파일 (최근에 고친 파일이 위)";
      fileSel.onchange = () => { P.auto_file = fileSel.value; loadRows(); };
      const reB = btn("↻", () => loadFiles(), {}, "파일 목록과 내용을 다시 읽기 (파일을 고쳤거나 새로 넣었으면 누르세요)");
      const openItemDir = async () => {
        try { const r = await (await api.fetchApi("/cofoty5_onenode/items/open", { method: "POST" })).json(); if (r.error) toast("폴더를 열지 못했습니다: " + r.error, "warn"); }
        catch { toast("폴더를 열지 못했습니다", "warn"); }
      };
      const dirB = btn("📂", openItemDir, {}, "항목 폴더 열기 (ComfyUI/input/onenode) — 여기에 파일을 넣으세요");
      const search = h("input", { ...INPUT, flex: "1", fontSize: "11px" }); noKeys(search);
      search.placeholder = "찾기 (이름 · 태그)";
      search.oninput = () => { IT.q = search.value.trim().toLowerCase(); renderList(); };
      const selAll = btn("전체", () => { selItems(shown(), true); }, {}, "보이는 항목 모두 체크");
      const selNone = btn("해제", () => { selItems(shown(), false); }, {}, "보이는 항목 모두 체크 해제");
      const cnt = h("span", { color: C.dim, fontSize: "11px", marginLeft: "auto", whiteSpace: "nowrap" });
      const itemBox = h("div", { maxHeight: "230px", overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: "4px", background: C.bg, padding: "3px 4px", display: "flex", flexDirection: "column", gap: "1px" });
      itemBox.addEventListener("wheel", (e) => { if (itemBox.scrollHeight > itemBox.clientHeight + 1) e.stopPropagation(); }, { passive: true });
      const modeRow = h("div", { display: "flex", gap: "4px", flexWrap: "wrap" });
      const modeBtns = AUTO_MODES.map(([k, t, tip]) => {
        const b = btn(t, () => { if (st.auto) return; P.auto_mode = k; paintAuto(); }, { flex: "1", padding: "3px 6px" }, tip);
        b._k = k; modeRow.append(b); return b;
      });
      const modeTip = h("div", { color: C.dim, fontSize: "10px", lineHeight: "1.4" });
      const nextCb = h("input"); nextCb.type = "checkbox"; css(nextCb, { margin: "0", cursor: "pointer" });
      nextCb.onchange = () => { P.auto_next = nextCb.checked; paintAuto(); };
      const nextLb = h("label", { display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", cursor: "pointer" });
      nextLb.title = "켜면: 그림을 저장하면 바로 다음 항목을 만듭니다\n끄면: 여러 번 저장할 수 있고, [다음 생성]을 눌러야 넘어갑니다";
      nextLb.append(nextCb, h("span", {}, "저장하면 자동 다음 생성"));
      const startB = h("button", { ...INPUT, flex: "1", padding: "6px 4px", fontSize: "12px", fontWeight: "700", cursor: "pointer", border: "0", background: C.accent, color: "#fff" }, "▶ 목록 생성 시작");
      const stopB = h("button", { ...INPUT, padding: "6px 10px", fontSize: "12px", fontWeight: "700", cursor: "pointer", border: "0", background: "#6b2d2d", color: "#fff", display: "none" }, "■ 그만");
      const prog = h("div", { color: C.dim, fontSize: "11px", minHeight: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
      s4.append(row(fileSel, reB, dirB), row(search, selAll, selNone), cnt, itemBox, label("진행 방식"), modeRow, modeTip, nextLb, row(startB, stopB), prog);
      css(cnt, { marginLeft: "0" });
      left.append(s4);

      const selSet = () => new Set(P.auto_sel);
      const selItems = (rows, on) => {
        const S = selSet();
        rows.forEach((r) => (on ? S.add(r.key) : S.delete(r.key)));
        P.auto_sel = [...S]; renderList();
      };
      const shown = () => IT.rows.filter((r) => !IT.q || (r.label + " " + r.tags + " " + r.category).toLowerCase().includes(IT.q));
      const selected = () => { const S = selSet(); return IT.rows.filter((r) => S.has(r.key)); };
      async function loadFiles() {
        try {
          const d = await (await api.fetchApi("/cofoty5_onenode/items/files")).json();
          IT.files = d.files || []; IT.dir = d.dir || "";
        } catch { IT.files = []; }
        fileSel.innerHTML = "";
        if (!IT.files.length) {
          const o = document.createElement("option"); o.value = ""; o.textContent = "(input/onenode 폴더에 파일 없음)"; fileSel.append(o);
        }
        IT.files.forEach((f) => { const o = document.createElement("option"); o.value = f; o.textContent = f; fileSel.append(o); });
        if (!IT.files.includes(P.auto_file)) P.auto_file = IT.files[0] || "";
        fileSel.value = P.auto_file || "";
        await loadRows();
      }
      async function loadRows() {
        IT.rows = []; IT.err = "";
        if (P.auto_file) {
          try {
            const r = await api.fetchApi("/cofoty5_onenode/items/rows?file=" + encodeURIComponent(P.auto_file));
            const d = await r.json();
            if (d.error) IT.err = d.error; else IT.rows = d.rows || [];
          } catch (e) { IT.err = "파일을 읽지 못했습니다"; }
        }
        renderList();
      }
      function renderList() {
        itemBox.innerHTML = "";
        const S = selSet(), rows = shown();
        if (IT.err || !IT.rows.length) {
          const m = h("div", { color: IT.err ? C.warn : C.dim, fontSize: "11px", padding: "6px 4px", lineHeight: "1.5" });
          m.textContent = IT.err || (P.auto_file ? "읽을 항목이 없습니다. 첫 줄 제목(이름 | 태그)과 태그 칸을 확인하세요." : "📂를 눌러 열리는 폴더에 엑셀 · CSV · 메모장 파일을 넣고 ↻를 누르세요.");
          itemBox.append(m);
        }
        const cats = [];
        rows.forEach((r) => { let c = cats.find((x) => x.name === r.category); if (!c) cats.push((c = { name: r.category, rows: [] })); c.rows.push(r); });
        const box = (on, part) => { const b = h("input"); b.type = "checkbox"; b.checked = on; b.indeterminate = !!part; css(b, { margin: "0", cursor: "pointer", flexShrink: "0" }); return b; };
        cats.forEach((c) => {
          const n = c.rows.filter((r) => S.has(r.key)).length;
          const hd = h("label", { display: "flex", alignItems: "center", gap: "5px", fontWeight: "700", fontSize: "11px", padding: "2px 0", cursor: "pointer", color: C.accent2 });
          const cb = box(n === c.rows.length, n > 0 && n < c.rows.length);
          cb.onchange = () => selItems(c.rows, cb.checked);
          hd.append(cb, h("span", {}, c.name), h("span", { color: C.dim, fontWeight: "400" }, `${n}/${c.rows.length}`));
          itemBox.append(hd);
          c.rows.forEach((r) => {
            const ln = h("label", { display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", padding: "1px 0 1px 14px", cursor: "pointer", minWidth: "0" });
            const b = box(S.has(r.key));
            b.onchange = () => selItems([r], b.checked);
            ln.title = r.tags;
            ln.append(b, h("span", { whiteSpace: "nowrap", flexShrink: "0" }, r.label),
              h("span", { color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: "0" }, r.tags));
            itemBox.append(ln);
          });
        });
        paintAuto();
      }
      const autoItem = (a) => { const it = a.items[a.i]; return JSON.stringify({ tags: it.tags, label: it.label, mode: a.mode, i: a.i, n: a.n }); };
      async function queueMe() {
        try { await app.queuePrompt(0, 1, { queueNodeIds: [node.id] }); }
        catch { await app.queuePrompt(0, 1); }
      }
      async function startAuto() {
        if (st.auto) return;
        const items = selected();
        if (!items.length) { toast("목록에서 만들 항목을 체크하세요", "warn"); return; }
        const mode = P.auto_mode, n = items.length, b = +val("batch") || 1;
        if (mode !== "watch" && n * b >= 40 && !confirm(`${n}개 항목 × 배치 ${b}장 = ${n * b}장을 만들어 저장합니다.\n시간이 오래 걸릴 수 있습니다. 계속할까요?`)) return;
        st.auto = { mode, items, n, i: 0, done: 0, saved: 0, err: 0, queued: 0, wait: "" };
        if (mode === "watch") { autoGen(); return; }
        paintAuto();
        for (let i = 0; i < n; i++) {
          const a = st.auto; if (!a) break;
          a.i = i;
          setVal("auto", autoItem(a)); setVal("action", "auto");
          try { await queueMe(); a.queued = i + 1; }
          catch (e) { toast("대기열에 넣지 못했습니다: " + (e?.message || e), "error"); break; }
          finally { setVal("action", "generate"); setVal("auto", ""); }
          paintAuto();
        }
        if (st.auto && !st.auto.queued) { st.auto = null; paintAuto(); }
      }
      async function autoGen() {
        const a = st.auto; if (!a) return;
        a.wait = "gen"; paintAuto();
        setVal("auto", autoItem(a));
        try { await go("generate"); } finally { setVal("auto", ""); }
      }
      function autoNext() {
        const a = st.auto; if (!a) return;
        a.done++; a.i++;
        if (a.i >= a.n) return autoFinish();
        autoGen();
      }
      function autoFinish() {
        const a = st.auto; st.auto = null;
        if (a) {
          const m = `목록으로 연속 생성 끝: ${a.n}개 항목${a.saved ? ` · ${a.saved}장 저장` : ""}${a.err ? ` · ⚠ 오류 ${a.err}개` : ""}`;
          toast(m, a.err ? "warn" : "success", 6000);
          status.style.color = a.err ? C.warn : C.text; status.textContent = m; prog.textContent = m;
        }
        paintAuto(); show();
      }
      async function stopAuto() {
        const a = st.auto; st.auto = null;
        if (a && a.mode !== "watch") {
          try {
            const q = await (await api.fetchApi("/queue")).json();
            const mine = (e) => e?.[2]?.[String(node.id)]?.inputs?.action === "auto";
            const ids = (q.queue_pending || []).filter(mine).map((e) => e[1]);
            if (ids.length) await api.fetchApi("/queue", { method: "POST", body: JSON.stringify({ delete: ids }) });
            if ((q.queue_running || []).some(mine)) await api.fetchApi("/interrupt", { method: "POST" });
          } catch {}
        }
        if (a) { prog.textContent = `멈춤: ${a.done} / ${a.n}개 항목까지 했습니다${a.saved ? ` (${a.saved}장 저장)` : ""}`; status.textContent = prog.textContent; }
        paintAuto(); show();
      }
      startB.onclick = startAuto;
      stopB.onclick = stopAuto;
      // ④ 결과 받기 (_cofoty5Show에서 부름)
      const autoResult = (out) => {
        const a = st.auto; if (!a) return;
        if (out?.cofoty5_auto?.length && a.mode !== "watch") {
          a.done++; a.saved += out.cofoty5_auto[0].count || 0;
          if (a.done >= a.n) return autoFinish();
        } else if (a.mode === "watch") {
          if (out?.cofoty5_error) a.wait = a.wait === "gen" ? "err" : "pick";
          else if (out?.cofoty5_previews?.length && (a.wait === "gen" || a.wait === "err")) a.wait = "pick";
          else if (out?.cofoty5_saved?.length && a.wait === "save") {
            a.saved += out.cofoty5_saved.length;
            if (P.auto_next) return autoNext();
            a.wait = "pick";
          }
        } else if (out?.cofoty5_error) {
          a.done++; a.err++;
          if (a.done >= a.n) return autoFinish();
        }
        paintAuto();
      };
      // 대기열이 비었는데 아직 진행 중이면(다른 곳에서 취소 등) 정리
      const onStatus = (e) => {
        const a = st.auto;
        if (!a || a.mode === "watch" || a.queued < a.n) return;
        if ((e.detail?.exec_info?.queue_remaining ?? 1) === 0) setTimeout(() => { if (st.auto === a) autoFinish(); }, 1500);
      };
      api.addEventListener("status", onStatus);
      function paintAuto() {
        const a = st.auto, S = selSet(), nSel = IT.rows.filter((r) => S.has(r.key)).length, b = +val("batch") || 1;
        cnt.textContent = IT.rows.length ? `${nSel}개 체크 / 전체 ${IT.rows.length}개` : "";
        modeBtns.forEach((m) => { css(m, m._k === P.auto_mode ? ON : { background: C.bg, borderColor: C.line, color: C.text }); m.style.opacity = a && m._k !== P.auto_mode ? ".4" : "1"; });
        nextCb.checked = !!P.auto_next; nextLb.style.display = P.auto_mode === "watch" ? "flex" : "none";
        modeTip.textContent = (AUTO_MODES.find((m) => m[0] === P.auto_mode) || AUTO_MODES[0])[2] + ` · 항목마다 배치 ${b}장`;
        startB.disabled = !!a || !nSel;
        startB.style.opacity = startB.disabled ? ".45" : "1";
        startB.textContent = P.auto_mode === "watch" ? `▶ 보면서 진행 시작 (${nSel}개)` : `▶ 목록 생성 시작 (${nSel}개 × ${b}장)`;
        stopB.style.display = a ? "" : "none";
        const cur = a ? a.items[Math.min(a.i, a.n - 1)] : null;
        if (a) {
          prog.style.color = C.text;
          prog.textContent = a.mode === "watch"
            ? `👀 ${a.i + 1} / ${a.n} · ${cur.label}` + (a.wait === "gen" ? " — 생성 중…" : a.wait === "save" ? " — 저장 중…" : " — 오른쪽 버튼으로 저장 · 다음")
            : `⚡ ${a.done} / ${a.n}개 끝${a.queued < a.n ? ` (대기열에 넣는 중 ${a.queued}/${a.n})` : ""}${a.saved ? ` · ${a.saved}장 저장` : ""}`;
          [fileSel, search].forEach((e) => (e.disabled = true));
        } else [fileSel, search].forEach((e) => (e.disabled = false));
        // 오른쪽: 보면서 진행 버튼 줄
        if (!IT.bar) return;
        const watch = a && a.mode === "watch";
        mainRow.style.display = a ? "none" : "flex";
        autoBar.style.display = a ? "flex" : "none";
        autoInfo.textContent = !a ? "" : watch
          ? `👀 목록 ${a.i + 1} / ${a.n} · ${cur.label}` + (a.wait === "pick" ? " — 마음에 드는 그림을 고르세요" : a.wait === "gen" ? " — 생성 중…" : a.wait === "err" ? " — ⚠ 오류: [다음 생성]으로 넘어가세요" : " — 저장 중…")
          : `⚡ 목록으로 연속 생성 중 ${a.done} / ${a.n} · 끝날 때까지 그대로 두세요`;
        const last = a && a.i >= a.n - 1, busy = !watch || a.wait !== "pick";
        const nx = P.auto_next ? " >>" : "";
        aNext.textContent = last ? "✔ 끝내기" : "⏭ 다음 생성";
        aSave.textContent = "💾 그대로 저장" + nx;
        aUp.textContent = "⬆ 업스케일 저장" + nx;
        aSaveAll.textContent = "💾 모두 그냥 저장" + nx;
        aUpAll.textContent = "⬆ 모두 업스케일 저장" + nx;
        nextCb2.checked = !!P.auto_next; nextLb2.style.display = watch ? "flex" : "none";
        [aNext, aSave, aUp, aSaveAll, aUpAll].forEach((x) => {
          const off = busy && !(x === aNext && a?.wait === "err");
          x.style.display = watch ? "" : "none"; x.disabled = off; x.style.opacity = off ? ".45" : "1";
        });
        aNext.parentElement.style.display = watch ? "flex" : "none";
      }
      function openHelp() {
        const ov = h("div", { position: "fixed", inset: "0", background: "rgba(0,0,0,.55)", zIndex: "10000", display: "flex", alignItems: "center", justifyContent: "center" });
        const box = h("div", { background: C.box, color: C.text, border: `1px solid ${C.line}`, borderRadius: "8px", width: "min(720px, 92vw)", maxHeight: "86vh",
          display: "flex", flexDirection: "column", fontFamily: "sans-serif", fontSize: "13px", boxShadow: "0 8px 30px rgba(0,0,0,.5)" });
        const top = h("div", { display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderBottom: `1px solid ${C.line}` });
        const tabs = [["use", "사용법"], ["sheet", "항목 파일 작성법"]];
        let cur = "use";
        const tabEls = tabs.map(([k, t]) => { const e = btn(t, () => { cur = k; paint(); }, { padding: "3px 12px", fontSize: "12px" }); e._k = k; return e; });
        const close = btn("✕ 닫기", () => ov.remove(), { marginLeft: "auto" });
        top.append(h("b", { fontSize: "14px", marginRight: "6px" }, "④ 목록으로 연속 생성"), ...tabEls, close);
        const body = h("div", { padding: "12px 18px 16px", overflowY: "auto", lineHeight: "1.65" });
        body.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
        const foot = h("div", { display: "flex", gap: "8px", padding: "8px 14px", borderTop: `1px solid ${C.line}`, alignItems: "center" });
        foot.append(btn("📂 항목 폴더 열기", openItemDir), h("span", { color: C.dim, fontSize: "11px" }, IT.dir || "ComfyUI/input/onenode"));
        const T = {
          use: `
<p>엑셀 · 메모장에 적어 둔 <b>항목</b>(표정, 포즈, 의상 등)을 체크하면, 항목마다 태그를 붙여 <b>한 번에 이어서 생성</b>합니다.
모델 · 크기 · LoRA · 프롬프트 · 구도 버튼은 지금 설정 그대로 쓰고, 항목 태그만 바뀝니다.</p>
<h4>순서</h4>
<ol>
<li><b>📂</b>을 눌러 항목 폴더(<code>ComfyUI/input/onenode</code>)를 엽니다. 처음엔 <code>항목_예시.xlsx</code>, <code>항목_예시.txt</code>가 들어 있습니다.</li>
<li>내 항목 파일을 그 폴더에 넣고 <b>↻</b>를 누른 뒤, 위 목록에서 파일을 고릅니다.</li>
<li>만들 항목을 체크합니다. 분류 제목을 체크하면 그 분류 전체, <b>전체 / 해제</b>는 지금 보이는 항목 모두.</li>
<li><b>진행 방식</b>을 고르고 <b>▶ 시작</b>.</li>
</ol>
<h4>진행 방식</h4>
<ul>
<li><b>⚡ 바로 저장</b> — 체크한 항목을 끝까지 자동으로 만들고, 나온 그림을 전부 그대로 저장합니다.</li>
<li><b>⚡ 업스케일 저장</b> — 끝까지 자동으로 만들고, 전부 업스케일해서 저장합니다. ③ 업스케일 · 보정 설정을 씁니다 (얼굴 · 손 보정을 켜 두면 보정까지).</li>
<li><b>👀 보면서 진행</b> — 한 항목씩 만들고 멈춥니다. 미리보기에서 그림을 고르고 오른쪽 버튼으로 저장합니다.
 <b>💾 그대로 저장</b> · <b>⬆ 업스케일 저장</b>은 고른 한 장, <b>💾 모두 그냥 저장</b> · <b>⬆ 모두 업스케일 저장</b>은 미리보기 전부.
 여러 장을 따로 저장해도 되고, 다 됐으면 <b>⏭ 다음 생성</b>으로 다음 항목으로 넘어갑니다.<br>
 <b>☑ 저장하면 자동 다음 생성</b>을 켜 두면 저장 버튼 한 번으로 바로 다음 항목이 만들어집니다.</li>
</ul>
<h4>알아 두면 좋은 것</h4>
<ul>
<li>한 항목에서 만드는 장수는 <b>② 배치</b> 숫자입니다. (예: 항목 10개 × 배치 2장 = 20장)</li>
<li>항목 태그는 <b>본 프롬프트 → 구도 버튼 → 항목 태그 → 배경 · 기타</b> 순서로 붙습니다. 본 프롬프트 글자는 바뀌지 않습니다.</li>
<li>저장 파일 이름 앞에 항목 이름이 붙습니다. 예: <code>웃음_20261111_0001.png</code></li>
<li>⚡ 방식은 항목마다 ComfyUI 대기열에 한 번씩 들어갑니다. 자리를 비워도 끝까지 돕니다. 중간에 멈추려면 ④의 <b>■ 그만</b> (남은 대기열을 지움). 보면서 진행도 ④의 <b>■ 그만</b>으로 언제든 끝낼 수 있습니다.</li>
<li>시드를 <b>고정</b>으로 두면 모든 항목이 같은 시드로 만들어져 표정 · 포즈만 비교하기 좋습니다. <b>랜덤</b>이면 항목마다 다른 그림.</li>
<li>파일 내용을 고쳤다면 <b>↻</b>를 눌러야 반영됩니다. 체크는 이름이 같으면 유지됩니다.</li>
</ul>`,
          sheet: `
<p>파일은 <code>ComfyUI/input/onenode</code> 폴더에 넣습니다. 읽는 형식: <b>엑셀(.xlsx) · CSV · TSV · 메모장(.txt)</b></p>
<h4>엑셀 (추천)</h4>
<ul>
<li>첫 줄은 제목 줄: <b>이름 | 태그</b> (분류까지 쓰려면 <b>분류 | 이름 | 태그</b>)</li>
<li><b>시트 하나 = 분류 하나</b> — 분류 열이 없으면 시트 이름이 분류가 됩니다. (표정 시트, 포즈 시트 …)</li>
<li>분류 칸이 비어 있으면 위 줄의 분류를 이어받습니다 (셀 병합해도 됨).</li>
<li>이름이 <code>#</code>으로 시작하는 줄 · 시트는 읽지 않습니다 (메모 · 설명용).</li>
<li>태그 칸이 빈 줄은 건너뜁니다. 이름 칸이 비면 태그 앞부분이 이름이 됩니다.</li>
<li>태그 칸에 <code>&lt;lora:이름:0.8&gt;</code>을 쓰면 그 항목에만 LoRA가 붙습니다.</li>
</ul>
<table style="border-collapse:collapse;font-size:12px;margin:4px 0 8px">
<tr><th style="border:1px solid #555;padding:3px 10px;background:#2f6f6f">이름</th><th style="border:1px solid #555;padding:3px 10px;background:#2f6f6f">태그</th></tr>
<tr><td style="border:1px solid #555;padding:3px 10px">웃음</td><td style="border:1px solid #555;padding:3px 10px">smile, open mouth</td></tr>
<tr><td style="border:1px solid #555;padding:3px 10px">화남</td><td style="border:1px solid #555;padding:3px 10px">angry, frown</td></tr>
<tr><td style="border:1px solid #555;padding:3px 10px">#메모</td><td style="border:1px solid #555;padding:3px 10px">이 줄은 무시</td></tr>
</table>
<h4>구글 스프레드시트</h4>
<p>시트에서 <b>파일 → 다운로드 → Microsoft Excel(.xlsx)</b> (또는 CSV)로 받아 폴더에 넣으면 됩니다.
구글 드라이브의 <code>.gsheet</code> 파일은 바로가기라서 읽을 수 없습니다.</p>
<h4>CSV</h4>
<p>엑셀과 같은 열 구성. 엑셀에서 "CSV"로 저장한 한글 파일(CP949)도, UTF-8도 읽습니다. 파일 하나가 분류 하나(파일 이름이 분류)입니다.</p>
<h4>메모장 (.txt)</h4>
<pre style="background:#151518;border:1px solid #444;border-radius:4px;padding:8px 10px;font-size:12px;line-height:1.5"># 메모 줄은 # 으로 시작
[표정]
웃음 = smile, open mouth
화남 = angry, frown
blush, embarrassed

[의상]
교복 = school uniform</pre>
<ul>
<li>한 줄에 하나: <b>이름 = 태그</b> (이름 없이 태그만 써도 됩니다)</li>
<li><b>[분류]</b> 줄 아래가 그 분류로 묶입니다. 없으면 파일 이름이 분류입니다.</li>
</ul>`,
        };
        const paint = () => {
          body.innerHTML = T[cur];
          body.querySelectorAll("h4").forEach((e) => css(e, { margin: "12px 0 4px", color: C.accent2, fontSize: "13px" }));
          body.querySelectorAll("code").forEach((e) => css(e, { background: "#151518", padding: "0 4px", borderRadius: "3px", fontSize: "12px" }));
          body.querySelectorAll("ul,ol").forEach((e) => css(e, { margin: "2px 0", paddingLeft: "20px" }));
          body.querySelectorAll("p").forEach((e) => css(e, { margin: "4px 0" }));
          tabEls.forEach((e) => css(e, e._k === cur ? ON : { background: C.bg, borderColor: C.line, color: C.text }));
          body.scrollTop = 0;
        };
        box.append(top, body, foot); ov.append(box);
        ov.addEventListener("mousedown", (e) => { if (e.target === ov) ov.remove(); });
        const esc = (e) => { if (e.key === "Escape") { ov.remove(); window.removeEventListener("keydown", esc, true); e.stopPropagation(); } };
        window.addEventListener("keydown", esc, true);
        ["keydown", "keyup", "wheel", "pointerdown"].forEach((t) => box.addEventListener(t, (e) => e.stopPropagation()));
        paint(); document.body.append(ov);
      }

      // ================= 프롬프트 묶음 =================
      // 품질·작가 태그(높이 조절·스크롤) / 긍정(남는 높이를 모두 차지) / 배경·기타 / 부정 — 칸 사이 가로줄을 끌어 높이 조절
      // 2단: 오른쪽 위(아래 가로줄로 미리보기와 나눔) · 3단: 가운데 열 전체
      const promptBox = h("div", { display: "flex", flexDirection: "column", gap: "3px", minHeight: "0", overflow: "hidden" });
      promptBox.addEventListener("wheel", (e) => { if (promptBox.scrollHeight > promptBox.clientHeight + 1) e.stopPropagation(); }, { passive: true });
      const hsplit = h("div", { height: "9px", flexShrink: "0", cursor: "row-resize", display: "flex", alignItems: "center" });
      hsplit.append(h("div", { height: "2px", width: "100%", background: C.sep, borderRadius: "1px" }));
      hsplit.title = "끌어서 프롬프트 · 미리보기 크기 조절 · 두 번 눌러 기본값";
      const outBox = h("div", { display: "flex", flexDirection: "column", gap: "6px", flex: "1", minHeight: "0" });
      if (node.properties.ptop == null) node.properties.ptop = 0.3;
      const applyP = () => { promptBox.style.flex = is3() ? "1 1 0" : `0 0 ${pct(node.properties.ptop)}`; };
      hsplit.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const rect = right.getBoundingClientRect();
        const move = (ev) => { node.properties.ptop = Math.min(0.8, Math.max(0.2, (ev.clientY - rect.top) / rect.height)); applyP(); };
        const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
        window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
      });
      hsplit.addEventListener("dblclick", () => { node.properties.ptop = 0.3; applyP(); });

      // 칸 사이 가로줄: 위아래로 끌면 고정 높이 칸의 높이가 바뀜 (sign: 아래로 끌 때 커지면 +1, 작아지면 -1)
      // 칸 높이는 2단 · 3단을 따로 기억 (2단은 좁게, 3단은 넉넉하게)
      const DEF_H = { q_h2: 24, ex_h2: 24, neg_h2: 64, q_h3: 130, ex_h3: 110, neg_h3: 140 };
      Object.entries(DEF_H).forEach(([k, v]) => { if (node.properties[k] == null) node.properties[k] = v; });
      const hk = (k) => k + (is3() ? "3" : "2");
      const bar = (key, sign, onApply) => {
        const b = h("div", { height: "7px", flexShrink: "0", cursor: "row-resize", display: "flex", alignItems: "center", justifyContent: "center" });
        b.append(h("div", { height: "2px", width: "40px", background: C.line, borderRadius: "1px" }));
        b.title = "끌어서 칸 높이 조절 · 두 번 눌러 기본값";
        b.addEventListener("mousedown", (e) => {
          e.preventDefault(); e.stopPropagation();
          const K = hk(key), y0 = e.clientY, h0 = node.properties[K];
          const move = (ev) => { node.properties[K] = Math.min(600, Math.max(22, h0 + sign * (ev.clientY - y0))); onApply(); };
          const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
          window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
        });
        b.addEventListener("dblclick", () => { node.properties[hk(key)] = DEF_H[hk(key)]; onApply(); });
        return b;
      };
      const head = (title, hint, ...rightKids) => {
        const r0 = h("div", { display: "flex", alignItems: "center", gap: "6px", flexShrink: "0", minWidth: "0" });
        const t = h("span", { fontWeight: "700", fontSize: "12px", whiteSpace: "nowrap" }, title);
        r0.append(t);
        if (hint) r0.append(h("span", { color: C.dim, fontSize: "10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: "0" }, hint));
        r0.append(h("span", { flex: "1" }), ...rightKids);
        r0._t = t;
        return r0;
      };
      const fixedTA = (name, key, ph) => {
        const t = textArea(name, 2, ph);
        css(t, { resize: "none", overflowY: "auto", flex: "0 0 auto" });
        const ap = () => { t.style.height = node.properties[hk(key)] + "px"; };
        ap(); t._ap = ap;
        return t;
      };

      // 맨 위 도구줄: [품질 태그 숨기기] [한→영] [↶] [3단 보기]
      const qShow = btn("", () => { node.properties.q_show = !node.properties.q_show; paintQ(); }, { padding: "1px 6px", fontSize: "10px" });
      const trBtn = btn("한→영", () => doTranslate(), { padding: "1px 6px", fontSize: "10px", borderColor: C.accent2, color: C.accent2 },
        "프롬프트 칸의 한글을 영어로 바꿉니다\n· 단어(웃음, 금발…)는 Danbooru 태그 사전으로 정확하게\n· 문장은 구글 번역으로 영어 문장 (Anima는 문장도 잘 알아들음 · 체크포인트는 태그 위주가 좋음)\n· 영어 태그는 그대로");
      const koBtn = btn("한글로 잠깐 보기", () => koPreview(!koOn), { padding: "1px 6px", fontSize: "10px" },
        "프롬프트를 한글로 옮겨 잠깐 보여줍니다 (다시 누르면 영어로)\n· 보여주기만 하고 프롬프트는 그대로 — 생성에는 영어 원문이 쓰입니다\n· 영→한→영처럼 다시 번역하지 않으니 원문이 바뀌지 않습니다");
      const undoBtn = btn("↶ 되돌리기", () => undoTranslate(), { padding: "1px 8px", fontSize: "10px", display: "none" }, "번역하기 전으로");
      const layBtn = btn("", () => setLayout(is3() ? 2 : 3), { padding: "1px 6px", fontSize: "10px" });
      // 이전 / 다음 프롬프트 (생성할 때마다 네 칸을 기억 — 이 화면을 켜 둔 동안만)
      const ICON = { ...CHIP, width: "22px", height: "18px", padding: "0", fontSize: "14px", fontWeight: "700", borderRadius: "5px" };
      const backB = btn("‹", () => histGo(-1), ICON, "이전 프롬프트");
      const fwdB = btn("›", () => histGo(+1), ICON, "다음 프롬프트");
      const tools = h("div", { display: "flex", alignItems: "center", gap: "4px", rowGap: "3px", flexShrink: "0", flexWrap: "wrap" });
      tools.append(h("span", { fontWeight: "700", fontSize: "13px" }, "프롬프트"), backB, fwdB, h("span", { flex: "1" }), qShow, trBtn, koBtn, undoBtn, layBtn);

      // 품질 · 작가 태그
      if (node.properties.q_show == null) node.properties.q_show = true;
      const qCb = document.createElement("input"); qCb.type = "checkbox"; css(qCb, { margin: "0", cursor: "pointer" });
      qCb.onchange = () => setVal("quality_on", qCb.checked);
      const qLab = h("label", { display: "flex", alignItems: "center", gap: "3px", cursor: "pointer", whiteSpace: "nowrap" });
      qLab.append(qCb, h("span", { fontWeight: "700", fontSize: "12px" }, "품질 · 작가 태그"));
      qLab.title = "체크하면 이 칸의 태그를 프롬프트 맨 앞에 붙입니다 (작가 태그도 여기에 넣으면 편합니다)";
      const qHead = h("div", { display: "flex", alignItems: "center", gap: "6px", flexShrink: "0" });
      qHead.append(qLab, h("span", { color: C.dim, fontSize: "10px" }, "맨 앞에 붙음"));
      const qTA = fixedTA("quality", "q_h", "(masterpiece:1.2), best quality, 작가 태그 …");
      syncers.push(() => { qTA.style.opacity = val("quality_on") ? "1" : ".45"; qCb.checked = !!val("quality_on"); });
      const qBar = bar("q_h", +1, () => qTA._ap());
      const qWrap = h("div", { display: "flex", flexDirection: "column", gap: "3px", flexShrink: "0" });
      qWrap.append(qHead, qTA, qBar);
      const paintQ = () => {
        const on = !!node.properties.q_show;
        qWrap.style.display = on ? "flex" : "none";
        qShow.textContent = on ? "품질 태그 숨기기" : "품질 태그 보기";
      };

      // 긍정(본) 프롬프트 — 남는 높이를 모두 차지
      const posHead = head("긍정 프롬프트", "한글로 쓰고 [한→영]을 누르면 영어로 바뀝니다");
      const pos = textArea("positive", 3, "그리고 싶은 것을 영어 태그로. 한글로 쓰고 [한→영]을 눌러도 됩니다. 예) 1girl, solo, smile, long hair");
      css(pos, { flex: "1 1 0", minHeight: "44px", resize: "none" });

      // 배경 · 기타
      const exBar = bar("ex_h", -1, () => exTA._ap());
      const exHead = head("배경 · 기타", "장소 · 조명 · 구도 등 (긍정 뒤에 붙음)");
      const exTA = fixedTA("extra", "ex_h", "classroom, window, sunlight …");

      // 부정
      const negBar = bar("neg_h", -1, () => negTA._ap());
      const negHead = head("부정 프롬프트", "나오지 않았으면 하는 것");
      const negTA = fixedTA("negative", "neg_h");

      // ---------------- 구도 버튼 (부정 프롬프트 밑, 접기) ----------------
      // 켠 버튼의 태그는 본 프롬프트 뒤 · 배경 앞에 붙음 (프롬프트 칸 글자는 바뀌지 않음)
      if (node.properties.btn_open == null) node.properties.btn_open = true;
      const getOn = () => { try { const v = JSON.parse(val("toggles") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
      const allTags = () => [...GROUPS.flatMap((g) => g.items.map((x) => x.tags)), ...FAVS.items.map((x) => x.tags)];
      const setOn = (arr) => { const order = allTags(), u = [...new Set(arr)]; setVal("toggles", JSON.stringify([...order.filter((t) => u.includes(t)), ...u.filter((t) => !order.includes(t))])); renderBtns(); };
      const favGroup = () => ({ name: "자주 쓰는", type: "multi", items: FAVS.items, fav: true });
      function toggleTag(g, it) {
        let on = getOn(); const has0 = on.includes(it.tags);
        if (g.type === "single") on = on.filter((t) => !g.items.some((x) => x.tags === t));
        setOn(has0 ? on.filter((t) => t !== it.tags) : [...on, it.tags]);
      }
      const parseEntry = (raw) => { const v = String(raw || "").trim(); if (!v) return null; const i = v.indexOf("="); const label = (i > 0 ? v.slice(0, i) : v).trim(), tags = (i > 0 ? v.slice(i + 1) : v).trim(); return tags ? { label: label || tags, tags } : null; };
      const btnWrap = h("div", { display: "flex", flexDirection: "column", gap: "3px", flexShrink: "0", borderTop: `1px solid ${C.sep}`, paddingTop: "4px", marginTop: "2px" });
      const btnHead = h("div", { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", userSelect: "none", minWidth: "0", height: "20px", minHeight: "20px", overflow: "hidden", flexShrink: "0" });
      btnHead.title = "눌러서 접기 / 펼치기";
      const btnPanel = h("div", { display: "flex", flexDirection: "column", gap: "3px", overflowY: "auto", minHeight: "0" });
      btnPanel.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
      btnWrap.append(btnHead, btnPanel);
      btnHead.onclick = () => { node.properties.btn_open = !node.properties.btn_open; renderBtns(); };
      const BCHIP = { fontSize: "10.5px", padding: "0 7px", lineHeight: "17px" };
      const brow = (title, kids) => {
        const r0 = h("div", { display: "flex", alignItems: "flex-start", gap: "4px" });
        r0.append(h("div", { width: "46px", flexShrink: "0", color: C.dim, fontSize: "10px", paddingTop: "2px" }, title));
        const w0 = h("div", { display: "flex", flexWrap: "wrap", gap: "3px", flex: "1", alignItems: "center", minWidth: "0" });
        w0.append(...kids); r0.append(w0); return r0;
      };
      function renderBtns() {
        const on = getOn(), open = !!node.properties.btn_open;
        btnHead.innerHTML = "";
        const sum = h("span", { flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "10px", color: on.length ? "#7fb0e6" : C.dim },
          on.length ? on.join(", ") : "켜진 버튼 없음");
        btnHead.append(h("span", { color: C.dim, fontSize: "11px", width: "10px" }, open ? "▾" : "▸"), h("span", { fontWeight: "700", fontSize: "12px", whiteSpace: "nowrap" }, "구도 버튼"), sum);
        if (on.length) btnHead.append(btn("모두 끄기", () => setOn([]), { ...BCHIP, color: C.dim }, "켜진 버튼을 모두 끕니다"));
        btnPanel.style.display = open ? "flex" : "none";
        btnPanel.style.maxHeight = is3() ? "none" : "120px";
        btnPanel.innerHTML = "";
        if (!open) return;
        for (const g of [...GROUPS, favGroup()]) {
          const kids = g.items.map((it) => {
            const isOn = on.includes(it.tags);
            const c = btn((g.type === "check" ? (isOn ? "☑ " : "☐ ") : "") + it.label, () => toggleTag(g, it), { ...BCHIP, ...(isOn ? ON : {}) }, it.tags);
            if (g.fav && st.favEdit) {
              const x = h("span", { marginLeft: "4px", color: "#e88" }, "×");
              x.onclick = (e) => { e.stopPropagation(); setOn(getOn().filter((t) => t !== it.tags)); saveFavs(FAVS.items.filter((y) => y.tags !== it.tags)); };
              c.append(x);
            }
            return c;
          });
          if (g.fav) {
            if (st.favAdd) {
              const inp = h("input", { ...INPUT, width: "140px", fontSize: "11px", padding: "1px 5px" }); noKeys(inp); inp.placeholder = "이름=태그  또는  태그";
              const add = () => { const e = parseEntry(inp.value); st.favAdd = false; if (e && !FAVS.items.some((x) => x.tags === e.tags)) saveFavs([...FAVS.items, e]); else renderBtns(); };
              inp.addEventListener("keydown", (e) => { if (e.isComposing) return; if (e.key === "Enter") add(); if (e.key === "Escape") { st.favAdd = false; renderBtns(); } });
              kids.push(inp, btn("추가", add, { ...BCHIP, ...ON }), btn("취소", () => { st.favAdd = false; renderBtns(); }, BCHIP));
              setTimeout(() => inp.focus(), 0);
            } else {
              kids.push(btn("+ 추가", () => { st.favAdd = true; st.favEdit = false; renderBtns(); }, { ...BCHIP, borderStyle: "dashed", color: C.accent2 }, "자주 쓰는 태그를 버튼으로 만듭니다\n예) 웃음=smile  또는  smile, blush"));
              if (FAVS.items.length) kids.push(btn(st.favEdit ? "완료" : "✎", () => { st.favEdit = !st.favEdit; renderBtns(); }, { ...BCHIP, color: C.dim }, st.favEdit ? "지우기 끝내기" : "버튼 지우기 (× 표시)"));
            }
          }
          btnPanel.append(brow(g.name, kids));
        }
      }
      syncers.push(renderBtns);

      promptBox.append(tools, qWrap, posHead, pos, exBar, exHead, exTA, negBar, negHead, negTA, btnWrap);

      // 2단 ↔ 3단
      function setLayout(n) {
        node.properties.layout = n;
        node.setSize(n === 3 ? SIZE3 : SIZE2);
        applyLayout();
        setTimeout(() => fitNode(node), 30); // 바뀐 크기에 맞춰 화면도 맞춤
      }
      function applyLayout() {
        const three = is3();
        if (three) {
          mid.append(promptBox); right.append(outBox);
          mid.style.display = "flex"; split2.style.display = "flex"; hsplit.style.display = "none";
          right.style.paddingLeft = "6px";
        } else {
          right.append(promptBox, hsplit, outBox);
          mid.style.display = "none"; split2.style.display = "none"; hsplit.style.display = "flex";
        }
        posHead._t.textContent = three ? "본 프롬프트" : "긍정 프롬프트";
        layBtn.textContent = three ? "◧ 2단" : "▥ 3단";
        layBtn.title = three ? "설정 | 프롬프트+미리보기 2단으로" : "설정 | 프롬프트 | 미리보기 3단으로 (1:1:1)";
        koPreview(false);
        promptBox.style.overflowY = three ? "hidden" : "auto"; // 2단은 높이가 정해져 있어 넘치면 스크롤 (구도 버튼까지 닿게)
        applySplit(); applyP(); paintQ();
        [qTA, exTA, negTA].forEach((t) => t._ap());
        renderBtns();
      }

      // 프롬프트 뒤로 · 앞으로
      const HIST_F = ["quality", "positive", "extra", "negative", "toggles"];
      const hist = { list: [], i: -1 };
      const snap = () => Object.fromEntries(HIST_F.map((n) => [n, String(val(n) ?? "")]));
      const same = (a, b) => !!a && !!b && HIST_F.every((n) => a[n] === b[n]);
      function histPush() {
        const cur = snap();
        if (same(hist.list[hist.list.length - 1], cur)) { hist.i = hist.list.length - 1; return paintHist(); }
        hist.list.push(cur);
        if (hist.list.length > 50) hist.list.shift();
        hist.i = hist.list.length - 1;
        paintHist();
      }
      function histGo(d) {
        const cur = snap();
        // 맨 끝에서 고치던 내용이 있으면 먼저 기억 (앞으로 끝까지 오면 돌아옴)
        if (d < 0 && hist.i === hist.list.length - 1 && !same(hist.list[hist.i], cur)) { hist.list.push(cur); hist.i = hist.list.length - 1; }
        const j = hist.i + d;
        if (j < 0 || j >= hist.list.length) return;
        hist.i = j;
        const t = hist.list[j];
        koPreview(false);
        HIST_F.forEach((n) => { if (t[n] !== undefined) setVal(n, t[n]); });
        sync(); paintHist();
        status.style.color = C.dim; status.textContent = `프롬프트 ${j + 1} / ${hist.list.length}`;
      }
      function paintHist() {
        const canB = hist.i > 0 || (hist.i === hist.list.length - 1 && hist.list.length > 0 && !same(hist.list[hist.i], snap()));
        const canF = hist.i < hist.list.length - 1;
        [[backB, canB], [fwdB, canF]].forEach(([b, ok]) => { b.style.opacity = ok ? "1" : ".35"; b.style.cursor = ok ? "pointer" : "default"; });
      }
      syncers.push(paintHist);

      // 한 → 영
      let undoState = null;
      const TR_FIELDS = ["quality", "positive", "extra", "negative"];
      async function doTranslate() {
        koPreview(false);
        const texts = TR_FIELDS.map((n) => String(val(n) ?? ""));
        if (!texts.some((t) => HANGUL.test(t))) { status.style.color = C.dim; status.textContent = "바꿀 한글이 없습니다"; return; }
        trBtn.textContent = "번역 중…";
        try {
          const r = await (await api.fetchApi("/cofoty5_onenode/ko2en", { method: "POST", body: JSON.stringify({ texts }) })).json();
          if (r.error) throw new Error(r.error);
          undoState = Object.fromEntries(TR_FIELDS.map((n, i) => [n, texts[i]]));
          TR_FIELDS.forEach((n, i) => { if (r.result[i] !== texts[i]) setVal(n, r.result[i]); });
          undoBtn.style.display = "inline-flex";
          let msg = `번역: 사전 ${r.dict} · 구글 ${r.google}`;
          if (r.failed?.length) msg += ` · ⚠ 못 바꿈 ${r.failed.length}개 (${r.failed.slice(0, 2).join(", ")}${r.failed.length > 2 ? "…" : ""})` + (r.tr_error ? ` — 구글: ${r.tr_error}` : "");
          status.style.color = r.failed?.length ? C.warn : C.text; status.textContent = msg; status.title = msg;
          sync();
          checkDict();
        } catch (e) {
          status.style.color = C.warn; status.textContent = "⚠ 번역 실패: " + (e.message || e);
        } finally { trBtn.textContent = "한→영"; }
      }
      function undoTranslate() {
        if (!undoState) return;
        Object.entries(undoState).forEach(([n, v]) => setVal(n, v));
        undoState = null; undoBtn.style.display = "none";
        status.style.color = C.dim; status.textContent = "번역 전으로 되돌렸습니다";
        sync();
      }
      // 한글로 잠깐 보기: 칸 위에 한글 번역을 덮어 보여주기만 함 (값은 그대로). 다시 누르거나 번역을 누르면 영어로
      let koOn = false, koBusy = false;
      const KO_TA = [["quality", qTA], ["positive", pos], ["extra", exTA], ["negative", negTA]];
      const koDivs = [];
      async function koPreview(on) {
        if (!on) {
          koOn = false; koDivs.splice(0).forEach((d) => d.remove());
          KO_TA.forEach(([, t]) => (t.style.display = ""));
          koBtn.textContent = "한글로 잠깐 보기"; css(koBtn, { background: C.bg, color: C.text, borderColor: C.line });
          return;
        }
        if (koBusy) return;
        const texts = KO_TA.map(([n]) => String(val(n) ?? ""));
        if (!texts.some((t) => /[A-Za-z]/.test(t))) { status.style.color = C.dim; status.textContent = "한글로 옮길 영어가 없습니다"; return; }
        koBusy = true; koBtn.textContent = "옮기는 중…";
        try {
          const r = await (await api.fetchApi("/cofoty5_onenode/en2ko", { method: "POST", body: JSON.stringify({ texts }) })).json();
          if (r.error) throw new Error(r.error);
          koPreview(false);
          KO_TA.forEach(([, t], i) => {
            const d = h("div", { ...INPUT, width: "100%", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.4",
              background: "#17232b", color: C.ko, borderColor: "#3f6070", cursor: "pointer", flex: t.style.flex, height: t.style.height, minHeight: t.style.minHeight || "22px" });
            d.textContent = r.result[i] || ""; d.title = "한글로 잠깐 보는 중 (생성에는 영어 원문이 쓰임) — 누르면 영어 원문으로";
            d.onclick = () => koPreview(false);
            d.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
            t.style.display = "none"; t.after(d); koDivs.push(d);
          });
          koOn = true; koBtn.textContent = "영어 원문 보기"; css(koBtn, { background: "#3f6070", color: "#fff", borderColor: "#6a9ab0" });
          let msg = `한글로 잠깐 보는 중 — 생성에는 영어 원문이 쓰입니다 (사전 ${r.dict} · 구글 ${r.google})`;
          if (r.left) msg += ` · ⚠ 못 옮긴 ${r.left}개는 영어 그대로` + (r.tr_error ? ` — 구글: ${r.tr_error}` : "");
          if (!r.has_dict) msg += " · 태그 사전이 없어 [한→영]을 한 번 누르면 받을 수 있습니다";
          status.style.color = C.ko; status.textContent = msg; status.title = msg;
        } catch (e) {
          status.style.color = C.warn; status.textContent = "⚠ 한글로 옮기지 못했습니다: " + (e.message || e);
        } finally { koBusy = false; if (!koOn) koBtn.textContent = "한글로 잠깐 보기"; }
      }

      // 사전이 없으면 한 번 물어보고 받기 (약 수십 MB, 처음 한 번)
      let dictAsked = false;
      async function checkDict() {
        try {
          const d = await (await api.fetchApi("/cofoty5_onenode/dict_status")).json();
          if (d.has_dict || d.downloading || dictAsked) return;
          dictAsked = true;
          if (confirm("한국어 태그 사전이 아직 없습니다.\n받아 두면 '웃음 → smile'처럼 단어를 정확한 태그로 바꿉니다. (처음 한 번, 인터넷 필요)\n지금 받을까요?")) {
            await api.fetchApi("/cofoty5_onenode/dict_download", { method: "POST" });
            toast("태그 사전을 받는 중입니다. 다 받으면 다음 번역부터 사전이 쓰입니다.", "info", 6000);
          }
        } catch {}
      }

      // ================= 미리보기 =================
      // 미리보기 여러 장 + 저장한 결과(금색 테두리)를 한 줄에. 저장본을 볼 때 [◐ 원본]을 누르고 있으면 저장 전 그림이 보임
      const big = h("div", { flex: "1", minHeight: "200px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: "6px",
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" });
      const bigImg = h("img", { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "none", cursor: "zoom-in" });
      const empty = h("div", { color: C.dim, fontSize: "12px", textAlign: "center", lineHeight: "1.6" });
      empty.innerHTML = "[생성]을 누르면 여기에 미리보기가 나옵니다<br>아래 작은 그림을 눌러 한 장을 고르세요";
      const badge = h("div", { position: "absolute", left: "6px", top: "6px", background: "rgba(0,0,0,.65)", borderRadius: "4px", padding: "2px 7px", fontSize: "11px", display: "none" });
      const cmpBtn = h("div", { position: "absolute", right: "6px", bottom: "6px", background: "rgba(0,0,0,.65)", border: `1px solid ${C.gold}`, color: C.gold,
        borderRadius: "4px", padding: "3px 8px", fontSize: "11px", fontWeight: "700", cursor: "pointer", userSelect: "none", display: "none" }, "◐ 누르고 있으면 원본");
      cmpBtn.title = "누르고 있는 동안 저장 전(미리보기) 그림을 보여줍니다";
      bigImg.onclick = () => { if (bigImg.src) window.open(bigImg.src, "_blank"); };
      big.append(bigImg, empty, badge, cmpBtn);
      const strip = h("div", { display: "none", gap: "5px", overflowX: "auto", flexShrink: "0", alignItems: "center" });
      outBox.append(big, strip);
      const viewURL = (f) => api.apiURL(`/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder || "")}&type=${f.type}&t=${Date.now()}`);
      st.saved = []; st.view = { kind: "prev", i: 0 };
      const thumb = (url, on, gold, title, onClick, tag) => {
        const w = h("div", { position: "relative", flexShrink: "0", cursor: "pointer" });
        const t = h("img", { width: "60px", height: "60px", objectFit: "cover", borderRadius: "4px", display: "block",
          border: `2px solid ${on ? (gold ? C.gold : C.accent2) : gold ? "rgba(232,196,106,.35)" : "transparent"}`, opacity: on ? "1" : ".7" });
        t.src = url; w.title = title; w.onclick = onClick;
        w.append(t);
        if (tag) w.append(h("span", { position: "absolute", left: "3px", bottom: "3px", fontSize: "9px", padding: "0 3px", borderRadius: "3px",
          background: "rgba(0,0,0,.75)", color: C.gold }, tag));
        return w;
      };
      function drawStrip() {
        strip.innerHTML = "";
        st.prev.forEach((f, i) => strip.append(thumb(f.url, st.view.kind === "prev" && i === st.pick, false, `${i + 1}번 미리보기`,
          () => { st.pick = i; st.view = { kind: "prev", i }; show(); })));
        if (st.saved.length) {
          strip.append(h("div", { width: "1px", alignSelf: "stretch", background: C.line, margin: "0 3px", flexShrink: "0" }));
          st.saved.forEach((f, i) => strip.append(thumb(f.url, st.view.kind === "saved" && i === st.view.i, true,
            `저장본: ${f.filename}\n${f.desc}`, () => { st.view = { kind: "saved", i }; st.pick = f.src; show(); }, f.kind === "upscale" ? "⬆" : "💾")));
        }
        strip.style.display = st.prev.length + st.saved.length > 1 ? "flex" : "none";
      }
      function show() {
        const sv = st.view.kind === "saved" ? st.saved[st.view.i] : null;
        const f = sv || st.prev[st.pick];
        if (!f) { bigImg.style.display = "none"; empty.style.display = ""; badge.style.display = "none"; cmpBtn.style.display = "none"; return; }
        bigImg.src = f.url; bigImg.style.display = ""; empty.style.display = "none";
        badge.style.display = "";
        badge.style.color = sv ? C.gold : C.text;
        badge.textContent = sv ? `저장본 · ${sv.desc}` : `${st.pick + 1} / ${st.prev.length}  선택됨`;
        cmpBtn.style.display = sv && sv.before ? "" : "none";
        drawStrip();
        upBtn.disabled = !st.prev.length;
        upBtn.textContent = sv ? "⬆ 저장본 다시 업스케일" : "⬆ 업스케일 저장";
        upBtn.title = sv ? "이 저장본을 한 번 더 키워서 다듬어 저장합니다 (보정이 켜져 있으면 보정까지)" : "고른 한 장을 키우고 다시 다듬어 저장합니다 (보정이 켜져 있으면 보정까지)";
        const fixOn = !!val("face_fix") || !!val("hand_fix");
        saveBtn.textContent = sv ? "💾 보정해서 저장" : "💾 그대로 저장";
        saveBtn.title = sv ? "이 저장본에 손 · 얼굴 보정만 해서 새로 저장합니다 (보정을 켜야 누를 수 있음)" : "고른 한 장을 그대로 저장합니다 (보정이 켜져 있으면 보정만)";
        saveBtn.disabled = !st.prev.length || (sv && !fixOn);
      }
      const showPick = show;
      // 누르고 있는 동안 원본
      const holdOn = (e) => {
        e.preventDefault(); e.stopPropagation();
        const sv = st.saved[st.view.i], o = sv && sv.before;
        if (!o) return;
        bigImg.src = o.url; badge.style.color = C.text; badge.textContent = `원본 · ${o.label}`;
        cmpBtn.style.background = "rgba(232,196,106,.25)";
      };
      const holdOff = () => { if (st.view.kind !== "saved") return; cmpBtn.style.background = "rgba(0,0,0,.65)"; show(); };
      cmpBtn.addEventListener("mousedown", holdOn);
      cmpBtn.addEventListener("mouseup", holdOff);
      cmpBtn.addEventListener("mouseleave", holdOff);

      // ================= 오른쪽: 버튼 · 상태 =================
      const btnStyle = { ...INPUT, flex: "1", padding: "8px 4px", fontSize: "13px", fontWeight: "700", cursor: "pointer", border: "0" };
      const genBtn = h("button", { ...btnStyle, background: C.accent, color: "#fff", flex: "1.2" }, "▶ 생성");
      const upBtn = h("button", { ...btnStyle, background: "#3d3560", color: "#fff" }, "⬆ 업스케일 저장");
      const saveBtn = h("button", { ...btnStyle, background: "#33333b", color: "#ddd" }, "💾 그대로 저장");
      genBtn.title = "미리보기를 만듭니다 (배치 장수만큼)";
      upBtn.title = "고른 한 장을 키우고 다시 다듬어 저장합니다 (보정이 켜져 있으면 보정까지)";
      saveBtn.title = "고른 한 장을 그대로 저장합니다 (보정이 켜져 있으면 보정만)";
      upBtn.disabled = saveBtn.disabled = true;
      [upBtn, saveBtn].forEach((b) => { const p = () => (b.style.opacity = b.disabled ? ".45" : "1"); new MutationObserver(p).observe(b, { attributes: true }); p(); });
      const status = h("div", { color: C.dim, fontSize: "11px", minHeight: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: "0" });
      const mainRow = row(genBtn, saveBtn, upBtn);
      // ④ 목록으로 연속 생성 중: 위 버튼 대신 이 줄
      const autoBar = h("div", { display: "none", flexDirection: "column", gap: "4px", border: `1px solid ${C.accent2}`, borderRadius: "6px", padding: "5px", flexShrink: "0" });
      const autoInfo = h("div", { fontSize: "12px", fontWeight: "700", color: C.accent2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
      const aBtn = (bg, fg, flex = "1") => h("button", { ...btnStyle, background: bg, color: fg, flex, fontSize: "11px", padding: "7px 2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: "0" });
      const aNext = aBtn(C.accent, "#fff", "1.1"), aSave = aBtn("#33333b", "#ddd"), aUp = aBtn("#3d3560", "#fff");
      const aSaveAll = aBtn("#2a2a31", "#ddd"), aUpAll = aBtn("#322c4f", "#fff");
      aNext.title = "이 항목은 (더) 저장하지 않고 다음 항목을 만듭니다";
      aSave.title = "고른 한 장을 그대로 저장합니다 (보정이 켜져 있으면 보정만)";
      aUp.title = "고른 한 장을 업스케일해서 저장합니다";
      aSaveAll.title = "미리보기 전부를 그대로 저장합니다";
      aUpAll.title = "미리보기 전부를 업스케일해서 저장합니다";
      const autoSaveGo = (act) => { const a = st.auto; if (!a || a.wait !== "pick") return; a.wait = "save"; paintAuto(); go(act).catch(() => { a.wait = "pick"; paintAuto(); }); };
      aSave.onclick = () => autoSaveGo("save");
      aUp.onclick = () => autoSaveGo("upscale");
      aSaveAll.onclick = () => autoSaveGo("save_all");
      aUpAll.onclick = () => autoSaveGo("upscale_all");
      aNext.onclick = () => { if (st.auto?.wait === "pick" || st.auto?.wait === "err") autoNext(); };
      // 보면서 진행: 저장하면 자동 다음 생성 (④의 체크와 같은 값)
      const nextCb2 = h("input"); nextCb2.type = "checkbox"; css(nextCb2, { margin: "0", cursor: "pointer" });
      nextCb2.onchange = () => { P.auto_next = nextCb2.checked; paintAuto(); };
      const nextLb2 = h("label", { display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: C.dim, cursor: "pointer", whiteSpace: "nowrap", marginLeft: "auto", flexShrink: "0" });
      nextLb2.append(nextCb2, h("span", {}, "저장하면 자동 다음 생성"));
      autoBar.append(row(autoInfo, nextLb2), row(aNext, aSave, aUp, aSaveAll, aUpAll));
      css(autoInfo, { flex: "1", minWidth: "0" });
      IT.bar = true;
      outBox.append(mainRow, autoBar, status);

      // ================= 오른쪽: 저장 폴더 규칙 =================
      const saveBox = h("div", { display: "flex", flexDirection: "column", gap: "5px", borderTop: `1px solid ${C.sep}`, paddingTop: "6px", flexShrink: "0" });
      const fIn = h("input", { ...INPUT, flex: "1", fontSize: "11px" }); noKeys(fIn);
      fIn.placeholder = "onenode";
      fIn.onchange = () => { setVal("save_folder", fIn.value.trim()); sync(); };
      syncers.push(() => { if (document.activeElement !== fIn) fIn.value = val("save_folder") ?? ""; });
      const nameSel = h("select", { ...INPUT, flex: "0 0 auto", fontSize: "11px" });
      NAME_RULES.forEach((t) => { const o = document.createElement("option"); o.value = t; o.textContent = t; nameSel.append(o); });
      nameSel.onchange = () => { setVal("save_name", nameSel.value); sync(); };
      syncers.push(() => { const v = val("save_name"); nameSel.value = NAME_RULES.includes(v) ? v : NAME_RULES[0]; });
      nameSel.title = "파일 이름 규칙\n날짜_번호: 20261106_0001.png\n날짜_시드: 20261106_123456.png\n번호만: 0001.png";
      const dTg = toggle("date_folder", "날짜별 폴더", "켜면 저장 폴더 안에 오늘 날짜 폴더(20261106)를 만들어 그 안에 저장", () => sync());
      css(dTg, { padding: "2px 8px", fontSize: "11px" });
      const openB = h("button", { ...INPUT, cursor: "pointer", padding: "3px 10px", fontWeight: "600", background: "#33333b", whiteSpace: "nowrap" }, "📂 폴더 열기");
      openB.onclick = async () => {
        try {
          const r = await (await api.fetchApi("/cofoty5_onenode/open_folder", { method: "POST", body: JSON.stringify({ folder: val("save_folder"), date_folder: !!val("date_folder") }) })).json();
          if (r.error) toast("폴더를 열지 못했습니다: " + r.error, "warn");
        } catch { toast("폴더를 열지 못했습니다", "warn"); }
      };
      const where = h("div", { color: C.dim, fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
      syncers.push(() => {
        const d = new Date(), ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
        const folder = [String(val("save_folder") || "").replace(/^[\\/]+|[\\/]+$/g, ""), val("date_folder") ? ymd : ""].filter(Boolean).join("/");
        const rule = val("save_name"), file = rule === "날짜_시드" ? `${ymd}_시드.png` : rule === "번호만" ? "0001.png" : `${ymd}_0001.png`;
        where.textContent = `저장 위치 예: output/${folder ? folder + "/" : ""}${file}`;
      });
      saveBox.append(row(h("span", { fontWeight: "700", fontSize: "12px" }, "저장"), label("output /"), fIn, nameSel), row(dTg, where, h("span", { flex: "1" }), openB));
      outBox.append(saveBox);

      // ================= 실행 =================
      async function go(action) {
        if (action !== "generate" && !st.prev.length) { toast("먼저 [생성]으로 미리보기를 만드세요", "warn"); return; }
        if (action === "generate") histPush();
        // 원본: 저장본을 보고 있으면 그 저장본, 아니면 고른 미리보기
        const all = action.endsWith("_all");
        const sv = action !== "generate" && !all && st.view.kind === "saved" ? st.saved[st.view.i] : null;
        if (sv && action === "upscale") {
          const k = +val("up_scale") || 1.25, mp = (sv.w * k) * (sv.h * k) / 1e6;
          if (mp > 2.6 && !confirm(`다시 업스케일하면 약 ${Math.round(sv.w * k)}×${Math.round(sv.h * k)} (${mp.toFixed(1)}MP)이 됩니다.\n그래픽카드 메모리(VRAM)가 부족하면 오류가 나거나 아주 느려질 수 있습니다. 계속할까요?`)) return;
        }
        setVal("src", sv ? (sv.subfolder ? sv.subfolder + "/" : "") + sv.filename : "");
        setVal("action", action); setVal("pick", st.pick);
        status.style.color = C.dim;
        status.textContent = action === "generate" ? "생성 중…" : all ? `${st.prev.length}장 모두 ${action === "upscale_all" ? "업스케일 " : ""}저장 중…` : action === "upscale" ? `${st.pick + 1}번 업스케일 중…` : `${st.pick + 1}번 저장 중…`;
        try {
          try { await app.queuePrompt(0, 1, { queueNodeIds: [node.id] }); }
          catch { await app.queuePrompt(0, 1); }
        } finally {
          setVal("action", "generate"); // 기본 [실행] 버튼 = 생성
          setVal("src", "");
        }
      }
      genBtn.onclick = () => go("generate");
      upBtn.onclick = () => go("upscale");
      saveBtn.onclick = () => go("save");

      node._cofoty5Show = (out) => {
        if (out?.cofoty5_previews?.length) {
          st.prev = out.cofoty5_previews.map((f) => ({ ...f, url: viewURL(f) }));
          st.saved = []; st.pick = 0; st.view = { kind: "prev", i: 0 }; show();
          histPush(); // 위쪽 [실행] 버튼으로 생성한 경우도 기억 (같은 내용이면 겹치지 않음)
        }
        if (out?.cofoty5_seed?.length) setVal("seed_value", out.cofoty5_seed[0]); // 마지막 시드를 남겨 둠
        if (out?.cofoty5_msg?.length) {
          st.msg = { text: out.cofoty5_msg[0], warn: out.cofoty5_msg[0].startsWith("⚠") };
          status.style.color = st.msg.warn ? C.warn : C.text; status.textContent = st.msg.text; status.title = st.msg.text;
        }
        (out?.cofoty5_saved || []).forEach((f, k) => {
          const src = f.src ?? out.cofoty5_pick?.[0] ?? st.pick;
          const what = f.kind === "upscale" ? "업스케일" : f.from ? "보정" : "그대로";
          const fx = f.fixed ? (what === "보정" ? `(${f.fixed})` : ` + ${f.fixed} 보정`) : "";
          const desc = `${what}${fx} · ${f.w}×${f.h} · ${f.from ? "저장본에서" : src + 1 + "번에서"}`;
          // 비교용 원본: 결과가 알려 주는 출발점으로 찾음 (저장본에서 시작했으면 그 저장본, 아니면 src번 미리보기)
          // — 업스케일을 연달아 눌러도 각 결과가 자기 원본과 짝지어짐
          const origin = f.from ? st.saved.find((x) => (x.subfolder ? x.subfolder + "/" : "") + x.filename === f.from) : null;
          const before = origin ? { url: origin.url, label: `저장본 (${origin.w}×${origin.h})` }
            : st.prev[src] ? { url: st.prev[src].url, label: `${src + 1}번 미리보기` } : null;
          st.saved.push({ ...f, url: viewURL(f), src, desc, before });
          st.view = { kind: "saved", i: st.saved.length - 1 }; st.pick = src;
          show();
          if (!out.cofoty5_auto) toast("저장 완료: " + (f.subfolder ? f.subfolder + "/" : "") + f.filename, "success", 4000);
        });
        sync();
        autoResult(out);
      };

      applyLayout();
      node.addDOMWidget("simple_panel", "div", panPassthrough(root), { serialize: false, getMinHeight: () => 640 });
      if (!node.size || node.size[0] < 900) node.setSize(is3() ? SIZE3 : SIZE2);
      const repaint = () => sync();
      PANELS.add(repaint);
      const onRemoved = node.onRemoved;
      node.onRemoved = function () { PANELS.delete(repaint); hideFloat(); api.removeEventListener("status", onStatus); return onRemoved?.apply(this, arguments); };
      // 맡겨 둔 상태 되살리기: 노드마다 고유 번호(cofoty5_uid, 워크플로와 함께 저장) + 워크플로 탭
      function bindMem() {
        let uid = node.properties.cofoty5_uid;
        const all = app.graph?._nodes || app.graph?.nodes || [];
        if (!uid || all.some((n) => n !== node && n.type === NODE && n.properties?.cofoty5_uid === uid)) // 새 노드 · 복사한 노드는 새 번호
          uid = node.properties.cofoty5_uid = Math.random().toString(36).slice(2, 10);
        const key = wfKey() + "#" + uid;
        const m = MEM.get(key);
        if (m && m.st !== st) {
          MEM_KEEP.forEach((k) => { if (m.st[k] !== undefined) st[k] = m.st[k]; });
          hist.list = m.hist.list; hist.i = m.hist.i;
          show(); paintAuto(); paintHist?.();
          if (st.msg) { status.style.color = st.msg.warn ? C.warn : C.text; status.textContent = st.msg.text; status.title = st.msg.text; }
        }
        MEM.delete(key); MEM.set(key, { st, hist });
        while (MEM.size > 30) MEM.delete(MEM.keys().next().value); // 오래된 것부터 정리
      }
      setTimeout(() => { applyLayout(); sync(); bindMem(); }, 0);
      loadLibrary(); loadModels(); if (!FAVS.loaded) loadFavs();
      loadFiles();
      const cfg = node.onConfigure;
      node.onConfigure = function () { const rr = cfg?.apply(this, arguments); dropSockets(node); setTimeout(() => { dropSockets(node); applyLayout(); s1._paint?.(); s3._paint?.(); s4._paint?.(); loadFiles(); sync(); bindMem(); }, 0); return rr; };
      return r;
    };

    // 값을 이름으로도 기억 → 입력 칸이 늘거나 순서가 바뀌어도 예전 워크플로가 밀리지 않음
    const onSer = nodeType.prototype.onSerialize;
    nodeType.prototype.onSerialize = function (o) {
      const rr = onSer?.apply(this, arguments);
      try {
        const map = {};
        SAVED.forEach((n) => { const w = this.widgets?.find((x) => x.name === n); if (w) map[n] = w.value; });
        o.properties = { ...(o.properties || {}), cofoty5_values: map };
      } catch {}
      return rr;
    };
    const onConf = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      const rr = onConf?.apply(this, arguments);
      try {
        let map = info?.properties?.cofoty5_values;
        const wv = info?.widgets_values;
        if (!map && Array.isArray(wv) && (wv.length === V1_ORDER.length || wv.length === V1_ORDER.length + 1) && typeof wv[5] === "number") {
          map = { loras: "[]", save_folder: "anima_simple", save_name: NAME_RULES[0], date_folder: false }; // 1차 버전에 없던 칸은 기본값
          V1_ORDER.forEach((n, i) => { if (n !== "action" && n !== "pick") map[n] = wv[i]; }); // 1차 버전 워크플로
        }
        if (map) {
          for (const [n, v] of Object.entries(map)) {
            const w = this.widgets?.find((x) => x.name === n);
            if (w && v !== undefined && v !== null) w.value = v;
          }
        }
        // 글자 칸에 엉뚱한 값이 들어 있으면 기본값으로 (밀린 값 방지)
        const fixStr = (n, def, ok) => { const w = this.widgets?.find((x) => x.name === n); if (w && (typeof w.value !== "string" || (ok && !ok(w.value)))) w.value = def; };
        fixStr("loras", "[]", (v) => { try { return Array.isArray(JSON.parse(v)); } catch { return false; } });
        fixStr("save_folder", "onenode");
        fixStr("model_type", "anima", (v) => v === "anima" || v === "ckpt");
        fixStr("toggles", "[]", (v) => { try { return Array.isArray(JSON.parse(v)); } catch { return false; } });
        fixStr("model", ""); fixStr("ckpt", ""); fixStr("text_encoder", ""); fixStr("vae", "");
        fixStr("positive", ""); fixStr("negative", ""); fixStr("quality", ""); fixStr("extra", "");
        const pk = this.widgets?.find((x) => x.name === "pick"); if (pk && typeof pk.value !== "number") pk.value = 0;
        const a = this.widgets?.find((x) => x.name === "action"); if (a) a.value = "generate";
        const sn = this.widgets?.find((x) => x.name === "save_name"); if (sn && !NAME_RULES.includes(sn.value)) sn.value = NAME_RULES[0];
      } catch (e) { console.warn("[cofoty5_onenode] 값 복원", e); }
      return rr;
    };

    const onExec = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (out) {
      const rr = onExec?.apply(this, arguments);
      try { this._cofoty5Show?.(out); } catch (e) { console.warn("[cofoty5_onenode]", e); }
      return rr;
    };
  },
});

// 오류가 나면 상태 줄에도 표시
api.addEventListener("execution_error", (e) => {
  const d = e.detail || {};
  const n = app.graph?.getNodeById?.(+String(d.node_id ?? "").split(":")[0]);
  if (n?.type === NODE && n._cofoty5Show) n._cofoty5Show({ cofoty5_msg: ["⚠ " + (d.exception_message || "오류").split("\n")[0]], cofoty5_error: true });
});
