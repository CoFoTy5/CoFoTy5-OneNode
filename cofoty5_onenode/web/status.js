// cofoty5_onenode · 상태 표시줄 + 리셋(재시작) 버튼  (같은 기능의 다른 노드팩이 있으면 그쪽 것만 보이게 함)
//  - CPU % · 온도 | RAM | GPU % · 온도 | VRAM | [↻ 리셋]  (Crystools 모니터 대체, 직접 작성)
//  - 위치: 위쪽 메뉴 바(LoRA Manager·rgthree 버튼이 들어가는 자리)에 붙음.
//    그 자리를 못 찾는 ComfyUI 버전이면 떠 있는 창으로 바뀌고(끌어서 이동, 더블클릭 = 아래 가운데로)
//  - GPU를 못 잡으면(절전 후 등) 표시줄이 빨갛게 바뀌고 리셋 버튼이 깜빡임
//  - 리셋 = ComfyUI 재시작: 표시줄 버튼 / 메뉴 CoFoTy5 OneNode › ComfyUI 재시작 / Ctrl+Alt+R
//  - 설정(톱니) › CoFoTy5 OneNode 에서 표시줄 켜기/끄기, 갱신 주기
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const toastMs = (s, l) => (l === "model" ? 6000 : ({ info: 2000, success: 2000, warn: 4000, error: 6000 }[s] ?? 2000)); // 알림 유지: 안내 2초 · 경고 4초 · 오류/모델 경고 6초

const toast = (msg, severity = "info", life) => {
  try { app.extensionManager?.toast?.add({ severity, summary: msg, life: toastMs(severity, life) }); } catch {}
  console.log("[cofoty5_onenode]", msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 리셋(재시작)
let busy = false;
async function restart() {
  if (busy) return;
  if (!confirm("ComfyUI를 재시작할까요?\n진행 중인 생성은 중단됩니다.")) return;
  busy = true;
  setResetting(true);
  try {
    await api.fetchApi("/cofoty5_onenode/restart", { method: "POST" });
  } catch {}
  toast("ComfyUI 재시작 중… (모델은 처음 생성할 때 다시 불러옵니다)", "info", 6000);
  await sleep(3000);
  for (let i = 0; i < 120; i++) {           // 최대 2분 기다림
    try {
      const r = await api.fetchApi("/system_stats", { cache: "no-store" });
      if (r.ok) { toast("ComfyUI 재시작 완료", "success"); busy = false; setResetting(false); return; }
    } catch {}
    await sleep(1000);
  }
  busy = false;
  setResetting(false);
  toast("재시작 확인이 늦어지고 있습니다. 콘솔 창을 확인해 주세요.", "warn", 8000);
}

// ---------------------------------------------------------------- 설정 읽기
const SET_SHOW = "cofoty5_onenode.monitor.show";
const SET_RATE = "cofoty5_onenode.monitor.rate";
function getSetting(id, def) {
  try {
    const v = app.extensionManager?.setting?.get?.(id) ?? app.ui?.settings?.getSettingValue?.(id);
    return v === undefined || v === null ? def : v;
  } catch { return def; }
}

// ---------------------------------------------------------------- 표시줄
const POS_KEY = "cofoty5_onenode.monitor.pos";
const css = `
#cofoty5-mon{position:fixed;z-index:1001;display:flex;align-items:stretch;gap:2px;height:34px;
  background:#1e1e22;border-radius:6px;padding:2px;color:#e8e8e8;font-family:sans-serif;
  user-select:none;cursor:grab;white-space:nowrap}
#cofoty5-mon.drag{cursor:grabbing}
#cofoty5-mon.docked{position:static;background:transparent;padding:0;margin:0 6px;cursor:default;align-self:center}
#cofoty5-mon .it{position:relative;width:46px;border-radius:4px;background:#2b2b31;overflow:hidden;
  display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px}
#cofoty5-mon .it .bar{position:absolute;left:0;top:0;bottom:0;width:0;background:#5d4a85;transition:width .4s}
#cofoty5-mon .it.warn .bar{background:#a8682a}
#cofoty5-mon .it.hot .bar{background:#b13a3a}
#cofoty5-mon .it .v{position:relative;font:700 12px/1 sans-serif}
#cofoty5-mon .it .n{position:relative;font:500 9px/1 sans-serif;color:rgba(255,255,255,.62);letter-spacing:.3px}
#cofoty5-mon .it.temp{width:40px;gap:3px}
#cofoty5-mon .it.temp .v{font:600 10px/1 sans-serif}
#cofoty5-mon .it.temp .v i{font-style:normal;color:#a9a3b8;font-weight:500;margin-right:3px;font-size:9px}
#cofoty5-mon .it.temp .v.warn{color:#f0a050}
#cofoty5-mon .it.temp .v.hot{color:#ff6a6a}
#cofoty5-mon .it.lost{background:#7a2424}
#cofoty5-mon .it.lost .n{color:#ffd0d0}
#cofoty5-mon .rst{width:40px;border:0;border-radius:4px;background:#3a3150;color:#fff;cursor:pointer;
  display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px;padding:0}
#cofoty5-mon .rst .v{font:700 13px/1 sans-serif}
#cofoty5-mon .rst .n{font:500 9px/1 sans-serif;color:#d8cdf0}
#cofoty5-mon .rst:hover{background:#4d4170}
#cofoty5-mon.lost .rst{background:#b13a3a;animation:cofoty5blink 1s infinite}
#cofoty5-mon .rst:disabled{opacity:.6;cursor:wait;animation:none}
@keyframes cofoty5blink{50%{background:#e04848}}
`;
const style = document.createElement("style");
style.textContent = css;
document.head.appendChild(style);

const box = document.createElement("div");
box.id = "cofoty5-mon";
box.dataset.owner = "cofoty5_onenode";
const cell = (k, name) => `<div class="it" data-k="${k}"><div class="bar"></div><span class="v">--</span><span class="n">${name}</span></div>`;
box.innerHTML = cell("cpu", "CPU") + cell("ram", "RAM") + cell("gpu", "GPU") + cell("vram", "VRAM") +
  `<div class="it temp" data-k="temp"><span class="v c"><i>C</i>--</span><span class="v g"><i>G</i>--</span></div>` +
  `<button class="rst" title="ComfyUI 재시작 (Ctrl+Alt+R)&#10;절전 후 GPU를 못 잡을 때, 새 노드를 넣었을 때"><span class="v">↻</span><span class="n">리셋</span></button>`;

const q = (k) => box.querySelector(`.it[data-k="${k}"]`);
const els = { cpu: q("cpu"), ram: q("ram"), gpu: q("gpu"), vram: q("vram"), temp: q("temp") };
const rst = box.querySelector(".rst");
rst.addEventListener("click", (e) => { e.stopPropagation(); restart(); });
rst.addEventListener("mousedown", (e) => e.stopPropagation());

function setResetting(on) {
  rst.disabled = on;
  rst.querySelector(".n").textContent = on ? "재시작" : "리셋";
}

// ---------------------------------------------------------------- 위치
// 1순위: 위쪽 메뉴 바 (LoRA Manager·rgthree와 같은 자리: 설정 버튼 묶음 바로 앞)
// 2순위: 떠 있는 창 (끌어서 이동 · 위치 기억 · 더블클릭 = 아래 가운데로)
let docked = false;
function dock() {
  const anchor = app.menu?.settingsGroup?.element;
  if (!anchor || !anchor.parentElement) return false;
  if (box.parentElement !== anchor.parentElement || box.nextSibling !== anchor) anchor.before(box);
  box.classList.add("docked");
  Object.assign(box.style, { left: "", top: "", bottom: "", transform: "" });
  docked = true;
  return true;
}
function placeDefault() {
  box.style.left = "50%"; box.style.top = ""; box.style.bottom = "14px"; box.style.transform = "translateX(-50%)";
}
function clamp() {
  const r = box.getBoundingClientRect();
  const x = Math.min(Math.max(0, r.left), window.innerWidth - r.width);
  const y = Math.min(Math.max(0, r.top), window.innerHeight - r.height);
  box.style.left = x + "px"; box.style.top = y + "px"; box.style.bottom = ""; box.style.transform = "";
}
function floatMode() {
  docked = false;
  box.classList.remove("docked");
  if (box.parentElement !== document.body) document.body.appendChild(box);
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (p && typeof p.x === "number") {
      box.style.left = p.x + "px"; box.style.top = p.y + "px"; box.style.transform = "";
      requestAnimationFrame(clamp);
    } else placeDefault();
  } catch { placeDefault(); }
}
// 메뉴 바는 화면이 다 만들어진 뒤에 생기므로 잠깐 기다렸다가 붙임 (최대 10초, 못 찾으면 떠 있는 창)
async function mount() {
  box.style.visibility = "hidden";
  document.body.appendChild(box);
  for (let i = 0; i < 40; i++) {
    if (dock()) break;
    await sleep(250);
  }
  if (!docked) floatMode();
  box.style.visibility = "";
  // 메뉴 바가 다시 그려져 빠져버리면 다시 붙임
  setInterval(() => { if (docked && !box.isConnected) { if (!dock()) floatMode(); } }, 2000);
}
window.addEventListener("resize", () => { if (!docked && box.style.transform === "") clamp(); });

box.addEventListener("mousedown", (e) => {
  if (docked || e.button !== 0) return;
  const r = box.getBoundingClientRect();
  const dx = e.clientX - r.left, dy = e.clientY - r.top;
  box.classList.add("drag");
  const move = (ev) => {
    box.style.transform = ""; box.style.bottom = "";
    box.style.left = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - r.width) + "px";
    box.style.top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - r.height) + "px";
  };
  const up = () => {
    box.classList.remove("drag");
    window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
    const rr = box.getBoundingClientRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(rr.left), y: Math.round(rr.top) })); } catch {}
  };
  window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  e.preventDefault();
});
box.addEventListener("dblclick", (e) => {
  if (docked || e.target === rst) return;
  try { localStorage.removeItem(POS_KEY); } catch {}
  placeDefault();
});

// ---------------------------------------------------------------- 값 표시
const GB = 1024 ** 3;
const gb = (b) => (b / GB).toFixed(b / GB >= 10 ? 0 : 1);
const level = (p, w = 80, h = 95) => (p >= h ? "hot" : p >= w ? "warn" : "");
const tlevel = (t, w = 80, h = 90) => (t >= h ? "hot" : t >= w ? "warn" : "");

function setItem(el, pct, text, title) {
  el.querySelector(".bar").style.width = pct == null ? "0" : Math.min(100, Math.max(0, pct)) + "%";
  el.querySelector(".v").textContent = text;
  el.classList.remove("warn", "hot");
  const lv = pct == null ? "" : level(pct);
  if (lv) el.classList.add(lv);
  if (title !== undefined) el.title = title;
}
function setTemp(sel, t, w, h) {
  const s = els.temp.querySelector(sel);
  s.classList.remove("warn", "hot");
  s.lastChild.textContent = t == null ? "--" : Math.round(t) + "°";
  const lv = t == null ? "" : tlevel(t, w, h);
  if (lv) s.classList.add(lv);
}

let lostText = "";
function showLost(text) {
  box.classList.add("lost");
  els.gpu.classList.add("lost");
  els.gpu.querySelector(".n").textContent = "끊김";
  lostText = text;
}
function clearLost() {
  box.classList.remove("lost");
  els.gpu.classList.remove("lost");
  els.gpu.querySelector(".n").textContent = "GPU";
  lostText = "";
}

function render(d) {
  setItem(els.cpu, d.cpu, d.cpu == null ? "--" : Math.round(d.cpu) + "%", "CPU 사용률");
  setItem(els.ram, d.ram_total ? (d.ram_used / d.ram_total) * 100 : null,
    d.ram_total ? Math.round((d.ram_used / d.ram_total) * 100) + "%" : "--",
    d.ram_total ? `RAM ${gb(d.ram_used)} / ${gb(d.ram_total)} GB` : "");

  const g = d.gpu || {};
  const vpct = g.vram_total ? (g.vram_used / g.vram_total) * 100 : null;
  setItem(els.vram, vpct, vpct == null ? "--" : Math.round(vpct) + "%",
    g.vram_total ? `VRAM ${gb(g.vram_used)} / ${gb(g.vram_total)} GB` : "");

  setTemp(".c", d.cpu_temp, 85, 95);
  setTemp(".g", g.temp, 80, 88);
  els.temp.title = "C = CPU 온도 · G = GPU 온도" + (d.cpu_temp != null ? `\nCPU 온도: ${d.cpu_temp_src}` :
    (d.cpu_temp_tried ? "\nCPU 온도를 읽지 못함 — LibreHardwareMonitor를 켜 두면 표시됩니다 (README 참고)" : ""));

  if (!d.cuda_ok || g.ok === false) {
    showLost(d.cuda_err || g.err || "GPU 끊김");
    setItem(els.gpu, null, "!", `GPU 끊김 — ↻ 리셋을 눌러 주세요\n${lostText}`);
  } else {
    clearLost();
    setItem(els.gpu, g.util, g.util == null ? "--" : g.util + "%", (g.name || "GPU") + (g.err ? `\n${g.err}` : ""));
  }
}

// ---------------------------------------------------------------- 갱신
let timer = null, failing = 0, warned = false;
async function tick() {
  if (busy) return;
  try {
    const r = await api.fetchApi("/cofoty5_onenode/monitor", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    failing = 0;
    render(d);
    if (!d.cuda_ok || d.gpu?.ok === false) {
      if (!warned) { toast("GPU를 못 잡고 있습니다. 표시줄의 ↻ 리셋을 눌러 주세요.", "warn", 8000); warned = true; }
    } else warned = false;
  } catch {
    if (++failing >= 3) { showLost("서버 연결 끊김"); els.gpu.title = "서버 연결 끊김"; }
  }
}
function startPolling() {
  clearInterval(timer);
  const show = getSetting(SET_SHOW, true);
  box.querySelectorAll(".it").forEach((e) => (e.style.display = show ? "" : "none"));
  if (!show) { clearLost(); return; }       // 표시줄을 꺼도 리셋 버튼은 남김
  const ms = Number(getSetting(SET_RATE, 1000)) || 1000;
  tick();
  timer = setInterval(tick, ms);
}

app.registerExtension({
  name: "cofoty5_onenode.status",
  commands: [{ id: "cofoty5_onenode.restart", label: "ComfyUI 재시작 ®", icon: "pi pi-refresh", function: restart }],
  menuCommands: [{ path: ["CoFoTy5 OneNode"], commands: ["cofoty5_onenode.restart"] }],
  settings: [
    { id: SET_SHOW, category: ["CoFoTy5 OneNode", "상태 표시줄", "표시"], name: "CPU·RAM·GPU·VRAM 표시 (끄면 리셋 버튼만 남음)",
      type: "boolean", defaultValue: true, onChange: () => setTimeout(startPolling, 0) },
    { id: SET_RATE, category: ["CoFoTy5 OneNode", "상태 표시줄", "갱신"], name: "갱신 주기",
      type: "combo", defaultValue: 1000,
      options: [{ text: "0.5초", value: 500 }, { text: "1초", value: 1000 }, { text: "2초", value: 2000 }, { text: "5초", value: 5000 }],
      onChange: () => setTimeout(startPolling, 0) },
  ],
  setup() {
    // 같은 기능의 다른 노드팩(이름이 *.restart인 확장)이 같이 깔려 있으면 그쪽 표시줄만 씀 (두 개 겹치지 않게)
    const full = (app.extensions || []).some((e) => /\.restart$/.test(String(e?.name || "")) && !String(e.name).startsWith("cofoty5_onenode"));
    if (full) { box.remove(); return; }   // 단축키 Ctrl+Alt+R도 그쪽 것을 씀
    // 그런 노드팩이 없을 때만 Ctrl+Alt+R (등록 단축키로 넣으면 겹쳐 오류 알림이 뜸)
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.altKey && !e.shiftKey && (e.key === "r" || e.key === "R")) { e.preventDefault(); restart(); }
    });
    mount(); startPolling();
  },
});
