async function getLayers() {
    const url = "http://localhost/qgis/qgis_mapserv.fcgi.exe?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities&MAP=D:/qgis_projects/project_3.qgz";

    const response = await fetch(url);
    const xmlText = await response.text();

    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");

    const layers = xml.getElementsByTagName("Layer");
    let layerInfo = [];

    for (let layer of layers) {
        const nameNode = layer.getElementsByTagName("Title")[0];
        if (!nameNode) continue;

        let layerName = nameNode.textContent;
        let bbox3857 = layer.querySelector('BoundingBox[CRS="EPSG:3857"]');

        if (bbox3857) {
            layerInfo.push({
                layer: layerName,
                minx: bbox3857.getAttribute("minx"),
                miny: bbox3857.getAttribute("miny"),
                maxx: bbox3857.getAttribute("maxx"),
                maxy: bbox3857.getAttribute("maxy")
            });
        }
    }

    return layerInfo;
}

// ── Universal single active layer variable ──
let activeWmsLayer = null;  // accessible anywhere

const map = new ol.Map({
    target: 'map',
    layers: [
        new ol.layer.Tile({
            source: new ol.source.OSM(),
        }),
    ],
    view: new ol.View({
        center: [0, 0],
        zoom: 2,
    }),
});

async function getLayerAttributes(layerName) {
    const attrList = document.querySelector(".attr-list");
    attrList.innerHTML = `<span style="font-size:0.75rem;color:var(--text-secondary);font-family:'DM Mono',monospace;">loading...</span>`;

    try {
        const response = await fetch("http://localhost:8000/api/attributes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ layer_name: layerName })
        });

        const result = await response.json();
        attrList.innerHTML = "";

        // Type → color mapping
        const typeColorMap = {
            "string": "#10b981",
            "int": "#3b82f6",
            "decimal": "#3b82f6",
            "double": "#3b82f6",
            "float": "#3b82f6",
            "boolean": "#f59e0b",
        };

        result.attributes.forEach(attr => {
            // Skip the layer-type field (e.g. "qgs:in_districtType")
            if (attr.type.startsWith("qgs:")) return;

            const color = typeColorMap[attr.type] || "#6b7280";

            const item = document.createElement("div");
            item.className = "attr-item";
            item.innerHTML = `
                <span class="attr-dot" style="background:${color}"></span>
                <span class="attr-name">${attr.field}</span>
            `;
            attrList.appendChild(item);
        });

    } catch (err) {
        attrList.innerHTML = `<span style="font-size:0.75rem;color:#dc2626;font-family:'DM Mono',monospace;">failed to load</span>`;
        console.error(err);
    }
}

// ── Toggle layer (radio logic — only one at a time) ──
let selectedLayer = null;  // Track currently selected layer
let vectorLayer = null;  // Track vector layer for filtered results

function toggleLayer(event, layerInfo) {
    const layerId = event.target.id;

    // Remove existing layer from map if any
    if (activeWmsLayer) {
        map.removeLayer(activeWmsLayer);
        activeWmsLayer = null;
    }

    if (vectorLayer) {
        map.removeLayer(vectorLayer);
        vectorLayer = null;
    }
    // If same layer clicked again (radio unchecked manually), just clear
    if (!event.target.checked) return;

    // Create new single WMS layer
    const qgisWmsSource = new ol.source.ImageWMS({
        url: "http://localhost/qgis/qgis_mapserv.fcgi.exe?",
        params: {
            'MAP': 'D:/qgis_projects/project_3.qgz',
            'LAYERS': layerId,
            'VERSION': '1.3.0'
        },
        serverType: 'qgis'
    });

    activeWmsLayer = new ol.layer.Image({
        source: qgisWmsSource
    });

    map.addLayer(activeWmsLayer);

    // Update selected style
    document.querySelectorAll('.layer-radio-item').forEach(el => el.classList.remove('selected'));
    event.target.closest('.layer-radio-item').classList.add('selected');

    // Zoom to layer bbox
    const layerMeta = layerInfo.find(l => l.layer === layerId);
    if (layerMeta) {
        map.getView().fit(
            [parseFloat(layerMeta.minx), parseFloat(layerMeta.miny),
            parseFloat(layerMeta.maxx), parseFloat(layerMeta.maxy)],
            { duration: 800, padding: [40, 40, 40, 40] }
        );
    }

    getLayerAttributes(layerId);
    selectedLayer = layerId;  // Update selected layer variable
}

window.onload = async function () {
    const layerInfo = await getLayers();
    const layerListDiv = document.getElementsByClassName("field-label")[0];

    if (!layerInfo || !layerInfo.length) return;

    layerInfo.forEach((layer1) => {
        if (layer1.layer === "Untitled") return;

        // ── Wrapper ──
        const wrapper = document.createElement("div");
        wrapper.className = "layer-radio-item";

        // ── Radio input ──
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "layerToggle";
        radio.id = layer1.layer;
        radio.dataset.layername = layer1.layer;
        radio.className = "layer-radio-input";
        radio.onclick = (event) => toggleLayer(event, layerInfo);

        // ── Custom radio visual ──
        const radioCustom = document.createElement("span");
        radioCustom.className = "layer-radio-dot";

        // ── Layer icon ──
        const icon = document.createElement("span");
        icon.className = "layer-icon";
        // icon.textContent = "⬡";

        // ── Label text ──
        const label = document.createElement("label");
        label.htmlFor = layer1.layer;
        label.className = "layer-radio-label";
        label.textContent = layer1.layer;

        wrapper.appendChild(radio);
        wrapper.appendChild(radioCustom);
        wrapper.appendChild(icon);
        wrapper.appendChild(label);
        layerListDiv.appendChild(wrapper);
    });
};

// ── Loader helpers ──
function showLoader()  { document.getElementById("mapLoader").classList.add("active"); }
function hideLoader()  { document.getElementById("mapLoader").classList.remove("active"); }

function setLoaderStep(stepNum) {
    // Mark all previous steps done, current active, rest idle
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`lstep${i}`);
        el.classList.remove("active", "done");
        if (i < stepNum)       el.classList.add("done");
        else if (i === stepNum) el.classList.add("active");
    }
}

// ── Query API call with loader ──
async function filterLayer() {
    const query = document.getElementById("criteriaText").value.trim();
    const selectedRadio = document.querySelector('input[name="layerToggle"]:checked');

    if (!selectedRadio) { alert("Please select a layer first."); return; }
    if (!query)         { alert("Please enter a query."); return; }

    const layerName = selectedRadio.id;

    showLoader();

    try {
        // Step 1 — schema (happening server side, just show it)
        setLoaderStep(1);
        await new Promise(r => setTimeout(r, 400)); // brief pause so user sees step 1

        // Step 2 — LLM filter generation (happening server side)
        setLoaderStep(2);

        const response = await fetch("http://localhost:8000/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ layer_name: layerName, query: query })
        });

        // Step 3 — GeoJSON being fetched
        setLoaderStep(3);
        const result = await response.json();

        if (!result.geojson || !result.geojson.features) {
            throw new Error("No features returned from server.");
        }

        // Step 4 — Rendering
        setLoaderStep(4);
        await new Promise(r => setTimeout(r, 300)); // brief pause so user sees step 4

        // Remove existing layers
        if (activeWmsLayer) {
            map.removeLayer(activeWmsLayer);
            activeWmsLayer = null;
        }
        if (vectorLayer) {
            map.removeLayer(vectorLayer);
            vectorLayer = null;
        }

        // Add GeoJSON to map
        const vectorSource = new ol.source.Vector({
            features: new ol.format.GeoJSON().readFeatures(result.geojson, {
                dataProjection: "EPSG:4326",
                featureProjection: "EPSG:3857"
            })
        });

        vectorLayer = new ol.layer.Vector({ source: vectorSource });
        map.addLayer(vectorLayer);

        console.log(result);
        // Zoom to features
        if (vectorSource.getFeatures().length > 0) {
            map.getView().fit(vectorSource.getExtent(), {
                duration: 800,
                padding: [40, 40, 40, 40]
            });
        }

    } catch (err) {
        console.error("Query failed:", err);
        alert("Query failed: " + err.message);
    } finally {
        hideLoader();
    }
}