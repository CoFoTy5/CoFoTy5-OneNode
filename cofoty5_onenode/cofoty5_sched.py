"""CoFoTy5 · beta57 스케줄러 추가 (노드 아님)

RES4LYF 노드팩의 beta57과 같은 것: ComfyUI 기본 beta 스케줄러를 alpha=0.5, beta=0.7로 부르는 프리셋.
(기본 beta는 0.6/0.6 — 0.7 쪽이 노이즈 적은 마무리 구간에 스텝을 조금 더 줌)
ComfyUI 스케줄러 목록에 끼워 넣으므로 기본 KSampler · FaceDetailer · DetailerForEach 등
scheduler 칸이 있는 모든 노드에서 'beta57'로 고를 수 있음.
RES4LYF가 이미 깔려 있으면 그쪽 것을 그대로 쓰고 여기서는 아무것도 하지 않음.
"""
import logging

ALPHA, BETA = 0.5, 0.7


def _register():
    import comfy.samplers as S

    names = getattr(S, "SCHEDULER_NAMES", None)
    handlers = getattr(S, "SCHEDULER_HANDLERS", None)
    if names is None or handlers is None or not hasattr(S, "SchedulerHandler"):
        logging.warning("[CoFoTy5] 이 ComfyUI 버전에서는 beta57을 추가할 수 없습니다 (ComfyUI 업데이트 필요)")
        return
    if "beta57" in handlers:
        if "beta57" not in names:
            names.append("beta57")
        return  # RES4LYF 등이 이미 넣어 둠

    def beta57_scheduler(model_sampling, steps):
        return S.beta_scheduler(model_sampling, steps, alpha=ALPHA, beta=BETA)

    handlers["beta57"] = S.SchedulerHandler(beta57_scheduler)
    if "beta57" not in names:
        names.append("beta57")  # KSampler.SCHEDULERS와 같은 목록 객체
    ks = getattr(S.KSampler, "SCHEDULERS", None)
    if ks is not None and ks is not names and "beta57" not in ks:
        ks.append("beta57")
    logging.info("[CoFoTy5] beta57 스케줄러 추가 (beta alpha=0.5, beta=0.7)")


try:
    _register()
except Exception as e:  # 스케줄러 추가가 실패해도 노드팩 나머지는 그대로 동작
    logging.warning(f"[CoFoTy5] beta57 스케줄러를 추가하지 못했습니다: {e}")
