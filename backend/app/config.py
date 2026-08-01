from dotenv import load_dotenv
from isik.common.config import boolean, comma_separated_list, config, string


load_dotenv()

settings = config(
    {
        "SECRET_KEY": string(),
        "REGISTRATION_ENABLED": boolean(missing_default=False),
        "DATABASE_PATH": string(missing_default="./data/brennkonto.sqlite3"),
        "SESSION_COOKIE_SECURE": boolean(missing_default=True),
        "CORS_ALLOW_ORIGINS": comma_separated_list(missing_default=[]),
        "OFF_USER_AGENT": string(missing_default="Brennkonto/0.1 (github.com/isik-kaplan/brennkonto)"),
        "OFF_BASE_URL": string(missing_default="https://world.openfoodfacts.org"),
        "OFF_SEARCH_BASE_URL": string(missing_default="https://search.openfoodfacts.org"),
    }
)
