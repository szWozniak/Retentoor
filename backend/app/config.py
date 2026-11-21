from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "HackNation 2026"
    database_url: str = "sqlite:///./data/app.db"
    upload_dir: str = "./data/uploads"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Optional paid Open-Meteo key: limits per key instead of per IP; uses the customer-* API hosts.
    openmeteo_api_key: str | None = None


settings = Settings()
