"""Open a folder in the OS file manager (ComfyUI runs on the user's own PC)."""
import os
import subprocess
import sys


def open_folder(path):
    """Open `path`, or its nearest existing parent. Returns the folder actually opened."""
    p = os.path.abspath(path)
    while not os.path.isdir(p):
        parent = os.path.dirname(p)
        if parent == p:
            break
        p = parent
    if sys.platform.startswith("win"):
        os.startfile(p)  # noqa: S606 — local folder only
    elif sys.platform == "darwin":
        subprocess.Popen(["open", p])
    else:
        subprocess.Popen(["xdg-open", p], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return p
