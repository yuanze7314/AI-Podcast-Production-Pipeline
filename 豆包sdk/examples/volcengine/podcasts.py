# -*- coding: utf-8 -*-
import argparse
import asyncio
import json
import logging
import os
import sys
import time
import uuid

import websockets

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from protocols import (
    EventType,
    MsgType,
    finish_connection,
    finish_session,
    receive_message,
    start_connection,
    start_session,
    wait_for_event,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PodcastTTS")

ENDPOINT = "wss://openspeech.bytedance.com/api/v3/sami/podcasttts"


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--appid", required=True, default="", help="APP ID")
    parser.add_argument("--access_token", required=True, default="", help="Access Key")
    parser.add_argument("--text", default="", help="Input text Use when action in [0]")
    parser.add_argument("--input_url", default="", help="Web url or file url Use when action in [0]")
    parser.add_argument("--prompt_text", default="", help="Input Prompt Text must not empty when action in [4]")
    parser.add_argument("--nlp_texts", default="", help="Input NLP Texts must not empty when action in [3]")
    parser.add_argument("--resource_id", default="volc.service_type.10050", help="Audio Resource ID")
    parser.add_argument("--encoding", default="mp3", choices=["mp3", "wav"], help="Audio format")
    parser.add_argument("--input_id", default="test_podcast", help="Unique input identifier")
    parser.add_argument("--speaker_info", default="{\"random_order\":false}", help="Podcast Speaker Info")
    parser.add_argument("--use_head_music", default=True, action="store_true", help="Enable head music")
    parser.add_argument("--use_tail_music", action="store_true", help="Enable tail music")
    parser.add_argument("--only_nlp_text", default=False, action="store_true",
                        help="Enable only podcast text when action in [0, 4]")
    parser.add_argument("--return_audio_url", default=False, action="store_true",
                        help="Enable return audio url that can download")
    parser.add_argument("--action", default=0, type=int, choices=[0, 3, 4], help="different podcast type")
    parser.add_argument("--endpoint", default=ENDPOINT, help="WebSocket endpoint URL")
    parser.add_argument("--skip_round_audio_save", default=False, action="store_true", help="skip round audio save")

    args = parser.parse_args()

    if args.appid == "" or args.access_token == "":
        logger.error("APP ID or Access Key or Text is required")
        return
    headers = {
        "X-Api-App-Id": args.appid,
        "X-Api-App-Key": "aGjiRDfUWi",
        "X-Api-Access-Key": args.access_token,
        "X-Api-Resource-Id": args.resource_id,
        "X-Api-Connect-Id": str(uuid.uuid4()),
    }

    is_podcast_round_end = True  # 标志当前轮是否结束
    audio_received = False  # 标志是否收到音频数据
    last_round_id = -1  # 上一轮的轮次ID
    task_id = ""  # 任务ID
    websocket = None  # websocket连接
    retry_num = 5  # 重试次数
    podcast_audio = bytearray()  # 整个播客的音频数据
    audio = bytearray()  # 当前轮的音频数据
    voice = ""  # 当前轮的说话人
    current_round = 0  # 当前轮次ID
    podcast_texts = []  # 整个播客的文本数据
    try:
        while retry_num > 0:
            # 建立WebSocket连接	client<----------->server
            websocket = await websockets.connect(
                ENDPOINT,
                additional_headers=headers
            )
            # 打印 header
            print(websocket.response.headers)
            req_params = {
                "input_id": args.input_id,
                "input_text": args.text,
                "nlp_texts": json.loads(args.nlp_texts) if args.nlp_texts else None,
                "prompt_text": args.prompt_text,
                "action": args.action,
                "use_head_music": args.use_head_music,
                "use_tail_music": args.use_tail_music,
                "input_info": {
                    "input_url": args.input_url,
                    "return_audio_url": args.return_audio_url,
                    "only_nlp_text": args.only_nlp_text,
                },
                "speaker_info": json.loads(args.speaker_info) if args.speaker_info else None,
                "audio_config": {
                    "format": args.encoding,
                    "sample_rate": 24000,
                    "speech_rate": 0
                }
            }
            if not is_podcast_round_end:
                req_params["retry_info"] = {
                    "retry_task_id": task_id,
                    "last_finished_round_id": last_round_id
                }
            # Start connection [event=1] -----------> server
            await start_connection(websocket)
            # Connection started [event=50] <---------- server
            await wait_for_event(
                websocket,
                MsgType.FullServerResponse,
                EventType.ConnectionStarted
            )
            session_id = str(uuid.uuid4())
            if not task_id:
                task_id = session_id
            # Start session [event=100] -----------> server
            await start_session(
                websocket,
                json.dumps(req_params).encode(),
                session_id
            )
            # Session started [event=150] <---------- server
            await wait_for_event(
                websocket,
                MsgType.FullServerResponse,
                EventType.SessionStarted
            )
            # Finish session [event=102] -----------> server
            await finish_session(websocket, session_id)
            while True:
                # 接收响应内容
                msg = await receive_message(websocket)
                # 音频数据块

                if msg.type == MsgType.AudioOnlyServer and msg.event == EventType.PodcastRoundResponse:
                    if not audio_received and audio:
                        audio_received = True
                    audio.extend(msg.payload)
                    logger.info(f"Audio received: {len(msg.payload)}")
                # 错误信息
                elif msg.type == MsgType.Error:
                    raise RuntimeError(f"Server error: {msg.payload.decode()}")
                elif msg.type == MsgType.FullServerResponse:
                    # 播客 round 开始
                    if msg.event == EventType.PodcastRoundStart:
                        data = json.loads(msg.payload.decode().encode("utf-8"))
                        # 保存下必要的文本信息
                        if data.get("text"):
                            filtered_payload = {"text": data.get("text"), "speaker": data.get("speaker")}
                            podcast_texts.append(filtered_payload)
                        voice = data.get("speaker")
                        current_round = data.get("round_id")
                        if current_round == -1:
                            voice = "head_music"
                        if current_round == 9999:
                            voice = "tail_music"
                        is_podcast_round_end = False
                        logger.info(f"New round started: {data}")
                    # 播客 round 结束
                    if msg.event == EventType.PodcastRoundEnd:
                        data = json.loads(msg.payload.decode().encode("utf-8"))
                        logger.info(f"Podcast round end: {data}")
                        # 报错了
                        if data.get("is_error"):
                            break
                        is_podcast_round_end = True
                        last_round_id = current_round
                        if audio:
                            # 创建文件夹 output/
                            os.makedirs("output", exist_ok=True)
                            filename = f'output/{voice}_{current_round}.{args.encoding}'
                            if not args.skip_round_audio_save:
                                with open(filename, "wb") as f:
                                    f.write(audio)
                            podcast_audio.extend(audio)
                            logger.info(f"Saved partial audio: {filename}")
                            audio.clear()
                    # 播客结束
                    if msg.event == EventType.PodcastEnd:
                        data = json.loads(msg.payload.decode().encode("utf-8"))
                        logger.info(f"Podcast end: {data}")
                # 会话结束
                if msg.event == EventType.SessionFinished:
                    break
            if not audio_received and not args.only_nlp_text:
                raise RuntimeError("No audio data received")
            # 保持连接，方便下次请求
            await finish_connection(websocket)
            await wait_for_event(
                websocket,
                MsgType.FullServerResponse,
                EventType.ConnectionFinished
            )
            # 播客结束, 保存最终音频文件
            if is_podcast_round_end:
                # 创建文件夹 output/
                os.makedirs("output", exist_ok=True)
                if podcast_audio:
                    filename = f'output/podcast_final_{time.time()}.{args.encoding}'
                    with open(filename, "wb") as f:
                        f.write(podcast_audio)
                    logger.info(f"Final audio saved: {filename}")
                if args.only_nlp_text and podcast_texts:
                    # podcast_texts 保存为json文件
                    filename = f'output/podcast_texts.json'
                    with open(filename, "w") as f:
                        json.dump(podcast_texts, f, ensure_ascii=False, indent=4)
                    logger.info(f"Final text saved: {filename}")
                break
            else:
                logger.error(f"Current podcast not finished, resuming from round {last_round_id}")
                retry_num -= 1
                await asyncio.sleep(1)
                if websocket:
                    await websocket.close()
    finally:
        if websocket:
            await websocket.close()


if __name__ == "__main__":
    asyncio.run(main())
