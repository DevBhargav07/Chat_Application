from pathlib import Path
from typing import Optional
from pydantic_settings import SettingsConfigDict, BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    cors_origins: str = "http://localhost:5173"
    redis_url: Optional[str] = None

    model_config = SettingsConfigDict(
                    env_file=BASE_DIR / ".env",
                    env_file_encoding="utf-8",
                    extra="ignore")

settings = Settings()