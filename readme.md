#  GeoQuery AI — Natural Language GIS Explorer

A full-stack GIS application that lets you query geospatial layers from a **QGIS Server** project using plain English sentences. Powered by **Llama 3.3 70B** (via Groq) and **OGC WFS**, it converts natural language into precise OGC XML filters and renders the results on an interactive map.

---

##  Demo

> _"Show me Nashik, Pune, and Mumbai districts"_
> _"Give me all national highways in Maharashtra"_
> _"Show districts where state is Maharashtra"_

The system fetches the layer schema, asks the LLM to generate an OGC WFS filter, queries QGIS Server, and renders the filtered GeoJSON on the map — all in a few seconds.

---

##  Architecture

```
Browser (HTML + OpenLayers)
        ↓  natural language query
FastAPI Backend (Python)
        ↓  1. fetch layer schema (WFS GetFeature)
        ↓  2. send schema + query to LLM (Groq)
        ↓  3. LLM generates OGC XML filter
        ↓  4. fetch filtered GeoJSON (WFS GetFeature + FILTER)
QGIS Server (WMS + WFS)
        ↓
.qgz Project File
```

---

##  Prerequisites

### QGIS Server (Windows)
- QGIS Desktop installed with QGIS Server enabled
- Your `.qgz` project file with layers published via **WMS** and **WFS**
- To enable WFS for a layer: `Project → Properties → QGIS Server → WFS tab → check your layers → Save`

follow this tutorial guide to set up the qgis server 
https://docs.qgis.org/3.44/en/docs/server_manual/index.html

### Python
- Python 3.10+
- pip

### Groq API Key
- Free at [console.groq.com](https://console.groq.com)

---

##  Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/SadhakAkshay/qgis_natural_language_filter.git
cd qgis_talk
```

### 2. Backend setup

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file:

```env
GROQ_API_KEY=gsk_your_groq_api_key_here
QGIS_BASE_URL=http://localhost/qgis/qgis_mapserv.fcgi.exe  (this can vary)
MAP_PATH=path_to_your_qgis_project_qgz_file
```

Start the FastAPI server:

```bash
uvicorn main:app --reload
```

API will be live at `http://localhost:8000`
Swagger docs at `http://localhost:8000/docs`


##  API Reference

### `POST /api/attributes`

Returns field names and data types for a given layer.

**Request:**
```json
{
  "layer_name": "in_district"
}
```

**Response:**
```json
{
  "layer": "in_district",
  "total_fields": 8,
  "attributes": [
    { "field": "dtname",    "type": "string"  },
    { "field": "stname",    "type": "string"  },
    { "field": "Dist_LGD", "type": "decimal" },
    { "field": "JID",      "type": "int"     }
  ]
}
```

---

### `POST /api/query`

Converts a natural language query into a WFS filter and returns filtered GeoJSON.

**Request:**
```json
{
  "layer_name": "in_district",
  "query": "show me nashik, pune, and mumbai",
  "max_features": 500,
  "max_unique_values": 30
}
```

**Response:**
```json
{
  "layer": "in_district",
  "query": "show me nashik, pune, and mumbai",
  "wfs_filter_used": "<ogc:Filter>...</ogc:Filter>",
  "total_features": 3,
  "geojson": { "type": "FeatureCollection", "features": [...] }
}
```

---

##  How the NL → GeoJSON Pipeline Works

```
1. SCHEMA DISCOVERY
   WFS GetFeature (max 500 features) → extract all field names + unique values
   Smart capping: for fields with 30+ unique values, sample first 10 + middle 5 + last 5

2. LLM FILTER GENERATION
   Send schema + user query to Llama 3.3 70B (Groq)
   LLM reasons step-by-step → generates OGC WFS 1.1.0 XML filter
   temperature=0.1 → deterministic, low hallucination

3. WFS FILTERED FETCH
   Send generated XML filter to QGIS Server WFS GetFeature
   Returns only matching features as GeoJSON

4. MAP RENDER
   OpenLayers renders the GeoJSON as a vector layer
   Map auto-zooms to the result extent
```

---

##  Frontend Features

- **Dynamic layer list** — fetched from WMS GetCapabilities on load, shown as radio buttons
- **Attribute panel** — field names and types fetched from `/api/attributes` on layer select
- **Natural language query box** — type your query, press "Show on Map"
- **Animated loader** — 4-step pipeline progress shown while query runs
- **Feature info panel** — click any feature on map to see its properties
- **WMS base layer toggle** — radio-select layers to show as WMS image tiles

---

##  Environment Variables

| Variable | Description | Example |
|---|---|---|
| `GROQ_API_KEY` | Your Groq API key | `gsk_...` |
| `QGIS_BASE_URL` | QGIS Server endpoint 
| `MAP_PATH` | Path to your .qgz project 

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Map rendering | [OpenLayers 10](https://openlayers.org/) |
| Backend | [FastAPI](https://fastapi.tiangolo.com/) |
| LLM | [Llama 3.3 70B](https://groq.com/) via Groq |
| GIS Server | [QGIS Server](https://docs.qgis.org/latest/en/docs/server_manual/) |
| Spatial protocol | OGC WMS 1.3.0 + WFS 1.1.0 |
| Output format | GeoJSON (EPSG:4326) |

---

##  Acknowledgements

- [QGIS Project](https://qgis.org/) for the open-source GIS server
- [Groq](https://groq.com/) for blazing fast LLM inference
- [OpenLayers](https://openlayers.org/) for the mapping library
- [OGC Standards](https://www.ogc.org/) for WMS/WFS specifications