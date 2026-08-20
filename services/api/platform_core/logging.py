"""Structured logging primitives shared by the API and future log shippers."""

import json
import logging
from datetime import UTC, datetime


class JsonLogFormatter(logging.Formatter):
    """Render API events as one JSON object per line for easy cloud ingestion."""

    def format(self, record):
        payload = {
            "timestamp": datetime.now(UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "event": getattr(record, "event", record.getMessage()),
            "message": record.getMessage(),
        }
        for attribute in (
            "trace_id",
            "method",
            "path",
            "route",
            "status_code",
            "duration_ms",
            "client_ip",
            "user_id",
            "response_bytes",
        ):
            value = getattr(record, attribute, None)
            if value is not None:
                payload[attribute] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)
