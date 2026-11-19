"""④ 목록으로 연속 생성: 항목 파일 읽기 (ComfyUI 없이도 테스트할 수 있게 표준 라이브러리만 사용)
엑셀(.xlsx) · CSV · TSV · 메모장(.txt). 구글 스프레드시트는 .xlsx 또는 .csv로 내려받아 넣으면 됩니다.
태그셋 체크리스트 규칙 + 메모장의 `이름 = 태그` 줄."""
import csv
import io
import os
import re

EXTS = (".xlsx", ".csv", ".tsv", ".txt")

CAT_KEYS = ("분류", "카테고리", "그룹", "category", "group")
LABEL_KEYS = ("이름", "라벨", "제목", "label", "name", "title")
TAG_KEYS = ("태그", "프롬프트", "tags", "tag", "prompt")


def _norm(s):
    return str(s).strip().lower() if s is not None else ""


def _find_col(header, keys):
    for i, h in enumerate(header):
        if _norm(h) in keys:
            return i
    return None


def _rows_from_table(table, default_category):
    """table: list of row lists. Returns list of {category,label,tags}."""
    table = [[("" if c is None else str(c)).strip() for c in r] for r in table]
    table = [r for r in table if any(r)]
    if not table:
        return []
    header = table[0]
    ci, li, ti = _find_col(header, CAT_KEYS), _find_col(header, LABEL_KEYS), _find_col(header, TAG_KEYS)
    join_rest = False
    if ti is not None:
        body = table[1:]
    else:
        # no header row: first cell = label, everything after it = tags
        # (unquoted commas inside tags would otherwise split into extra columns)
        body = table
        if max(len(r) for r in table) >= 2:
            ci, li, ti, join_rest = None, 0, 1, True
        else:
            ci, li, ti = None, None, 0
    out = []
    current_cat = default_category
    for r in body:
        get = lambda i: r[i] if i is not None and i < len(r) else ""
        tags, label, cat = get(ti), get(li), get(ci)
        if join_rest:
            tags = ", ".join(c for c in r[1:] if c)
        if label.startswith("#") or (not label and tags.startswith("#")):
            continue
        if cat.startswith("#"):
            continue  # 분류 칸이 #으로 시작해도 메모 줄
        if cat:
            current_cat = cat  # merged/blank category cells inherit the one above
        if not tags:
            continue
        if not label:
            label = tags.split(",")[0].strip()[:30]
        out.append({"category": current_cat or "기본", "label": label, "tags": tags})
    return out


def _decode(raw):
    for enc in ("utf-8-sig", "cp949", "utf-16"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _xlsx_sheets(path):
    """Minimal .xlsx reader using only the standard library.
    Yields (sheet_title, table) where table is a list of row lists."""
    import posixpath
    import zipfile
    import xml.etree.ElementTree as ET

    NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

    def col_index(ref):
        n = 0
        for ch in ref:
            if ch.isalpha():
                n = n * 26 + (ord(ch.upper()) - 64)
            else:
                break
        return n - 1

    def text_of(el):
        return "".join(t.text or "" for t in el.iter("{%s}t" % NS["m"]))

    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        shared = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = [text_of(si) for si in root.findall("m:si", NS)]
        rel_target = {}
        if "xl/_rels/workbook.xml.rels" in names:
            for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")):
                tgt = r.get("Target", "")
                tgt = tgt.lstrip("/") if tgt.startswith("/") else posixpath.normpath(posixpath.join("xl", tgt))
                rel_target[r.get("Id")] = tgt
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        for sh in wb.findall("m:sheets/m:sheet", NS):
            target = rel_target.get(sh.get(REL))
            if not target or target not in names:
                continue
            root = ET.fromstring(z.read(target))
            table = []
            for row in root.findall("m:sheetData/m:row", NS):
                cells = {}
                for c in row.findall("m:c", NS):
                    t, ref = c.get("t"), c.get("r", "")
                    v = c.find("m:v", NS)
                    if t == "s" and v is not None:
                        val = shared[int(v.text)]
                    elif t == "inlineStr":
                        is_ = c.find("m:is", NS)
                        val = text_of(is_) if is_ is not None else ""
                    else:
                        val = v.text if v is not None and v.text is not None else ""
                        if t == "b":
                            val = "TRUE" if val == "1" else "FALSE"
                        elif val.endswith(".0"):
                            val = val[:-2]
                    idx = col_index(ref) if ref else len(cells)
                    cells[idx] = val
                if cells:
                    table.append([cells.get(i, "") for i in range(max(cells) + 1)])
            yield sh.get("name", "Sheet"), table


def _memo_table(text):
    """메모장: 한 줄에 하나. `이름 = 태그` 또는 태그만. `[분류]` 줄로 묶기, `#` 줄은 메모."""
    out, cat = [], ""
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith(("#", "//")):
            continue
        m = re.fullmatch(r"\[(.+)\]", s)
        if m:
            cat = m.group(1).strip()
            continue
        if "=" in s:
            a, b = s.split("=", 1)
            out.append([cat, a.strip(), b.strip()])
        else:
            out.append([cat, "", s])
    return [["분류", "이름", "태그"]] + out


def read_items(path):
    name = os.path.basename(path)
    stem = os.path.splitext(name)[0]
    ext = os.path.splitext(name)[1].lower()
    if ext == ".xlsx":
        rows = []
        for title, table in _xlsx_sheets(path):
            if title.startswith(("#", "_")):
                continue  # 메모 · 설명 시트
            rows += _rows_from_table(table, title)
        return rows
    with open(path, "rb") as f:
        text = _decode(f.read())
    if ext == ".txt" and "\t" not in text:
        rows = _rows_from_table(_memo_table(text), stem)
        return [dict(r, category=r["category"] if r["category"] != "기본" else stem) for r in rows]
    try:
        delim = csv.Sniffer().sniff(text[:4096], delimiters=",\t;").delimiter
    except csv.Error:
        delim = "\t" if ext in (".tsv", ".txt") else ","
    return _rows_from_table(list(csv.reader(io.StringIO(text), delimiter=delim)), stem)


def row_key(row):
    return f"{row['category']}::{row['label']}"


def safe_label(s):
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", str(s)).strip(" ._")
    return s[:40] or "item"
