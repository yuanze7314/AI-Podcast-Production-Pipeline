# 豆包 TTS API 规范

## 1. 接口概述

- **端点**: `wss://openspeech.bytedance.com/api/v3/sami/podcasttts`
- **协议**: WebSocket 二进制协议
- **鉴权方式**: Request Headers

## 2. 鉴权 Headers

| Header | 说明 | 必需 | 示例 |
|--------|------|------|------|
| X-Api-App-Id | APP ID (火山控制台获取) | 是 | your-app-id |
| X-Api-Access-Key | Access Token (火山控制台获取) | 是 | your-access-key |
| X-Api-Resource-Id | 服务资源ID | 是 | volc.service_type.10050 |
| X-Api-App-Key | 固定值 | 是 | aGjiRDfUWi |
| X-Api-Request-Id | 客户端请求ID (UUID) | 否 | uuid随机字符串 |

## 3. action 类型

| action | 说明 | 使用场景 |
|--------|------|----------|
| 0 | 根据输入文本总结生成播客 | 长文本模式 |
| 3 | 根据对话文本直接生成播客 | **我们使用** (双人对话模式) |
| 4 | 根据prompt扩展生成播客 | 简短prompt模式 |

## 4. action=3 请求参数

```json
{
  "input_id": "test_podcast",
  "action": 3,
  "use_head_music": false,
  "use_tail_music": false,
  "audio_config": {
    "format": "mp3",
    "sample_rate": 24000,
    "speech_rate": 0
  },
  "nlp_texts": [
    {
      "speaker": "zh_male_dayixiansheng_v2_saturn_bigtts",
      "text": "今天我们要聊的是..."
    },
    {
      "speaker": "zh_female_mizaitongxue_v2_saturn_bigtts",
      "text": "很有意思的话题呢。"
    }
  ]
}
```

## 5. 音色列表

推荐配对使用：

| 系列 | 发音人ID |
|------|----------|
| 黑猫侦探社咪仔 | `zh_female_mizaitongxue_v2_saturn_bigtts` |
| 大衣先生 | `zh_male_dayixiansheng_v2_saturn_bigtts` |
| 刘飞 | `zh_male_liufei_v2_saturn_bigtts` |
| 潇磊 | `zh_male_xiaolei_v2_saturn_bigtts` |

## 6. 事件定义

### 下行事件 (服务端 -> 客户端)

| Event Code | 说明 | Payload |
|------------|------|---------|
| 150 | SessionStarted | {} |
| 360 | PodcastRoundStart | {"speaker": "", "round_id": -1, "text": ""} |
| 361 | PodcastRoundResponse | **二进制音频数据** |
| 362 | PodcastRoundEnd | {"audio_duration": 8.419333} |
| 363 | PodcastEnd | {"meta_info": {"audio_url": "..."}} |
| 154 | UsageResponse | {"usage":{"input_text_tokens":980,"output_audio_tokens":0}} |

### 上行事件 (客户端 -> 服务端)

| Event Code | 说明 |
|------------|------|
| 2 | FinishConnection |

## 7. 错误码

| Code | Message | 说明 |
|------|---------|------|
| 20000000 | ok | 成功 |
| 45000000 | quota exceeded | 并发限流 |
| 55000000 | server error | 服务端通用错误 |
| 50700000 | content filter | 触发安全审核过滤 |

## 8. voice_map.json 配置示例

```json
{
  "speakers": {
    "Alice": {
      "voice_id": "zh_female_mizaitongxue_v2_saturn_bigtts",
      "name": "咪仔同学"
    },
    "Dr_Ye": {
      "voice_id": "zh_male_dayixiansheng_v2_saturn_bigtts",
      "name": "大衣先生"
    }
  },
  "audio_config": {
    "format": "mp3",
    "sample_rate": 24000,
    "speech_rate": 0
  },
  "settings": {
    "use_head_music": false,
    "use_tail_music": false,
    "random_order": false
  }
}
```

## 9. 协议帧结构

### 请求帧 (StartSession)

```
Byte 0:  [0001 0001] - v1, 4-byte header
Byte 1:  [1001 0100] - Full-client request with event number
Byte 2:  [0001 0000] - JSON, no compression
Byte 3:  [0000 0000] - Reserved
Byte 4-7: Event type (uint32)
Byte 8-11: session_id length (uint32)
Byte 12-23: session_id (12 bytes)
Byte 24-27: payload length (uint32)
Byte 28+: payload (JSON)
```

## 10. 使用流程

1. 建立 WebSocket 连接
2. 发送 StartSession (action=3 + nlp_texts)
3. 循环接收 PodcastRoundResponse 音频帧，拼接成完整音频
4. 接收 PodcastRoundEnd 结束当前轮次
5. 接收 PodcastEnd 获取完整音频下载链接 (可选)
6. 发送 FinishConnection 关闭连接
