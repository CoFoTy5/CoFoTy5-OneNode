"""LoRA 세트 · 저장 위치 서버 주소 (LoRA 공통 규격 v2)

  GET  {P}/lora_store          → {sets, types, prompts, folder, default, is_default, exists, version}
  POST {P}/lora_store/set      → {op: "put", name, loras, type, prompt} / {op: "del", name} / {op: "rename", name, to}
  POST {P}/lora_store/folder   → {folder: "경로" | ""(기본 위치로)}
  POST {P}/lora_store/pick     → PC에서 폴더 고르기 창 → {path}
  POST {P}/lora_store/images   → {name, files: [{filename, subfolder, type: output|temp}]} 세트에 그림 붙이기
  GET  {P}/lora_store/thumb?name=  → 세트 미리보기 그림
"""
import os
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
            elif op in ("star", "hide"):
                out = await bg(library.flag_set, d.get("name", ""), "stars" if op == "star" else "hidden", bool(d.get("on")))
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

    def _real(f):
        import folder_paths
        base = folder_paths.get_temp_directory() if f.get("type") == "temp" else folder_paths.get_output_directory()
        base = os.path.realpath(base)
        p = os.path.realpath(os.path.join(base, str(f.get("subfolder") or ""), os.path.basename(str(f.get("filename") or ""))))
        return p if p.startswith(base + os.sep) and os.path.isfile(p) else None

    @routes.post(P + "/images")
    async def _images(request):
        try:
            d = await request.json()
            paths = [_real(f) for f in (d.get("files") or [])[:8] if isinstance(f, dict)]
            res = await bg(library.attach_images, d.get("name", ""), paths)
            out = await bg(library.store)
            out["attached"] = res["count"]
            return web.json_response(out)
        except Exception as e:
            return err(e)

    @routes.get(P + "/thumb")
    async def _thumb(request):
        p = await bg(library.thumb_path, request.query.get("name", ""))
        if not p:
            return web.Response(status=404)
        return web.FileResponse(p, headers={"Cache-Control": "max-age=3600"})

    @routes.post(P + "/upload")
    async def _upload(request):
        try:
            import base64
            d = await request.json()
            data = str(d.get("data") or "")
            raw = base64.b64decode(data.split(",", 1)[1] if data.startswith("data:") else data)
            if len(raw) > 40 * 1024 * 1024:
                raise ValueError("그림이 너무 큽니다 (40MB까지)")
            await bg(library.upload_image, d.get("name", ""), raw)
            return web.json_response(await bg(library.store))
        except Exception as e:
            return err(e)

    @routes.post(P + "/open")
    async def _open(request):
        try:
            from .oscmd import open_folder
            return web.json_response({"opened": await bg(open_folder, library.folder)})
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
