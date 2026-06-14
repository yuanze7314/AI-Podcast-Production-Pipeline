from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_api_key: str | None = None
    deepseek_model: str = "deepseek-v4-pro"
    deepseek_temperature: float = 0.7
    deepseek_max_tokens: int = 5048

    volcengine_tts_provider: str = "volcengine_doubao"
    volcengine_tts_interface: str = "podcast_tts_websocket"
    volcengine_tts_endpoint: str = "wss://openspeech.bytedance.com/api/v3/sami/podcasttts"
    volcengine_app_id: str | None = None
    volcengine_access_token: str | None = None
    volcengine_app_key: str | None = None
    volcengine_resource_id: str = "volc.service_type.10050"
    volcengine_tts_action: int = 3
    volcengine_tts_encoding: str = "mp3"
    volcengine_tts_sample_rate: int = 24000
    volcengine_tts_speech_rate: int = 0

    voice_alice: str = "zh_female_mizaitongxue_v2_saturn_bigtts"
    voice_dr_ye: str = "zh_male_dayixiansheng_v2_saturn_bigtts"

    ocr_provider: str = "pymupdf"
    ocr_language: str = "chi_sim+eng"
    ocr_dpi: int = 200
    ocr_tessdata: str | None = None

    app_storage_dir: str = "storage"
    app_database_url: str = "sqlite:///storage/app.db"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
