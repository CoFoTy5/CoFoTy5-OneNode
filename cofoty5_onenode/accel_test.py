"""CoFoTy5 OneNode · 가속(Triton + SageAttention) 시험

설치 프로그램과 노드의 [다시 시험] 버튼이 ComfyUI와 따로(별도 python 프로세스로) 실행합니다.
  python_embeded\\python.exe -s accel_test.py --out <결과 json 경로>

불러오기만 보는 것이 아니라, 그래픽카드에서 작은 계산을 실제로 돌려 보고 기본 계산과 결과를 비교합니다.
결과 파일에 ok / reason 을 쓰고, 사용자가 정한 켜기/끄기(enabled)는 그대로 둡니다.
"""
import json
import os
import sys
import time


class Fail(Exception):
    pass


def _load(path):
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def run():
    res = {"ok": False, "reason": "", "stage": "torch", "torch": "", "triton": "", "sage": "", "gpu": "", "sm": "", "fp16_acc": False}
    try:
        try:
            import torch
        except Exception as e:
            raise Fail(f"PyTorch를 불러오지 못했습니다 ({e})")
        res["torch"] = torch.__version__
        if not torch.cuda.is_available():
            raise Fail("그래픽카드(CUDA)를 쓸 수 없습니다. NVIDIA 그래픽카드와 드라이버가 필요합니다")
        cap = torch.cuda.get_device_capability(0)
        res["gpu"] = torch.cuda.get_device_name(0)
        res["sm"] = f"{cap[0]}.{cap[1]}"
        res["fp16_acc"] = hasattr(torch.backends.cuda.matmul, "allow_fp16_accumulation")
        old_gpu = cap[0] < 8   # RTX 20 시리즈(7.5) 이하
        res["stage"] = "import"   # 여기서 실패하면 ComfyUI 시작에도 문제가 생길 수 있음 → 설치 프로그램이 SageAttention을 지움
        try:
            import triton
            res["triton"] = getattr(triton, "__version__", "?")
        except Exception as e:
            raise Fail(f"Triton을 불러오지 못했습니다 ({type(e).__name__}: {str(e)[:200]})")
        try:
            import sageattention
            from sageattention import sageattn
            res["sage"] = getattr(sageattention, "__version__", "") or "?"
        except Exception as e:
            raise Fail(f"SageAttention을 불러오지 못했습니다 ({type(e).__name__}: {str(e)[:200]})")
        # 실제 계산: 작은 크기로 Sage와 기본 계산을 비교
        res["stage"] = "compute"
        try:
            g = torch.Generator(device="cuda").manual_seed(0)
            q, k, v = (torch.randn(1, 8, 256, 64, device="cuda", dtype=torch.float16, generator=g) for _ in range(3))
            out = sageattn(q, k, v, tensor_layout="HND", is_causal=False)
            ref = torch.nn.functional.scaled_dot_product_attention(q, k, v)
            torch.cuda.synchronize()
        except Exception as e:
            msg = f"{type(e).__name__}: {str(e)[:200]}"
            if old_gpu:
                raise Fail(f"이 그래픽카드({res['gpu']})는 가속을 지원하지 않는 것 같습니다 ({msg})")
            raise Fail(f"가속 계산을 실행하지 못했습니다 ({msg})")
        err = (out.float() - ref.float()).abs().max().item()
        if not (err == err) or err > 0.1:   # NaN 또는 차이가 큼
            raise Fail(f"가속 계산 결과가 기본 계산과 맞지 않습니다 (차이 {err:.3f})")
        res["ok"] = True
        res["reason"] = ""
        res["stage"] = "done"
    except Fail as e:
        res["reason"] = str(e)
    except Exception as e:
        res["reason"] = f"시험 중 알 수 없는 오류 ({type(e).__name__}: {str(e)[:200]})"
    return res


def main():
    out = None
    if "--out" in sys.argv:
        i = sys.argv.index("--out")
        if i + 1 < len(sys.argv):
            out = sys.argv[i + 1]
    res = run()
    res["tested"] = time.strftime("%Y-%m-%d %H:%M")
    if out:
        d = _load(out)
        d.update(res)
        d["installed"] = True
        d.pop("runtime_error", None)   # 다시 시험하면 실행 중 오류 기록은 지움
        d.setdefault("enabled", True)
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
    print(("OK" if res["ok"] else "FAIL") + " " + json.dumps(res))   # 영문 · \u 로만 (윈도우 출력 글자 깨짐 방지)
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
