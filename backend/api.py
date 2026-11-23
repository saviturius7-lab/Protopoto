"""
Standalone FastAPI server exposing the Lightweight NLP + Hybrid RAG backend.
Run via: uvicorn backend.api:app --host 0.0.0.0 --port 8000
"""

from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from backend.nlp_engine import cmd_get_topic, cmd_ingest, cmd_search

app = FastAPI(title="Unlocked Lightweight NLP + Hybrid RAG API", version="1.0.0")


class PageInput(BaseModel):
    page: int = 0
    location: str = ""
    text: str


class IngestRequest(BaseModel):
    topicId: str
    topicTitle: str
    docId: Optional[str] = None
    sourceName: str
    sourceType: str = "pdf"
    pages: List[PageInput]
    stats: List[Dict[str, Any]] = []


class SearchRequest(BaseModel):
    topicId: str
    query: str
    topK: int = 5


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "engine": "python-lightweight-nlp"}


@app.post("/api/nlp/ingest")
def ingest(req: IngestRequest) -> Dict[str, Any]:
    return cmd_ingest(req.model_dump())


@app.post("/api/nlp/search")
def search(req: SearchRequest) -> Dict[str, Any]:
    return cmd_search(req.model_dump())


@app.get("/api/nlp/topic/{topic_id}")
def get_topic(topic_id: str) -> Dict[str, Any]:
    res = cmd_get_topic({"topicId": topic_id})
    if not res.get("found"):
        raise HTTPException(status_code=404, detail="Topic not found in SQLite")
    return res
