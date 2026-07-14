"""Server-Sent Events frame formatting. One JSON object per frame; json.dumps escapes embedded
newlines so a frame can never be split. Frame types: token | trace | done | error."""

import json


def frame(type_: str, **payload: object) -> str:
    return f"data: {json.dumps({'type': type_, **payload}, separators=(',', ':'))}\n\n"
