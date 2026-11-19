"""LoRA 세트 · 저장 위치 서버 주소 (LoRA 공통 규격 v2)

  GET  {P}/lora_store          → {sets, types, prompts, folder, default, is_default, exists, version}
  POST {P}/lora_store/set      → {op: "put", name, loras, type, prompt} / {op: "del", name} / {op: "rename", name, to}
  POST {P}/lora_store/folder   → {folder: "경로" | ""(기본 위치로)}
  POST {P}/lora_store/pick     → PC에서 폴더 고르기 창 → {path}
"""
import asyncio

from aiohttp import web

from .lora_info import pick_folder_dialog


def register(routes, prefix, library):
    P = prefix.rstrip("/") + "/lora_store"

    async def bg(fn, *a):
        return await asyncio.get_running_loop().run_in_executor(None, fn, *a)

    def err(e):
        return web.json_response({"error": str(e)}, status=400)

    @routes.get(P)
    async def _get(request):
        try:
            return web.json_response(await bg(library.store))
        except Exception as e:
            return err(e)

    @routes.post(P + "/set")
    async def _set(request):
        try:
            d = await request.json()
            op = d.get("op", "put")
            if op == "del":
                out = await bg(library.delete_set, d.get("name", ""))
            elif op == "rename":
                out = await bg(library.rename_set, d.get("name", ""), d.get("to", ""))
            else:
                out = await bg(library.put_set, d.get("name", ""), d.get("loras", []), d.get("type"), d.get("prompt"))
            return web.json_response(out)
        except Exception as e:
            return err(e)

    @routes.post(P + "/folder")
    async def _folder(request):
        try:
            d = await request.json()
            info = await bg(library.set_folder, d.get("folder", ""))
            out = await bg(library.store)
            out["copied"] = info.get("copied", [])
            return web.json_response(out)
        except Exception as e:
            return err(e)

    @routes.post(P + "/pick")
    async def _pick(request):
        try:
            d = await request.json()
        except Exception:
            d = {}
        p = await bg(pick_folder_dialog, d.get("start", "") or library.folder)
        return web.json_response({"path": p, "ok": p is not None})
