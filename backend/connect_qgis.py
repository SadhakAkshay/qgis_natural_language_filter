import requests
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from groq import Groq

language = APIRouter(tags=["Natural Language Query"])

BASE_URL = "http://localhost/qgis/qgis_mapserv.fcgi.exe"   # Update this to your QGIS Server
MAP = "D:/qgis_projects/project_3.qgz"  #here put the path to your qgis project file

client = Groq(api_key="")  #HERE PUT THE GROQ API KEY


class NLQueryRequest(BaseModel):
    layer_name: str
    query: str
    max_features: int = 500
    max_unique_values: int = 30


# ─────────────────────────────────────────
# Schema builder
# ─────────────────────────────────────────
def get_layer_schema(layer_name: str, max_features: int = 500, max_unique_values: int = 30):
    params = {
        "SERVICE": "WFS",
        "VERSION": "1.1.0",
        "REQUEST": "GetFeature",
        "TYPENAME": layer_name,
        "OUTPUTFORMAT": "application/vnd.geo+json",
        "MAXFEATURES": str(max_features),
        "SRSNAME": "EPSG:4326",
        "MAP": MAP
    }

    response = requests.get(BASE_URL, params=params)

    if not response.text.strip() or response.text.strip().startswith("<"):
        raise HTTPException(status_code=500, detail=f"QGIS Server error for layer '{layer_name}': {response.text[:200]}")

    geojson = response.json()
    features = geojson.get("features", [])

    if not features:
        raise HTTPException(status_code=404, detail=f"No features found in layer '{layer_name}'")

    field_values = {}
    field_types = {}

    for feature in features:
        props = feature.get("properties", {})
        for key, value in props.items():
            if key not in field_values:
                field_values[key] = set()
                field_types[key] = type(value).__name__
            if value is not None:
                field_values[key].add(str(value))

    rich_schema = {}
    for field, values in field_values.items():
        sorted_values = sorted(list(values))
        total = len(sorted_values)

        if total <= max_unique_values:
            rich_schema[field] = {
                "type": field_types[field],
                "unique_count": total,
                "values": sorted_values
            }
        else:
            mid = total // 2
            sample = sorted(list(set(
                sorted_values[:10] +
                sorted_values[mid - 2: mid + 3] +
                sorted_values[-5:]
            )))
            rich_schema[field] = {
                "type": field_types[field],
                "unique_count": total,
                "values": sample,
                "note": f"Showing {len(sample)} of {total} total unique values"
            }

    return rich_schema


# ─────────────────────────────────────────
# LLM filter generator
# ─────────────────────────────────────────
def generate_wfs_filter(user_query: str, layer_name: str, rich_schema: dict):
    schema_text = ""
    for field, info in rich_schema.items():
        schema_text += f"\n  Field: '{field}'"
        schema_text += f"\n    Type: {info['type']}"
        schema_text += f"\n    Total unique values: {info['unique_count']}"
        schema_text += f"\n    Sample values: {info['values']}"
        if "note" in info:
            schema_text += f"\n    Note: {info['note']}"
        schema_text += "\n"

    prompt = f"""
You are a GIS expert. A user wants to query a WFS layer called '{layer_name}'.

The layer has the following fields with their value samples:
{schema_text}

User query: "{user_query}"

Instructions:
- Use EXACT field names as listed above
- Match values as closely as possible to what's shown in sample values
- For text fields with many values, use <ogc:PropertyIsLike> with wildcards if exact match is uncertain
- If multiple values match, combine with <ogc:Or>
- Return ONLY the raw XML filter, no explanation, no markdown backticks

Example:
<ogc:Filter xmlns:ogc="http://www.opengis.net/ogc">
  <ogc:Or>
    <ogc:PropertyIsEqualTo>
      <ogc:PropertyName>district_name</ogc:PropertyName>
      <ogc:Literal>Nashik</ogc:Literal>
    </ogc:PropertyIsEqualTo>
  </ogc:Or>
</ogc:Filter>
"""
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content.strip()


# ─────────────────────────────────────────
# WFS filtered fetch
# ─────────────────────────────────────────
def get_filtered_geojson(layer_name: str, wfs_filter: str):
    params = {
        "SERVICE": "WFS",
        "VERSION": "1.1.0",
        "REQUEST": "GetFeature",
        "TYPENAME": layer_name,
        "OUTPUTFORMAT": "application/vnd.geo+json",
        "SRSNAME": "EPSG:4326",
        "FILTER": wfs_filter,
        "MAP": MAP
    }
    response = requests.get(BASE_URL, params=params)

    if not response.text.strip() or response.text.strip().startswith("<"):
        raise HTTPException(status_code=500, detail=f"WFS filter error: {response.text[:300]}")

    return response.json()


# ─────────────────────────────────────────
# API endpoint
# ─────────────────────────────────────────
@language.post("/query")
def natural_language_query(body: NLQueryRequest):
    """
    Give a layer name + natural language query → returns filtered GeoJSON.
    """
    # Step 1 — Schema
    schema = get_layer_schema(body.layer_name, body.max_features, body.max_unique_values)

    # Step 2 — LLM filter
    wfs_filter = generate_wfs_filter(body.query, body.layer_name, schema)

    # Step 3 — Filtered GeoJSON
    geojson = get_filtered_geojson(body.layer_name, wfs_filter)
    feature_count = len(geojson.get("features", []))

    return JSONResponse(content={
        "layer": body.layer_name,
        "query": body.query,
        "wfs_filter_used": wfs_filter,
        "total_features": feature_count,
        "geojson": geojson
    })
