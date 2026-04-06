from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from layer_attributes import router
from connect_qgis import language

app = FastAPI(
    title="NLP GIS API",
    description="Backend for Natural Language GIS Application",
    version="1.0.0"
)

# CORS — allow frontend to call these APIs
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.include_router(language, prefix="/api")


@app.get("/")
def root():
    return {"message": "NLP GIS Backend Running Successfully 🚀"}