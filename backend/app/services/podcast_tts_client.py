from __future__ import annotations

import json
import base64
import asyncio
import struct
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import websockets

from app.core.config import settings


Speaker = Literal["Alice", "Dr_Ye"]


@dataclass(frozen=True)
class ScriptBlock:
    speaker: Speaker
    text: str


class PodcastTTSPackager:
    """Convert internal script blocks into Volcengine/Doubao action=3 payloads."""

    def __init__(self) -> None:
        self.voice_map = {
            "Alice": settings.voice_alice,
            "Dr_Ye": settings.voice_dr_ye,
        }

    def build_payload(self, input_id: str, blocks: list[ScriptBlock]) -> dict:
        if not blocks:
            raise ValueError("At least one script block is required")

        return {
            "input_id": input_id,
            "action": settings.volcengine_tts_action,
            "use_head_music": False,
            "use_tail_music": False,
            "audio_config": {
                "format": settings.volcengine_tts_encoding,
                "sample_rate": settings.volcengine_tts_sample_rate,
                "speech_rate": settings.volcengine_tts_speech_rate,
            },
            "input_info": {
                "only_nlp_text": False,
                "return_audio_url": True,
            },
            "nlp_texts": [
                {"speaker": self.voice_map[block.speaker], "text": block.text}
                for block in blocks
            ],
            "speaker_info": {
                "random_order": False,
                "speakers": [self.voice_map["Alice"], self.voice_map["Dr_Ye"]],
            },
        }


@dataclass(frozen=True)
class PodcastTTSEvent:
    event_code: int | None
    event_name: str
    payload: dict | None = None
    audio: bytes | None = None


@dataclass(frozen=True)
class PodcastTTSResult:
    output_path: str
    rounds_finished: int
    last_finished_round_id: str | None
    events: list[PodcastTTSEvent]


class PodcastTTSClient:
    """Minimal Volcengine/Doubao Podcast TTS WebSocket client.

    The public docs describe an event-driven binary WebSocket protocol. This
    client keeps the framing isolated so payload packaging and API code stay
    stable if the provider adjusts wire-level details.
    """

    CLIENT_FINISH_CONNECTION = 2
    CLIENT_START_SESSION = 100

    SERVER_CONNECTION_FINISHED = 52
    SERVER_SESSION_STARTED = 150
    SERVER_SESSION_FINISHED = 152
    SERVER_USAGE_RESPONSE = 154
    SERVER_PODCAST_ROUND_START = 360
    SERVER_PODCAST_ROUND_RESPONSE = 361
    SERVER_PODCAST_ROUND_END = 362
    SERVER_PODCAST_END = 363

    EVENT_NAMES = {
        CLIENT_FINISH_CONNECTION: "FinishConnection",
        CLIENT_START_SESSION: "StartSession",
        SERVER_CONNECTION_FINISHED: "ConnectionFinished",
        SERVER_SESSION_STARTED: "SessionStarted",
        SERVER_SESSION_FINISHED: "SessionFinished",
        SERVER_USAGE_RESPONSE: "UsageResponse",
        SERVER_PODCAST_ROUND_START: "PodcastRoundStart",
        SERVER_PODCAST_ROUND_RESPONSE: "PodcastRoundResponse",
        SERVER_PODCAST_ROUND_END: "PodcastRoundEnd",
        SERVER_PODCAST_END: "PodcastEnd",
    }

    def __init__(self) -> None:
        missing = []
        if not settings.volcengine_app_id:
            missing.append("VOLCENGINE_APP_ID")
        if not settings.volcengine_access_token:
            missing.append("VOLCENGINE_ACCESS_TOKEN")
        if not settings.volcengine_app_key:
            missing.append("VOLCENGINE_APP_KEY")
        if missing:
            raise RuntimeError(f"Missing TTS config: {', '.join(missing)}")

    async def synthesize(
        self,
        payload: dict,
        output_path: Path,
        on_event=None,
        receive_timeout_seconds: int = 90,
    ) -> PodcastTTSResult:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        events: list[PodcastTTSEvent] = []
        audio_chunks: list[bytes] = []
        rounds_finished = 0
        last_finished_round_id: str | None = None

        async def record(event: PodcastTTSEvent) -> None:
            events.append(event)
            if on_event:
                on_event(self.event_to_dict(event))

        headers = self._headers()
        session_id = payload.get("input_id") or str(uuid.uuid4())

        async with websockets.connect(
            settings.volcengine_tts_endpoint,
            additional_headers=headers,
            max_size=None,
        ) as websocket:
            await websocket.send(self._encode_start_session(session_id, payload))
            await record(
                PodcastTTSEvent(
                    self.CLIENT_START_SESSION,
                    "StartSession",
                    {"session_id": session_id, "input_id": payload.get("input_id")},
                )
            )

            session_event = self._decode_event(
                await asyncio.wait_for(
                    websocket.recv(), timeout=receive_timeout_seconds
                )
            )
            await record(session_event)
            if session_event.event_code != self.SERVER_SESSION_STARTED:
                raise RuntimeError(
                    f"Unexpected event after StartSession: {session_event.event_name}"
                )

            while True:
                event = self._decode_event(
                    await asyncio.wait_for(
                        websocket.recv(), timeout=receive_timeout_seconds
                    )
                )
                await record(event)

                if event.event_code == self.SERVER_PODCAST_ROUND_RESPONSE and event.audio:
                    audio_chunks.append(event.audio)
                elif event.event_code == self.SERVER_PODCAST_ROUND_END:
                    rounds_finished += 1
                    if event.payload:
                        last_finished_round_id = str(
                            event.payload.get("round_id")
                            or event.payload.get("id")
                            or rounds_finished
                        )
                elif event.event_code == self.SERVER_PODCAST_END:
                    break
                elif event.event_code == self.SERVER_SESSION_FINISHED:
                    if rounds_finished >= len(payload.get("nlp_texts", [])):
                        break

            await websocket.send(self._encode_finish_connection())
            await record(
                PodcastTTSEvent(self.CLIENT_FINISH_CONNECTION, "FinishConnection")
            )

        if not audio_chunks:
            raise RuntimeError("TTS completed without audio chunks")

        output_path.write_bytes(b"".join(audio_chunks))
        return PodcastTTSResult(
            output_path=str(output_path),
            rounds_finished=rounds_finished,
            last_finished_round_id=last_finished_round_id,
            events=events,
        )

    def _headers(self) -> dict[str, str]:
        return {
            "X-Api-App-ID": str(settings.volcengine_app_id),
            "X-Api-App-Key": str(settings.volcengine_app_key),
            "X-Api-Access-Key": str(settings.volcengine_access_token),
            "X-Api-Resource-Id": settings.volcengine_resource_id,
            "X-Api-Request-Id": str(uuid.uuid4()),
        }

    def _encode_start_session(self, session_id: str, payload: dict) -> bytes:
        session_bytes = session_id.encode("utf-8")
        payload_bytes = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        header = bytes([0x11, 0x14, 0x10, 0x00])
        return (
            header
            + struct.pack(">I", self.CLIENT_START_SESSION)
            + struct.pack(">I", len(session_bytes))
            + session_bytes
            + struct.pack(">I", len(payload_bytes))
            + payload_bytes
        )

    def _encode_finish_connection(self) -> bytes:
        header = bytes([0x11, 0x14, 0x10, 0x00])
        return header + struct.pack(">II", self.CLIENT_FINISH_CONNECTION, 0)

    def _decode_event(self, message: bytes | str) -> PodcastTTSEvent:
        if isinstance(message, str):
            return self._event_from_json(message)
        if len(message) < 4:
            return PodcastTTSEvent(None, "UnknownBinary", audio=message)

        message_type = message[1] >> 4
        header_size = (message[0] & 0x0F) * 4
        cursor = header_size

        if message_type == 0x0F:
            error_code = None
            if len(message) >= cursor + 4:
                error_code = struct.unpack(">I", message[cursor : cursor + 4])[0]
                cursor += 4
            error_payload = self._read_sized_payload(message, cursor)
            payload = self._try_json(error_payload) or {
                "error": error_payload.decode("utf-8", errors="replace")
            }
            if error_code is not None:
                payload["error_code"] = error_code
            return PodcastTTSEvent(None, "ErrorResponse", payload=payload)

        event_code: int | None = None
        if len(message) >= cursor + 4:
            event_code = struct.unpack(">I", message[cursor : cursor + 4])[0]
            cursor += 4

        session_id = None
        if len(message) >= cursor + 4:
            session_len = struct.unpack(">I", message[cursor : cursor + 4])[0]
            cursor += 4
            if session_len <= len(message) - cursor:
                session_id = message[cursor : cursor + session_len].decode(
                    "utf-8", errors="replace"
                )
                cursor += session_len

        raw_payload = self._read_sized_payload(message, cursor)

        payload = self._try_json(raw_payload)
        if payload is not None and session_id is not None:
            payload.setdefault("session_id", session_id)

        if event_code == self.SERVER_PODCAST_ROUND_RESPONSE and payload is None:
            return PodcastTTSEvent(
                event_code,
                self.EVENT_NAMES[event_code],
                audio=raw_payload,
            )

        return PodcastTTSEvent(
            event_code,
            self.EVENT_NAMES.get(event_code, "UnknownBinary"),
            payload=payload,
            audio=None if payload is not None else raw_payload,
        )

    def _read_sized_payload(self, message: bytes, cursor: int) -> bytes:
        if len(message) >= cursor + 4:
            payload_size = struct.unpack(">I", message[cursor : cursor + 4])[0]
            cursor += 4
            if payload_size <= len(message) - cursor:
                return message[cursor : cursor + payload_size]
        return message[cursor:]

    def _event_from_json(self, message: str) -> PodcastTTSEvent:
        payload = json.loads(message)
        event_code = payload.get("event") or payload.get("event_code")
        return PodcastTTSEvent(
            int(event_code) if event_code is not None else None,
            self.EVENT_NAMES.get(int(event_code), "JsonMessage")
            if event_code is not None
            else "JsonMessage",
            payload=payload,
        )

    def _try_json(self, raw_payload: bytes) -> dict | None:
        if not raw_payload:
            return None
        try:
            decoded = raw_payload.decode("utf-8")
            return json.loads(decoded)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def event_to_dict(self, event: PodcastTTSEvent) -> dict:
        data = {
            "event_code": event.event_code,
            "event_name": event.event_name,
            "payload": event.payload,
        }
        if event.audio is not None:
            data["audio_bytes"] = len(event.audio)
            if event.event_code is None and len(event.audio) <= 512:
                data["raw_base64"] = base64.b64encode(event.audio).decode("ascii")
        return data
