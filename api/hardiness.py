"""USDA-ARS Plant Hardiness Zone lookup.

The service endpoint is the USDA-ARS PHZM image service at
https://pdi.scinet.usda.gov/image/rest/services/PHZM_Recolor/ImageServer/identify.
"""

import re

import httpx


ARCGIS_IDENTIFY_URL = "https://pdi.scinet.usda.gov/image/rest/services/PHZM_Recolor/ImageServer/identify"
_ZONE_PATTERN = re.compile(r"^(?:1[0-3]|[1-9])\s*[ab]$", re.IGNORECASE)


def _first_value(attributes: dict, names: tuple[str, ...]):
    for name in names:
        value = attributes.get(name)
        if value is not None and value != "":
            return value
    return None


def _parse_zone_response(data: dict) -> dict | None:
    results = data.get("results") or []
    attributes = results[0].get("attributes", {}) if results else {}
    zone = _first_value(attributes, ("zone", "ZONE", "Zone", "zone_label", "ZONE_LABEL"))
    temp_range = _first_value(
        attributes,
        ("temp_range_f", "TEMP_RANGE_F", "temp_range", "TEMP_RANGE", "temperature_range_f"),
    )
    zone = zone or data.get("zone") or data.get("hardiness_zone")
    temp_range = temp_range or data.get("temp_range_f") or data.get("hardiness_zone_temp_range_f")
    if zone is None:
        value = data.get("value")
        if isinstance(value, str) and _ZONE_PATTERN.fullmatch(value.strip()):
            zone = value.strip().lower()
    if zone is None:
        return None

    zone = str(zone).strip().lower().replace(" ", "")
    if not _ZONE_PATTERN.fullmatch(zone):
        return None
    return {"zone": zone, "temp_range_f": str(temp_range).strip() if temp_range is not None else None}


def lookup_hardiness_zone(lat: float, lng: float) -> dict | None:
    try:
        response = httpx.get(
            ARCGIS_IDENTIFY_URL,
            params={
                "f": "json",
                "geometry": f"{{\"x\":{lng},\"y\":{lat},\"spatialReference\":{{\"wkid\":4326}}}}",
                "geometryType": "esriGeometryPoint",
                "sr": 4326,
                "tolerance": 2,
                "returnGeometry": "false",
            },
            timeout=8.0,
        )
        response.raise_for_status()
        return _parse_zone_response(response.json())
    except Exception:
        return None