// CoFoTy5 · 노드 패널(입력창·버튼·빈 공간) 위에서도 마우스 휠버튼(가운데 버튼) 끌기로 화면 이동
//  HTML 패널은 캔버스 위에 떠 있어서 휠버튼 누름이 캔버스까지 가지 않음 → 휠버튼만 캔버스로 넘겨줌.
//  (ComfyUI 기본 텍스트 입력창이 쓰는 방식과 같음. 왼쪽 클릭·글자 입력·휠 스크롤은 그대로)
//  다른 파일에서 import 해서 쓰는 도우미 — 이 파일 자체는 노드를 만들지 않음.
import { app } from "../../scripts/app.js";

const MMB = 1;
const cv = () => app.canvas;

// 커서 밑(대상 → 패널 바깥 틀까지)에 내용이 넘쳐서 실제로 스크롤되는 칸이 있는지
function scrollableUnder(e, root) {
  const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  for (let n = e.target; n && n.nodeType === 1; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const ov = horiz ? cs.overflowX : cs.overflowY;
    const scrolls = /(auto|scroll|overlay)/.test(ov) || n.tagName === "TEXTAREA" || n.tagName === "SELECT";
    if (scrolls && (horiz ? n.scrollWidth > n.clientWidth + 1 : n.scrollHeight > n.clientHeight + 1)) return true;
    if (n === root) break;
  }
  return false;
}

export function panPassthrough(el) {
  if (!el || el.__cfMMB) return el;
  el.__cfMMB = true;
  const opt = { capture: true }; // 안쪽 요소가 이벤트를 막기 전에 먼저 받음
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== MMB) return;
    e.preventDefault(); e.stopPropagation();
    try { cv()?.processMouseDown(e); } catch {}
  }, opt);
  el.addEventListener("pointermove", (e) => {
    if ((e.buttons & 4) !== 4) return;
    e.stopPropagation();
    try { cv()?.processMouseMove(e); } catch {}
  }, opt);
  el.addEventListener("pointerup", (e) => {
    if (e.button !== MMB) return;
    e.stopPropagation();
    try { cv()?.processMouseUp(e); } catch {}
  }, opt);
  // 휠 굴리기: 커서 밑에 스크롤되는 목록·입력창이 있으면 그걸 스크롤, 없으면 캔버스 확대/축소
  //  (Ctrl/⌘ 누른 채 굴리면 목록 위에서도 항상 확대/축소)
  el.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey) && scrollableUnder(e, el)) return;
    e.preventDefault(); e.stopPropagation();
    try { cv()?.processMouseWheel(e); } catch {}
  }, { capture: true, passive: false });
  // 윈도우 자동 스크롤 아이콘·가운데 클릭 동작 막기
  el.addEventListener("mousedown", (e) => { if (e.button === MMB) e.preventDefault(); }, opt);
  el.addEventListener("auxclick", (e) => { if (e.button === MMB) { e.preventDefault(); e.stopPropagation(); } }, opt);
  return el;
}
