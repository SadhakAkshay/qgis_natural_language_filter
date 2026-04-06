import requests
import xml.etree.ElementTree as ET
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["Layer Attributes"])

BASE_URL = "http://localhost/qgis/qgis_mapserv.fcgi.exe"    #qgis server url, make sure to adjust it if your setup is different
MAP = "D:/qgis_projects/project_3.qgz"   #here put the path to your qgis project file


class LayerRequest(BaseModel):
    layer_name: str


def get_layer_attributes(layer_name: str):
    params = {
        "SERVICE": "WFS",
        "VERSION": "1.1.0",
        "REQUEST": "DescribeFeatureType",
        "TYPENAME": layer_name,
        "MAP": MAP
    }

    response = requests.get(BASE_URL, params=params)

    if not response.text.strip():
        raise HTTPException(status_code=500, detail="Empty response from QGIS Server")

    try:
        root = ET.fromstring(response.text)
    except ET.ParseError:
        raise HTTPException(status_code=500, detail="Failed to parse XML from QGIS Server")

    ns = {
        "xsd": "http://www.w3.org/2001/XMLSchema",
        "gml": "http://www.opengis.net/gml"
    }

    attributes = []
    for element in root.findall(".//xsd:element", ns):
        name = element.get("name")
        dtype = element.get("type", "")

        # Skip geometry fields and empty names
        if not name or "gml" in dtype:
            continue

        attributes.append({
            "field": name,
            "type": dtype.replace("xsd:", "")
        })

    if not attributes:
        raise HTTPException(status_code=404, detail=f"No attributes found for layer '{layer_name}'. Check if WFS is enabled.")

    return attributes


@router.post("/attributes")
def fetch_layer_attributes(body: LayerRequest):
    """
    Give a layer name → returns all field names and their data types.
    """
    attributes = get_layer_attributes(body.layer_name)
    return {
        "layer": body.layer_name,
        "total_fields": len(attributes),
        "attributes": attributes
    }