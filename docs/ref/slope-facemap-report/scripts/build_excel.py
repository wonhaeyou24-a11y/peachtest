"""
절토사면 Face Map 정리용 엑셀 생성 스크립트 (4개 시트 고정 양식).

사용법:
    python build_excel.py input.json output.xlsx

input.json 구조 예시는 이 파일 하단 EXAMPLE_JSON 참고.
스타일/구조는 ../references/excel_template.md 문서와 반드시 일치시킬 것.
"""
import sys
import json
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

FONT = "Arial"
title_font = Font(name=FONT, size=14, bold=True)
subtitle_font = Font(name=FONT, size=9, color="595959")
header_font = Font(name=FONT, size=11, bold=True, color="FFFFFF")
header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
section_font = Font(name=FONT, size=11, bold=True, color="FFFFFF")
section_fill = PatternFill(start_color="8497B0", end_color="8497B0", fill_type="solid")
normal_font = Font(name=FONT, size=10)
bold_font = Font(name=FONT, size=10, bold=True)
note_font = Font(name=FONT, size=9, italic=True, color="808080")
thin = Side(style="thin", color="B7B7B7")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal="center", vertical="center", wrap_text=True)
left = Alignment(horizontal="left", vertical="center", wrap_text=True)
stripe_fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")


def style_header_row(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center
        cell.border = border


def style_data_row(ws, row, ncols, stripe=False):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = normal_font
        cell.border = border
        if stripe:
            cell.fill = stripe_fill


def add_title(ws, text, ncols, subtitle=None):
    ws["A1"] = text
    ws["A1"].font = title_font
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    if subtitle:
        ws["A2"] = subtitle
        ws["A2"].font = subtitle_font
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)


def add_notes(ws, start_row, notes, ncols):
    ws.cell(row=start_row, column=1, value="※ 작성 안내").font = Font(name=FONT, size=9, bold=True)
    for i, n in enumerate(notes):
        r = start_row + 1 + i
        ws.cell(row=r, column=1, value=n).font = note_font
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=ncols)
        ws.cell(row=r, column=1).alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        ws.row_dimensions[r].height = 26
    return start_row + 1 + len(notes)


def build(data, out_path):
    wb = openpyxl.Workbook()
    subtitle = data.get("subtitle", "")

    # ---- Sheet 1: 기본정보 ----
    ws = wb.active
    ws.title = "1.기본정보"
    add_title(ws, data.get("title", "절토사면 외관조사 현황도 - 기본정보"), 2, subtitle)
    row = 4
    for k, v in data.get("basic_info", []):
        ws.cell(row=row, column=1, value=k).font = bold_font
        ws.cell(row=row, column=2, value=v).font = normal_font
        for c in (1, 2):
            ws.cell(row=row, column=c).border = border
            ws.cell(row=row, column=c).alignment = left
        row += 1
    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 45

    # ---- Sheet 2: 손상현황 ----
    # 2026-09 확정 양식: 구간 / 위치 / 손상명 / 규모구분1 / 값1 / 단위1 / 규모구분2 / 값2 / 단위2
    # 각 damage dict 예시:
    #   {"pos": 252, "section": "2구간", "name": "균열 (1소단측구)",
    #    "m1": ["L=", 2.0, "m"], "m2": ["CW=", 0.5, "mm"]}
    #   측정값이 없으면 "m1": None (자동으로 "-","-","-" 처리), "m2": None이면 공란
    ws2 = wb.create_sheet("2.손상현황")
    add_title(ws2, "절토사면 손상 현황 (지시선 판독)", 9, subtitle)
    headers = ["구간", "위치 (연장 m)", "손상명", "규모구분1", "값1", "단위1", "규모구분2", "값2", "단위2"]
    for i, h in enumerate(headers, start=1):
        ws2.cell(row=4, column=i, value=h)
    style_header_row(ws2, 4, 9)
    damages = sorted(data.get("damages", []), key=lambda x: -x.get("pos", 0))
    row = 5
    for d in damages:
        m1 = d.get("m1")
        m2 = d.get("m2")
        vals = [
            d.get("section", ""),
            f"{d['pos']}m",
            d["name"],
        ]
        vals += list(m1) if m1 else ["-", "-", "-"]
        vals += list(m2) if m2 else ["", "", ""]
        for i, v in enumerate(vals, start=1):
            cell = ws2.cell(row=row, column=i, value=v)
            cell.font = normal_font
            cell.border = border
            cell.alignment = left if i == 3 else center
            if row % 2 == 0:
                cell.fill = stripe_fill
        row += 1
    default_notes2 = [
        "1) '구간'은 도면에 표기된 구간 경계를 기준으로 '위치' 값이 속하는 구간을 판정한 것입니다.",
        "2) '위치'는 도면 하단 연장(chainage) 눈금자를 기준으로 각 손상 지시선(리더선)이 비탈면과 만나는 지점을 픽셀좌표 환산하여 산정했습니다. 약 ±1~2m 오차가 있을 수 있습니다.",
        "3) '값1/값2'는 단위를 뗀 순수 숫자로 입력해 그대로 복사해 계산에 쓸 수 있습니다. 단위는 '단위1/단위2'열에 별도 표기했습니다.",
        "4) 규모 표기가 없는 손상은 규모구분1~단위1을 '-'로, 두 번째 측정값이 없는 항목은 규모구분2~단위2를 공란으로 처리했습니다.",
    ]
    row = add_notes(ws2, row + 1, data.get("damage_notes", default_notes2), 9)
    widths = {"A": 10, "B": 14, "C": 26, "D": 11, "E": 9, "F": 9, "G": 11, "H": 9, "I": 9}
    for col, w in widths.items():
        ws2.column_dimensions[col].width = w
    ws2.freeze_panes = "A5"

    # ---- Sheet 3: 시설물현황 ----
    ws3 = wb.create_sheet("3.시설물현황")
    add_title(ws3, "시설물 및 조사시험 위치 현황", 3, subtitle)
    headers = ["위치 (연장 m) / 범위", "시설물·시험명", "비고"]
    for i, h in enumerate(headers, start=1):
        ws3.cell(row=4, column=i, value=h)
    style_header_row(ws3, 4, 3)
    row = 5
    for f in data.get("facilities", []):
        ws3.cell(row=row, column=1, value=f["pos"]).alignment = center
        ws3.cell(row=row, column=2, value=f["name"]).alignment = left
        ws3.cell(row=row, column=3, value=f.get("note", "")).alignment = left
        style_data_row(ws3, row, 3, stripe=(row % 2 == 0))
        row += 1
    if data.get("facility_notes"):
        row = add_notes(ws3, row + 1, data["facility_notes"], 3)
    ws3.column_dimensions["A"].width = 20
    ws3.column_dimensions["B"].width = 30
    ws3.column_dimensions["C"].width = 30

    # ---- Sheet 4: 사면형상정보 ----
    ws4 = wb.create_sheet("4.사면형상정보")
    add_title(ws4, "비탈면 형상(소단·경사) 정보", 2, subtitle)
    row = 4
    for section in data.get("shape_sections", []):
        ws4.cell(row=row, column=1, value=section["title"]).font = section_font
        ws4.cell(row=row, column=1).fill = section_fill
        ws4.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
        ws4.cell(row=row, column=2).fill = section_fill
        row += 1
        headers = section.get("headers", ["항목", "값"])
        for i, h in enumerate(headers, start=1):
            ws4.cell(row=row, column=i, value=h)
        style_header_row(ws4, row, 2)
        row += 1
        for a, b in section.get("rows", []):
            ws4.cell(row=row, column=1, value=a).alignment = left
            ws4.cell(row=row, column=2, value=b).alignment = center
            style_data_row(ws4, row, 2, stripe=(row % 2 == 0))
            row += 1
        row += 1
    if data.get("shape_note"):
        ws4.cell(row=row, column=1, value=data["shape_note"]).font = note_font
        ws4.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
        ws4.cell(row=row, column=1).alignment = Alignment(horizontal="left", wrap_text=True)
        ws4.row_dimensions[row].height = 26
    ws4.column_dimensions["A"].width = 26
    ws4.column_dimensions["B"].width = 40

    wb.save(out_path)
    return out_path


if __name__ == "__main__":
    in_path, out_path = sys.argv[1], sys.argv[2]
    with open(in_path, encoding="utf-8") as f:
        data = json.load(f)
    build(data, out_path)
    print("saved:", out_path)
