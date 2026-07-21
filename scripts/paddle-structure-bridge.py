"""PP-StructureV3 bridge that saves Markdown without PaddleX visualizations."""

from __future__ import annotations

import argparse
import gc
import json
from pathlib import Path

from paddleocr import PaddleOCR, PPStructureV3


def parse_bool(value: str) -> bool:
    return value.lower() in {"true", "yes", "t", "y", "1"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run PP-StructureV3 and save only Markdown/assets. "
            "This avoids PaddleX save_all() visualization failures."
        )
    )
    parser.add_argument("subcommand", choices=["pp_structurev3"])
    parser.add_argument("-i", "--input", required=True)
    parser.add_argument("--save_path", required=True)
    parser.add_argument("--device", default="cpu")
    parser.add_argument(
        "--text_recognition_model_name",
        default="korean_PP-OCRv5_mobile_rec",
    )
    parser.add_argument("--use_doc_orientation_classify", type=parse_bool, default=True)
    parser.add_argument("--use_doc_unwarping", type=parse_bool, default=True)
    parser.add_argument("--use_textline_orientation", type=parse_bool, default=True)
    parser.add_argument("--use_region_detection", type=parse_bool, default=True)
    parser.add_argument("--use_table_recognition", type=parse_bool, default=True)
    parser.add_argument("--use_formula_recognition", type=parse_bool, default=False)
    parser.add_argument("--use_seal_recognition", type=parse_bool, default=False)
    parser.add_argument("--use_chart_recognition", type=parse_bool, default=False)
    parser.add_argument("--save_raw_ocr", type=parse_bool, default=False)
    return parser


def save_raw_ocr(args: argparse.Namespace, output_directory: Path) -> None:
    ocr = PaddleOCR(
        device=args.device,
        text_recognition_model_name=args.text_recognition_model_name,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    rec_texts = []
    rec_boxes = []
    for result in ocr.predict(args.input):
        data = result.json.get("res", result.json)
        rec_texts.extend(data.get("rec_texts", []))
        rec_boxes.extend(data.get("rec_boxes", []))
    with (output_directory / "raw_ocr.json").open("w", encoding="utf-8") as stream:
        json.dump(
            {"overall_ocr_res": {"rec_texts": rec_texts, "rec_boxes": rec_boxes}},
            stream,
            ensure_ascii=False,
            indent=2,
        )
    del ocr
    gc.collect()


def main() -> None:
    args = build_parser().parse_args()
    output_directory = Path(args.save_path)
    output_directory.mkdir(parents=True, exist_ok=True)

    if args.save_raw_ocr:
        save_raw_ocr(args, output_directory)

    pipeline = PPStructureV3(
        device=args.device,
        text_recognition_model_name=args.text_recognition_model_name,
        use_textline_orientation=args.use_textline_orientation,
        use_region_detection=args.use_region_detection,
        use_table_recognition=args.use_table_recognition,
        use_formula_recognition=args.use_formula_recognition,
        use_seal_recognition=args.use_seal_recognition,
    )
    results = pipeline.predict_iter(
        args.input,
        use_doc_orientation_classify=args.use_doc_orientation_classify,
        use_doc_unwarping=args.use_doc_unwarping,
        use_chart_recognition=args.use_chart_recognition,
    )
    for result in results:
        result.save_to_markdown(output_directory)
        result.save_to_json(output_directory)


if __name__ == "__main__":
    main()
