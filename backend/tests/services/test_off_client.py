import httpx
import respx
from hypothesis import given
from hypothesis import strategies as st

from app.config import settings
from app.services.off_client import OpenFoodFactsClient, _extract_macros, _infer_unit, _normalize_brand, _to_result


def test_normalize_brand_joins_a_list() -> None:
    assert _normalize_brand(["Nutella", "Ferrero"]) == "Nutella, Ferrero"


def test_normalize_brand_passes_through_a_string() -> None:
    assert _normalize_brand("Ferrero") == "Ferrero"


def test_normalize_brand_treats_empty_list_as_none() -> None:
    assert _normalize_brand([]) is None


def test_normalize_brand_treats_empty_string_as_none() -> None:
    assert _normalize_brand("") is None


def test_normalize_brand_passes_through_none() -> None:
    assert _normalize_brand(None) is None


@given(st.lists(st.text(min_size=1, max_size=20), min_size=1, max_size=5))
def test_normalize_brand_list_round_trips_through_join(brands: list[str]) -> None:
    assert _normalize_brand(brands) == ", ".join(brands)


def test_extract_macros_uses_energy_kcal_when_present() -> None:
    macros = _extract_macros({"nutriments": {"energy-kcal_100g": 539, "proteins_100g": 6.3}})
    assert macros == {"calories_per_100g": 539.0, "protein_per_100g": 6.3, "carbs_per_100g": 0.0, "fat_per_100g": 0.0}


def test_extract_macros_falls_back_to_energy_kj() -> None:
    macros = _extract_macros({"nutriments": {"energy_100g": 2252}})
    assert macros is not None
    assert macros["calories_per_100g"] == 2252 / 4.184


def test_extract_macros_returns_none_without_any_energy_field() -> None:
    assert _extract_macros({"nutriments": {"proteins_100g": 6.3}}) is None


def test_extract_macros_returns_none_without_nutriments() -> None:
    assert _extract_macros({}) is None


def test_to_result_drops_products_missing_macros() -> None:
    assert _to_result({"code": "123", "product_name": "Mystery"}) is None


def test_to_result_drops_products_missing_a_barcode() -> None:
    assert _to_result({"product_name": "Mystery", "nutriments": {"energy-kcal_100g": 100}}) is None


def test_to_result_drops_products_missing_a_name() -> None:
    assert _to_result({"code": "123", "nutriments": {"energy-kcal_100g": 100}}) is None


def test_to_result_falls_back_to_english_product_name() -> None:
    result = _to_result({"code": "123", "product_name_en": "Mystery", "nutriments": {"energy-kcal_100g": 100}})
    assert result is not None
    assert result.name == "Mystery"

    result = _to_result({"code": "123", "product_name": "Mystery"})
    assert result is None


def test_infer_unit_uses_a_mass_product_quantity_unit() -> None:
    assert _infer_unit({"product_quantity_unit": "kg"}) == ("kg", 1000.0)


def test_infer_unit_uses_a_volume_product_quantity_unit() -> None:
    assert _infer_unit({"product_quantity_unit": "l"}) == ("l", 1000.0)


def test_infer_unit_is_case_insensitive_on_product_quantity_unit() -> None:
    assert _infer_unit({"product_quantity_unit": "ML"}) == ("ml", 1.0)


def test_infer_unit_detects_a_multipack_count_in_grams() -> None:
    assert _infer_unit({"quantity": "6 x 53 g"}) == ("count", 53.0)


def test_infer_unit_detects_a_multipack_count_with_a_comma_decimal() -> None:
    assert _infer_unit({"quantity": "4 x 12,5 g"}) == ("count", 12.5)


def test_infer_unit_detects_a_multipack_count_in_kilograms() -> None:
    assert _infer_unit({"quantity": "2 x 1 kg"}) == ("count", 1000.0)


def test_infer_unit_falls_back_to_grams_with_no_usable_signal() -> None:
    assert _infer_unit({}) == ("g", 1.0)


def test_infer_unit_falls_back_to_grams_for_an_unrecognized_quantity_unit() -> None:
    assert _infer_unit({"product_quantity_unit": "piece", "quantity": "one piece"}) == ("g", 1.0)


def test_to_result_happy_path() -> None:
    result = _to_result(
        {
            "code": "3017620422003",
            "product_name": "Nutella",
            "brands": "Ferrero",
            "product_quantity_unit": "g",
            "nutriments": {
                "energy-kcal_100g": 539,
                "proteins_100g": 6.3,
                "carbohydrates_100g": 57.5,
                "fat_100g": 30.9,
            },
        }
    )
    assert result is not None
    assert result.barcode == "3017620422003"
    assert result.name == "Nutella"
    assert result.brand == "Ferrero"
    assert result.calories_per_100g == 539.0
    assert result.suggested_unit == "g"
    assert result.unit_to_grams == 1.0


async def test_search_filters_out_products_with_no_usable_macros() -> None:
    client = OpenFoodFactsClient()
    with respx.mock(base_url=settings.OFF_SEARCH_BASE_URL) as mock:
        mock.get("/search").mock(
            return_value=httpx.Response(
                200,
                json={
                    "hits": [
                        {
                            "code": "1",
                            "product_name": "Good",
                            "nutriments": {"energy-kcal_100g": 100},
                        },
                        {"code": "2", "product_name": "No macros"},
                    ]
                },
            )
        )
        results = await client.search("nutella")
    assert len(results) == 1
    assert results[0].name == "Good"


async def test_search_sends_the_configured_user_agent() -> None:
    client = OpenFoodFactsClient()
    with respx.mock(base_url=settings.OFF_SEARCH_BASE_URL) as mock:
        route = mock.get("/search").mock(return_value=httpx.Response(200, json={"hits": []}))
        await client.search("nutella")
    assert route.calls.last.request.headers["User-Agent"] == settings.OFF_USER_AGENT


async def test_get_by_barcode_returns_none_on_404() -> None:
    client = OpenFoodFactsClient()
    with respx.mock(base_url=settings.OFF_BASE_URL) as mock:
        mock.get("/api/v2/product/000.json").mock(return_value=httpx.Response(404))
        result = await client.get_by_barcode("000")
    assert result is None


async def test_get_by_barcode_returns_none_when_status_is_not_1() -> None:
    client = OpenFoodFactsClient()
    with respx.mock(base_url=settings.OFF_BASE_URL) as mock:
        mock.get("/api/v2/product/000.json").mock(return_value=httpx.Response(200, json={"status": 0}))
        result = await client.get_by_barcode("000")
    assert result is None


async def test_get_by_barcode_happy_path() -> None:
    client = OpenFoodFactsClient()
    with respx.mock(base_url=settings.OFF_BASE_URL) as mock:
        mock.get("/api/v2/product/3017620422003.json").mock(
            return_value=httpx.Response(
                200,
                json={
                    "status": 1,
                    "product": {
                        "code": "3017620422003",
                        "product_name": "Nutella",
                        "nutriments": {"energy-kcal_100g": 539},
                    },
                },
            )
        )
        result = await client.get_by_barcode("3017620422003")
    assert result is not None
    assert result.name == "Nutella"
