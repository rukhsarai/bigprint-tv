"""Unit tests for the pure parts of the pipeline. Run: python -m unittest discover backend/tests"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pipeline import (  # noqa: E402
    _clean_value, _is_speakable, _parse_date, _parse_json, numeric_guard,
    structure_blocks, values_agree,
)
from speech import byte_to_char_offsets  # noqa: E402


def _word(id_, text):
    return {"Id": id_, "BlockType": "WORD", "Text": text}


def _line(id_, text, words, conf=95.0):
    return {"Id": id_, "BlockType": "LINE", "Text": text, "Confidence": conf,
            "Relationships": [{"Type": "CHILD", "Ids": words}]}


class StructureBlocksTest(unittest.TestCase):
    def test_table_rows_are_rebuilt_in_reading_order(self):
        blocks = [
            {"Id": "L0", "BlockType": "LAYOUT_TITLE", "Relationships": [{"Type": "CHILD", "Ids": ["l1"]}]},
            {"Id": "L1", "BlockType": "LAYOUT_TABLE", "Relationships": [{"Type": "CHILD", "Ids": ["l2", "l3", "l4", "l5"]}]},
            {"Id": "L2", "BlockType": "LAYOUT_TEXT", "Relationships": [{"Type": "CHILD", "Ids": ["l6"]}]},
            _line("l1", "Your bill", ["w1", "w2"]),
            # Textract gives one LINE per cell:
            _line("l2", "Electricity", ["w3"]),
            _line("l3", "£76.44", ["w4"]),
            _line("l4", "Standing charge", ["w5", "w6"]),
            _line("l5", "£16.14", ["w7"]),
            _line("l6", "Pay by 28 October", ["w8", "w9", "w10", "w11"]),
            _word("w1", "Your"), _word("w2", "bill"), _word("w3", "Electricity"), _word("w4", "£76.44"),
            _word("w5", "Standing"), _word("w6", "charge"), _word("w7", "£16.14"),
            _word("w8", "Pay"), _word("w9", "by"), _word("w10", "28"), _word("w11", "October"),
            {"Id": "T", "BlockType": "TABLE", "Relationships": [{"Type": "CHILD", "Ids": ["c1", "c2", "c3", "c4"]}]},
            {"Id": "c1", "BlockType": "CELL", "RowIndex": 1, "ColumnIndex": 1, "Relationships": [{"Type": "CHILD", "Ids": ["w3"]}]},
            {"Id": "c2", "BlockType": "CELL", "RowIndex": 1, "ColumnIndex": 2, "Relationships": [{"Type": "CHILD", "Ids": ["w4"]}]},
            {"Id": "c3", "BlockType": "CELL", "RowIndex": 2, "ColumnIndex": 1, "Relationships": [{"Type": "CHILD", "Ids": ["w5", "w6"]}]},
            {"Id": "c4", "BlockType": "CELL", "RowIndex": 2, "ColumnIndex": 2, "Relationships": [{"Type": "CHILD", "Ids": ["w7"]}]},
        ]
        texts, raw, conf = structure_blocks(blocks)
        self.assertEqual(texts, [
            "Your bill",
            "[Table]",
            "Electricity | £76.44",
            "Standing charge | £16.14",
            "[End of table]",
            "Pay by 28 October",
        ])
        self.assertEqual(len(raw), 6)
        self.assertEqual(conf, 95.0)

    def test_detect_document_text_output_still_works(self):
        blocks = [_line("l1", "Hello there", ["w1", "w2"], 90.0), _line("l2", "Total 12", ["w3", "w4"], 80.0),
                  _word("w1", "Hello"), _word("w2", "there"), _word("w3", "Total"), _word("w4", "12")]
        texts, raw, conf = structure_blocks(blocks)
        self.assertEqual(texts, ["Hello there", "Total 12"])
        self.assertEqual(conf, 85.0)

    def test_empty(self):
        self.assertEqual(structure_blocks([]), ([], [], 0.0))


class NumericGuardTest(unittest.TestCase):
    OCR = ["Amount due £84.60", "Pay by 28/10/2026", "Call 0800 048 7811", "Units 1,234.56 kWh"]

    def test_keeps_lines_whose_numbers_exist(self):
        lines = ["The amount due is 84.60 pounds.", "Please pay by 28 October 2026.",
                 "Call 08000487811 for help.", "You used 1234.56 units."]
        self.assertEqual(numeric_guard(lines, self.OCR), lines)

    def test_drops_invented_or_recalculated_numbers(self):
        lines = ["The amount due is 84.60 pounds.", "That is 92.58 before discount.", "Pay by 29 October 2026."]
        self.assertEqual(numeric_guard(lines, self.OCR), ["The amount due is 84.60 pounds."])

    def test_lines_without_numbers_pass(self):
        self.assertEqual(numeric_guard(["Thank you for being a customer."], self.OCR),
                         ["Thank you for being a customer."])


class ValuesAgreeTest(unittest.TestCase):
    def test_money(self):
        self.assertTrue(values_agree("84.60", "£84.60", "money"))
        self.assertTrue(values_agree("1,234.50", "1234.5", "money"))
        self.assertFalse(values_agree("84.60", "£48.60", "money"))

    def test_dates(self):
        self.assertTrue(values_agree("28/10/2026", "28 October 2026", "date"))
        self.assertTrue(values_agree("28th October 2026", "2026-10-28", "date"))
        self.assertTrue(values_agree("Oct 28, 2026", "28/10/26", "date"))
        self.assertFalse(values_agree("28/10/2026", "29/10/2026", "date"))

    def test_digits(self):
        self.assertTrue(values_agree("4471 0392 11", "447103 9211", "digits"))
        self.assertFalse(values_agree("4471 0392 11", "4471 0392 12", "digits"))
        self.assertTrue(values_agree("ABC", "abc", "digits"))  # nothing numeric to dispute

    def test_parse_date_rejects_non_dates(self):
        self.assertIsNone(_parse_date("hello"))
        self.assertEqual(_parse_date("20-11-25"), (20, 11, 2025))


class HelpersTest(unittest.TestCase):
    def test_clean_value_strips_bleeding_label(self):
        self.assertEqual(_clean_value("20-11-25 Date:"), "20-11-25")
        self.assertEqual(_clean_value("  £84.60 "), "£84.60")

    def test_speakable(self):
        self.assertTrue(_is_speakable("The amount due is 84.60 pounds."))
        self.assertFalse(_is_speakable("3.75"))
        self.assertFalse(_is_speakable("[Table]"))
        self.assertFalse(_is_speakable("ab"))

    def test_parse_json_with_fence_and_noise(self):
        self.assertEqual(_parse_json('```json\n{"a": 1}\n```'), {"a": 1})
        self.assertEqual(_parse_json('Sure: {"a": 1} ok'), {"a": 1})
        self.assertIsNone(_parse_json("[1, 2]"))
        self.assertIsNone(_parse_json(""))


class SpeechMarksTest(unittest.TestCase):
    def test_byte_offsets_become_char_offsets(self):
        text = "Pay £84.60 now"
        encoded = text.encode("utf-8")
        marks = [
            {"time": 0, "type": "word", "start": 0, "end": 3, "value": "Pay"},
            {"time": 200, "type": "word", "start": 4, "end": encoded.index(b" now"), "value": "£84.60"},
            {"time": 900, "type": "word", "start": encoded.index(b"now"), "end": len(encoded), "value": "now"},
        ]
        out = byte_to_char_offsets(text, marks)
        self.assertEqual([m["value"] for m in out], ["Pay", "£84.60", "now"])
        for m in out:
            self.assertEqual(text[m["start"]:m["end"]], m["value"])


if __name__ == "__main__":
    unittest.main()
