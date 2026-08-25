"""Render PDF pages to ordered PNG files using pypdfium2."""

from __future__ import annotations

import argparse
from pathlib import Path

try:
    import pypdfium2 as pdfium
except ImportError as error:  # pragma: no cover - exercised by the JS error path
    raise SystemExit(
        "pypdfium2가 필요합니다. OCR 가상환경에 requirements-ocr.txt를 설치하세요."
    ) from error


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Render PDF pages as RGB PNG files.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--dpi", type=int, default=300)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.dpi < 72 or args.dpi > 600:
        raise SystemExit("--dpi는 72 이상 600 이하이어야 합니다.")

    output_directory = Path(args.output)
    output_directory.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(args.input)
    if len(document) == 0:
        raise SystemExit("PDF에 페이지가 없습니다.")

    scale = args.dpi / 72
    for page_index in range(len(document)):
        page = document[page_index]
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil().convert("RGB")
        image.save(output_directory / f"page-{page_index + 1:04d}.png")
        image.close()
        bitmap.close()
        page.close()
    document.close()


if __name__ == "__main__":
    main()
