#!/usr/bin/env python3
"""
Unlocked Phase 1 — Lightweight NLP + Hybrid RAG Engine (Python + SQLite).

Architecture:
1. PDF / Text Processing: de-hyphenation, boilerplate cleaning, page & section splitting.
2. NLP Analysis: YAKE-style keyphrase extraction, TF-IDF, TextRank graph centrality,
   entity/definition extraction, and lightweight topic clustering (optional PyMuPDF/
   YAKE/spaCy/NLTK/sklearn/rank_bm25/NetworkX with pure-stdlib fallbacks).
3. Concept & Topic Mapper: section hierarchy + directed concept graph.
4. Hybrid Retrieval: BM25 + dense-style hashed n-gram cosine similarity stored in SQLite.
5. Quiz Generation: template-based questions with evidence quotes & page references.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Tuple

DB_PATH = os.environ.get(
    "UNLOCKED_DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "unlocked_rag.db"),
)

# Optional heavy Python NLP libraries (used automatically when installed)
try:
    import fitz  # PyMuPDF
except Exception:
    fitz = None

try:
    import yake as _yake
except Exception:
    _yake = None

try:
    from rank_bm25 import BM25Okapi as _BM25Okapi
except Exception:
    _BM25Okapi = None

try:
    import networkx as _nx
except Exception:
    _nx = None

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "can",
    "could", "did", "do", "does", "during", "each", "either", "for", "from", "had",
    "has", "have", "having", "he", "her", "here", "hers", "him", "his", "how", "i",
    "if", "in", "into", "is", "it", "its", "itself", "just", "may", "might", "more",
    "most", "must", "my", "no", "nor", "not", "now", "of", "on", "only", "or", "other",
    "our", "out", "over", "own", "same", "she", "should", "so", "some", "such", "than",
    "that", "the", "their", "them", "then", "there", "these", "they", "this", "those",
    "through", "to", "too", "under", "until", "up", "used", "using", "very", "was",
    "we", "were", "what", "when", "where", "which", "while", "who", "why", "will",
    "with", "would", "you", "your", "also", "between", "both", "many", "one", "two",
}

VECTOR_DIM = 96


def get_db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS topics (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            hierarchy_json TEXT DEFAULT '[]',
            keywords_json TEXT DEFAULT '[]',
            concepts_json TEXT DEFAULT '[]',
            relationships_json TEXT DEFAULT '[]',
            quiz_json TEXT DEFAULT '[]',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            topic_id TEXT NOT NULL,
            name TEXT NOT NULL,
            doc_type TEXT NOT NULL,
            pages INTEGER DEFAULT 0,
            chars INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS chunks (
            id TEXT PRIMARY KEY,
            topic_id TEXT NOT NULL,
            doc_id TEXT NOT NULL,
            source_name TEXT NOT NULL,
            source_type TEXT NOT NULL,
            page_num INTEGER DEFAULT 0,
            section TEXT DEFAULT '',
            location TEXT DEFAULT '',
            text TEXT NOT NULL,
            tokens_json TEXT NOT NULL,
            vec_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chunks_topic ON chunks(topic_id);
        """
    )
    return conn


def clean_text(raw: str) -> str:
    txt = str(raw or "").replace("\r\n", "\n").replace("\r", "\n")
    # Rejoin hyphenated line breaks from PDF textbooks
    txt = re.sub(r"([A-Za-z])-\n([A-Za-z])", r"\1\2", txt)
    # Collapse excessive spaces while preserving paragraph breaks
    txt = re.sub(r"[ \t]+", " ", txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt.strip()


def tokenize(text: str) -> List[str]:
    words = re.findall(r"[A-Za-z0-9][A-Za-z0-9.%/-]*", str(text or "").lower())
    out = []
    for w in words:
        w = w.strip("./-")
        if len(w) >= 2 and w not in STOPWORDS:
            out.append(w)
    return out


def split_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", clean_text(text))
    return [p.strip() for p in parts if len(p.strip()) >= 8]


def compute_semantic_vector(text: str) -> List[float]:
    """Lightweight character-trigram + word-token hashed embedding (zero LLM inference)."""
    vec = [0.0] * VECTOR_DIM
    toks = tokenize(text)
    for t in toks:
        idx = int(hashlib.md5(t.encode("utf-8")).hexdigest()[:8], 16) % VECTOR_DIM
        vec[idx] += 1.5
        padded = f"^{t}$"
        for i in range(max(0, len(padded) - 2)):
            tri = padded[i : i + 3]
            tidx = int(hashlib.md5(tri.encode("utf-8")).hexdigest()[:8], 16) % VECTOR_DIM
            vec[tidx] += 0.5
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 4) for v in vec]


def cosine_sim(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def detect_sections_and_chunk(
    pages: List[Dict[str, Any]],
    doc_id: str,
    source_name: str,
    source_type: str,
    chunk_size: int = 460,
    overlap: int = 70,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Split pages into detected sections and overlapping retrieval chunks."""
    chunks: List[Dict[str, Any]] = []
    sections: List[Dict[str, Any]] = []
    current_section = "Overview"
    section_buf: Dict[str, List[str]] = defaultdict(list)

    heading_re = re.compile(
        r"^(?:#{1,4}\s+.+|(?:Chapter|Section|Part|Unit)\s+\d+[:.\s-]*.*|\d+(?:\.\d+)*\s+[A-Z][A-Za-z0-9 ,:-]{3,60}|[A-Z][A-Z0-9 \t-]{4,50}|[A-Z][A-Za-z0-9 ,'-]{2,42}:)$"
    )

    seq = 0
    for p in pages:
        page_num = int(p.get("page") or 0)
        loc_base = p.get("location") or (f"Page {page_num}" if page_num > 0 else "Document")
        text = clean_text(p.get("text", ""))
        if not text:
            continue

        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
        para_buf: List[str] = []

        def flush_para(buf_text: str) -> None:
            nonlocal seq
            t = buf_text.strip()
            if not t:
                return
            section_buf[current_section].append(t)
            if len(t) <= chunk_size:
                seq += 1
                toks = tokenize(t)
                chunks.append(
                    {
                        "id": f"{doc_id}_c{seq}",
                        "doc_id": doc_id,
                        "source_name": source_name,
                        "source_type": source_type,
                        "page_num": page_num,
                        "section": current_section,
                        "location": loc_base,
                        "text": t,
                        "tokens": toks,
                        "vec": compute_semantic_vector(t),
                    }
                )
            else:
                i = 0
                while i < len(t) and len(chunks) < 260:
                    end = min(len(t), i + chunk_size)
                    if end < len(t):
                        dot = t.rfind(". ", i + chunk_size // 2, end)
                        sp = t.rfind(" ", i + chunk_size // 2, end)
                        if dot > i:
                            end = dot + 1
                        elif sp > i:
                            end = sp
                    sub = t[i:end].strip()
                    if sub:
                        seq += 1
                        toks = tokenize(sub)
                        chunks.append(
                            {
                                "id": f"{doc_id}_c{seq}",
                                "doc_id": doc_id,
                                "source_name": source_name,
                                "source_type": source_type,
                                "page_num": page_num,
                                "section": current_section,
                                "location": loc_base,
                                "text": sub,
                                "tokens": toks,
                                "vec": compute_semantic_vector(sub),
                            }
                        )
                    if end >= len(t):
                        break
                    i = max(i + 40, end - overlap)

        for ln in lines:
            stripped_ln = re.sub(r"^#{1,4}\s+", "", ln).rstrip(":").strip()
            if heading_re.match(ln) and len(stripped_ln.split()) <= 10:
                if para_buf:
                    flush_para(" ".join(para_buf))
                    para_buf = []
                current_section = stripped_ln.title() if stripped_ln.isupper() else stripped_ln
            else:
                para_buf.append(ln)
                if len(" ".join(para_buf)) >= chunk_size:
                    flush_para(" ".join(para_buf))
                    para_buf = []
        if para_buf:
            flush_para(" ".join(para_buf))

    for sec_name, texts in section_buf.items():
        combined = " ".join(texts)
        sections.append(
            {
                "section": sec_name,
                "chars": len(combined),
                "sample": combined[:180],
            }
        )
    return chunks, sections


def extract_yake_and_textrank_keywords(chunks: List[Dict[str, Any]], top_k: int = 12) -> List[Dict[str, Any]]:
    """Combine YAKE-style statistical scoring, TF-IDF, and TextRank word centrality."""
    full_text = "\n".join(c["text"] for c in chunks)
    if not full_text.strip():
        return []

    if _yake is not None:
        try:
            kw_ext = _yake.KeywordExtractor(lan="en", n=2, top=top_k)
            raw_kws = kw_ext.extract_keywords(full_text[:25000])
            return [
                {"term": kw, "score": round(1.0 / (1.0 + sc), 3), "method": "yake"}
                for kw, sc in raw_kws
            ]
        except Exception:
            pass

    # Pure-Python YAKE + TextRank + TF-IDF hybrid keyphrase extractor
    docs_tokens = [c.get("tokens") or tokenize(c["text"]) for c in chunks]
    N = max(1, len(docs_tokens))
    df: Counter = Counter()
    tf_total: Counter = Counter()
    cooccur: Dict[str, Counter] = defaultdict(Counter)
    pos_scores: Dict[str, List[float]] = defaultdict(list)

    for doc_idx, toks in enumerate(docs_tokens):
        seen = set()
        for idx, t in enumerate(toks):
            if len(t) < 3 or t.isdigit():
                continue
            tf_total[t] += 1
            pos_scores[t].append(1.0 / (1.0 + math.log1p(idx)))
            if t not in seen:
                seen.add(t)
                df[t] += 1
            for j in range(idx + 1, min(len(toks), idx + 4)):
                nbr = toks[j]
                if nbr != t and len(nbr) >= 3 and not nbr.isdigit():
                    cooccur[t][nbr] += 1
                    cooccur[nbr][t] += 1

    # TextRank power iteration over word co-occurrence graph
    vocab = [w for w, cnt in tf_total.most_common(120)]
    rank = {w: 1.0 for w in vocab}
    damping = 0.85
    for _ in range(12):
        new_rank = {}
        for w in vocab:
            s = 0.0
            for nbr, weight in cooccur[w].items():
                if nbr in rank:
                    deg = sum(cooccur[nbr].values()) or 1
                    s += (weight / deg) * rank[nbr]
            new_rank[w] = (1.0 - damping) + damping * s
        rank = new_rank

    # Candidate 1-gram and 2-gram phrases scored with TF-IDF + TextRank + position
    ngram_counts: Counter = Counter()
    for sent in split_sentences(full_text[:30000]):
        stoks = tokenize(sent)
        for i in range(len(stoks)):
            if len(stoks[i]) >= 3 and not stoks[i].isdigit():
                ngram_counts[stoks[i]] += 1
            if i + 1 < len(stoks) and len(stoks[i]) >= 3 and len(stoks[i + 1]) >= 3:
                if not stoks[i].isdigit() and not stoks[i + 1].isdigit():
                    ngram_counts[f"{stoks[i]} {stoks[i + 1]}"] += 1

    scored: List[Tuple[str, float]] = []
    for phrase, cnt in ngram_counts.items():
        parts = phrase.split()
        if len(parts) == 2 and cnt < 2:
            continue
        tfidf_part = sum(
            (1 + math.log1p(tf_total[p])) * math.log(1 + N / (1 + df[p])) for p in parts
        ) / len(parts)
        tr_part = sum(rank.get(p, 0.2) for p in parts) / len(parts)
        pos_part = sum(
            (sum(pos_scores[p]) / max(1, len(pos_scores[p]))) for p in parts
        ) / len(parts)
        phrase_bonus = 1.25 if len(parts) == 2 else 1.0
        total = phrase_bonus * (0.45 * tfidf_part + 0.35 * tr_part + 0.20 * pos_part)
        scored.append((phrase, total))

    scored.sort(key=lambda x: x[1], reverse=True)
    results: List[Dict[str, Any]] = []
    seen_terms: set = set()
    for term, sc in scored:
        if term in seen_terms:
            continue
        seen_terms.add(term)
        results.append({"term": term, "score": round(sc, 3), "method": "tfidf+textrank"})
        if len(results) >= top_k:
            break
    return results


def build_topic_hierarchy_concepts_and_quizzes(
    topic_title: str,
    chunks: List[Dict[str, Any]],
    sections: List[Dict[str, Any]],
    stats: List[Dict[str, Any]],
    keywords: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Concept & Topic Mapper + Multi-Type Evidence-Validated Template Quiz Generator."""
    concepts: List[Dict[str, Any]] = []
    seen_names: set = set()

    def add_concept(
        name: str,
        defn: str,
        kind: str,
        page_num: int,
        section: str,
        source_name: str,
        quote: str,
    ) -> None:
        clean_name = re.sub(r"^(?:[-*•\d.)\s]+|(?:the|a|an)\s+)|[:.;]+$", "", str(name or ""), flags=re.I).strip()
        clean_def = str(defn or "").strip()
        if not clean_name or len(clean_name) < 2 or len(clean_name) > 52 or len(clean_def) < 8:
            return
        low = clean_name.lower()
        if low in seen_names or len(concepts) >= 16:
            return
        seen_names.add(low)
        cid = "nlp_" + re.sub(r"[^a-z0-9]+", "_", low)[:22] + f"_{len(concepts)}"
        concepts.append(
            {
                "id": cid,
                "name": clean_name,
                "def": clean_def[:230],
                "kind": kind,
                "page": page_num,
                "section": section,
                "source": source_name,
                "evidence": quote[:220],
            }
        )

    # 1. Linguistic definition, mechanism & entity patterns per chunk (retaining exact page & section)
    for ch in chunks:
        src = ch.get("source_name", "Source")
        pg = int(ch.get("page_num") or 0)
        sec = ch.get("section") or ch.get("location") or "Overview"
        for sent in split_sentences(ch["text"]):
            if len(sent) > 280:
                continue
            m1 = re.match(r"^(?:[-*•]\s*)?([A-Z][A-Za-z0-9 ()/'-]{2,40})\s*[:—-]\s+(.{10,220})$", sent)
            if m1 and not re.match(r"^(Row|Page|Sheet|Record|Image|Figure|Table|---)$", m1.group(1), re.I):
                add_concept(m1.group(1), m1.group(2), "concept", pg, sec, src, sent)
                continue
            m2 = re.match(
                r"^(?:The\s+|An?\s+)?([A-Za-z][A-Za-z0-9 ()/'-]{2,38})\s+(?:is defined as|refers to|means|represents|describes|is the|are the|is a|are)\s+(.{10,220})$",
                sent,
                re.I,
            )
            if m2 and len(m2.group(1).split()) <= 5:
                add_concept(m2.group(1).strip().title() if m2.group(1).islower() else m2.group(1), m2.group(2), "concept", pg, sec, src, sent)
                continue
            m3 = re.match(
                r"^(?:The\s+|An?\s+)?([A-Z][A-Za-z0-9 ()/'-]{2,36})\s+(?:converts|produces|causes|triggers|drives|requires|regulates|controls|measures)\s+(.{10,220})$",
                sent,
            )
            if m3 and len(m3.group(1).split()) <= 5:
                add_concept(m3.group(1), sent, "process", pg, sec, src, sent)

    # 2. Numeric dataset stats from Excel / CSV / OCR
    for st in stats:
        if st.get("mean") is not None:
            add_concept(
                st["label"],
                f"Dataset metric ({st.get('sheet') or st.get('sourceName')}): mean {st['mean']}, min {st['min']}, max {st['max']} (n={st['count']}).",
                "variable",
                0,
                st.get("sheet") or "Data Table",
                st.get("sourceName") or "Spreadsheet",
                st.get("summary") or "",
            )

    # 3. Backfill top TextRank/TF-IDF keywords with their best evidence sentence
    generic_skip = {
        "system", "process", "example", "study", "group", "work", "place", "part", "unit",
        "value", "values", "data", "table", "figure", "page", "chapter", "section", "type",
        "types", "form", "forms", "method", "result", "results", "molecules", "molecule",
    }
    if len(concepts) < 8:
        sorted_kws = sorted(keywords, key=lambda k: (1 if " " in k.get("term", "") else 0, k.get("score", 0)), reverse=True)
        for kw in sorted_kws:
            if len(concepts) >= 10:
                break
            term = kw["term"]
            if term.lower() in generic_skip:
                continue
            for ch in chunks:
                if term in ch["text"].lower():
                    sents = split_sentences(ch["text"])
                    best = next((s for s in sents if term in s.lower() and len(s) >= 18), ch["text"])
                    add_concept(
                        term.title(),
                        best[:210],
                        "keyword",
                        int(ch.get("page_num") or 0),
                        ch.get("section") or ch.get("location") or "Overview",
                        ch.get("source_name") or "Source",
                        best,
                    )
                    break

    # 4. Concept Graph (NetworkX if available, else direct edge mapping)
    relationships: List[Dict[str, Any]] = []
    rel_seen: set = set()
    verb_patterns = [
        (re.compile(r"\b(causes?|drives?|triggers?|leads? to)\b", re.I), "causes"),
        (re.compile(r"\b(produces?|creates?|builds?|generates?|yields?|converts?)\b", re.I), "produces"),
        (re.compile(r"\b(requires?|needs?|depends? on)\b", re.I), "requires"),
        (re.compile(r"\b(increases?|raises?|boosts?)\b", re.I), "increases"),
        (re.compile(r"\b(decreases?|reduces?|limits?|opposes?)\b", re.I), "limits"),
        (re.compile(r"\b(contains?|includes?|holds?)\b", re.I), "contains"),
    ]
    for i in range(len(concepts)):
        for j in range(i + 1, len(concepts)):
            if len(relationships) >= 14:
                break
            a, b = concepts[i], concepts[j]
            shared_sent = None
            shared_chunk = None
            for c in chunks:
                if a["name"].lower() in c["text"].lower() and b["name"].lower() in c["text"].lower():
                    for s in split_sentences(c["text"]):
                        if a["name"].lower() in s.lower() and b["name"].lower() in s.lower():
                            shared_sent = s
                            shared_chunk = c
                            break
                    if shared_sent:
                        break
            if shared_sent and shared_chunk and f"{a['id']}->{b['id']}" not in rel_seen:
                lbl = "relates to"
                for pat, v_lbl in verb_patterns:
                    if pat.search(shared_sent):
                        lbl = v_lbl
                        break
                rel_seen.add(f"{a['id']}->{b['id']}")
                relationships.append(
                    {
                        "from": a["id"],
                        "to": b["id"],
                        "label": lbl,
                        "page": int(shared_chunk.get("page_num") or 0),
                        "source": shared_chunk.get("source_name") or "",
                        "evidence": shared_sent[:220],
                    }
                )

    if _nx is not None and concepts:
        try:
            g = _nx.DiGraph()
            for c in concepts:
                g.add_node(c["id"], label=c["name"])
            for r in relationships:
                g.add_edge(r["from"], r["to"], label=r["label"])
            deg = dict(g.degree())
            for c in concepts:
                c["centrality"] = deg.get(c["id"], 0)
        except Exception:
            pass

    # 5. Topic Hierarchy (Sections -> Keywords & Concepts)
    hierarchy: List[Dict[str, Any]] = []
    sec_names = [s["section"] for s in sections] or ["Overview"]
    for sec in sec_names[:8]:
        sec_concepts = [c["name"] for c in concepts if (c.get("section") or "").lower() == sec.lower()]
        sec_pages = sorted(
            {
                int(c.get("page_num") or 0)
                for c in chunks
                if (c.get("section") or "").lower() == sec.lower() and int(c.get("page_num") or 0) > 0
            }
        )
        hierarchy.append(
            {
                "section": sec,
                "pages": sec_pages,
                "concepts": sec_concepts[:6],
            }
        )

    # 6. Multi-Type Evidence-Validated Template Quiz Generation (with Page References)
    quiz: List[Dict[str, Any]] = []
    quiz_seen: set = set()
    kw_pool = [k["term"].title() for k in keywords if len(k.get("term", "")) >= 3]
    doc_vocab: List[str] = []
    vocab_seen: set = set()
    for ch in chunks:
        for tok in tokenize(ch["text"]):
            if len(tok) >= 5 and not tok.isdigit() and tok not in vocab_seen:
                vocab_seen.add(tok)
                doc_vocab.append(tok.title())

    def build_distractors(correct_label: str) -> List[str]:
        pool: List[str] = []
        seen_d = {correct_label.lower()}
        for candidate in [c["name"] for c in concepts] + kw_pool + doc_vocab:
            low = candidate.lower()
            if low not in seen_d and low not in correct_label.lower() and correct_label.lower() not in low:
                seen_d.add(low)
                pool.append(candidate)
            if len(pool) >= 3:
                break
        fallbacks = ["Equilibrium rate", "Reaction pathway", "Structural threshold"]
        for fb in fallbacks:
            if len(pool) >= 3:
                break
            if fb.lower() not in seen_d:
                pool.append(fb)
        return pool[:3]

    def add_quiz_item(q_text: str, correct_ans: str, distractors: List[str], why: str, ref_str: str, evidence: str, rot: int) -> None:
        if q_text in quiz_seen or len(quiz) >= 10 or len(distractors) < 3:
            return
        opts = [correct_ans] + distractors[:3]
        ans_idx = rot % len(opts)
        opts[0], opts[ans_idx] = opts[ans_idx], opts[0]
        quiz_seen.add(q_text)
        quiz.append(
            {
                "q": q_text,
                "opts": opts,
                "a": ans_idx,
                "why": why,
                "pageRef": ref_str,
                "evidence": evidence[:220],
            }
        )

    # A. Concept / Definition & Cloze items
    for idx, c in enumerate(concepts):
        if len(quiz) >= 6:
            break
        if len(c.get("def", "")) < 8:
            continue
        page_ref = f"Page {c['page']}" if c.get("page") else (c.get("section") or "Source")
        ref_str = f"{c.get('source') or topic_title} · {page_ref}"
        distractors = build_distractors(c["name"])
        if idx % 2 == 1 and c.get("evidence") and c["name"].lower() in c["evidence"].lower():
            masked = re.sub(re.escape(c["name"]), "______", c["evidence"], count=1, flags=re.I)
            q_text = f"Complete this passage ({ref_str}): \"{masked}\""
        else:
            q_text = f"Which concept matches this description ({ref_str}): \"{c['def'][:140]}\"?"
        add_quiz_item(q_text, c["name"], distractors, f"{c['name']}: {c['def']}", ref_str, c.get("evidence") or c["def"], idx)

    # B. Relationship / Mechanism questions (only for explicit directional verbs)
    concept_by_id = {c["id"]: c for c in concepts}
    for r_idx, rel in enumerate(relationships):
        if len(quiz) >= 8:
            break
        if rel.get("label") == "relates to":
            continue
        a = concept_by_id.get(rel["from"])
        b = concept_by_id.get(rel["to"])
        if not a or not b:
            continue
        page_ref = f"Page {rel['page']}" if rel.get("page") else "Source"
        ref_str = f"{rel.get('source') or topic_title} · {page_ref}"
        q_text = f"According to {ref_str}, how does {a['name']} connect to {b['name']}?"
        all_verbs = ["causes", "produces", "requires", "increases", "limits", "contains"]
        d_verbs = [v for v in all_verbs if v != rel["label"]][:3]
        add_quiz_item(
            q_text,
            f"{a['name']} {rel['label']} {b['name']}",
            [f"{a['name']} {v} {b['name']}" for v in d_verbs],
            f"Concept link in text: {a['name']} {rel['label']} {b['name']}.",
            ref_str,
            rel.get("evidence") or f"{a['name']} {rel['label']} {b['name']}",
            r_idx + 1,
        )

    # C. Prose Cloze Recall across all chunks (guarantees questions from arbitrary prose!)
    for ch_idx, ch in enumerate(chunks):
        if len(quiz) >= 10:
            break
        src = ch.get("source_name") or topic_title
        pg = int(ch.get("page_num") or 0)
        page_ref = f"Page {pg}" if pg > 0 else (ch.get("section") or ch.get("location") or "Source")
        ref_str = f"{src} · {page_ref}"
        for s_idx, sent in enumerate(split_sentences(ch["text"])):
            if len(quiz) >= 10:
                break
            if len(sent) < 35 or len(sent) > 240:
                continue
            target_term = None
            for kw in kw_pool:
                if re.search(r"\b" + re.escape(kw) + r"\b", sent, re.I):
                    target_term = kw
                    break
            if not target_term:
                toks = [t for t in tokenize(sent) if len(t) >= 5 and not t.isdigit()]
                if toks:
                    target_term = toks[0].title()
            if not target_term:
                continue
            masked = re.sub(r"\b" + re.escape(target_term) + r"\b", "______", sent, count=1, flags=re.I)
            if "______" not in masked:
                continue
            q_text = f"Fill in the key term ({ref_str}): \"{masked}\""
            distractors = build_distractors(target_term)
            add_quiz_item(q_text, target_term, distractors, f"From source ({ref_str}): {sent}", ref_str, sent, ch_idx + s_idx)

    # D. Quantitative dataset quiz items
    for st in [s for s in stats if s.get("mean") is not None][:2]:
        ref_str = f"{st.get('sourceName') or 'Spreadsheet'} · {st.get('sheet') or 'Sheet1'}"
        q_text = f"In {ref_str}, what is the mean recorded for {st['label']}?"
        if q_text not in quiz_seen:
            quiz_seen.add(q_text)
            quiz.append(
                {
                    "q": q_text,
                    "opts": [
                        str(st["mean"]),
                        str(st["min"]),
                        str(st["max"]),
                        str(round(float(st["mean"]) * 1.35 + 1, 2)),
                    ],
                    "a": 0,
                    "why": f"Extracted statistics: mean {st['mean']}, min {st['min']}, max {st['max']} (n={st['count']}).",
                    "pageRef": ref_str,
                    "evidence": st.get("summary") or "",
                }
            )

    return {
        "hierarchy": hierarchy,
        "concepts": concepts,
        "relationships": relationships,
        "quiz": quiz,
    }


def hybrid_search(conn: sqlite3.Connection, topic_id: str, query: str, top_k: int = 5) -> Dict[str, Any]:
    rows = conn.execute(
        "SELECT id, doc_id, source_name, source_type, page_num, section, location, text, tokens_json, vec_json FROM chunks WHERE topic_id = ?",
        (topic_id,),
    ).fetchall()
    q_tokens = tokenize(query)
    if not rows or not q_tokens:
        return {"results": [], "query_tokens": q_tokens}

    q_vec = compute_semantic_vector(query)
    corpus_tokens = [json.loads(r["tokens_json"]) for r in rows]
    N = len(corpus_tokens)

    # BM25 scores (rank_bm25 if installed, else pure-Python BM25)
    bm25_scores: List[float] = [0.0] * N
    if _BM25Okapi is not None:
        try:
            bm = _BM25Okapi(corpus_tokens)
            bm25_scores = [float(s) for s in bm.get_scores(q_tokens)]
        except Exception:
            pass

    if max(bm25_scores, default=0.0) == 0.0:
        df: Counter = Counter()
        for toks in corpus_tokens:
            for t in set(toks):
                df[t] += 1
        avg_dl = sum(len(t) for t in corpus_tokens) / max(1, N)
        k1, b = 1.5, 0.75
        for idx, toks in enumerate(corpus_tokens):
            tf = Counter(toks)
            dl = max(1, len(toks))
            sc = 0.0
            for qt in q_tokens:
                freq = tf.get(qt, 0)
                if freq == 0:
                    freq = sum(cnt * 0.6 for tk, cnt in tf.items() if tk.startswith(qt) or (len(qt) >= 4 and qt in tk))
                if freq > 0:
                    idf = math.log(1 + (N - df.get(qt, 1) + 0.5) / (df.get(qt, 1) + 0.5))
                    sc += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (dl / avg_dl))))
            bm25_scores[idx] = sc

    max_bm = max(bm25_scores) or 1.0
    hits = []
    for idx, r in enumerate(rows):
        bm_norm = bm25_scores[idx] / max_bm
        sem = max(0.0, cosine_sim(q_vec, json.loads(r["vec_json"])))
        phrase_boost = 0.25 if len(query.strip()) >= 4 and query.strip().lower() in r["text"].lower() else 0.0
        hybrid = 0.65 * bm_norm + 0.35 * sem + phrase_boost
        if hybrid > 0.08:
            hits.append(
                {
                    "chunk": {
                        "id": r["id"],
                        "docId": r["doc_id"],
                        "sourceName": r["source_name"],
                        "sourceType": r["source_type"],
                        "pageNum": r["page_num"],
                        "section": r["section"],
                        "location": r["location"],
                        "text": r["text"],
                    },
                    "score": round(hybrid, 3),
                    "bm25Score": round(bm_norm, 3),
                    "semanticScore": round(sem, 3),
                }
            )
    hits.sort(key=lambda x: x["score"], reverse=True)
    return {"results": hits[:top_k], "query_tokens": q_tokens}


def cmd_ingest(payload: Dict[str, Any]) -> Dict[str, Any]:
    topic_id = str(payload.get("topicId") or "default")
    topic_title = str(payload.get("topicTitle") or "Untitled Topic")
    doc_id = str(payload.get("docId") or f"doc_{hashlib.md5(topic_title.encode()).hexdigest()[:8]}")
    source_name = str(payload.get("sourceName") or "Document")
    source_type = str(payload.get("sourceType") or "pdf")
    pages = payload.get("pages") or []
    stats = payload.get("stats") or []

    chunks, sections = detect_sections_and_chunk(pages, doc_id, source_name, source_type)

    conn = get_db()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO documents (id, topic_id, name, doc_type, pages, chars) VALUES (?, ?, ?, ?, ?, ?)",
            (doc_id, topic_id, source_name, source_type, len(pages), sum(len(c["text"]) for c in chunks)),
        )
        conn.execute("DELETE FROM chunks WHERE doc_id = ?", (doc_id,))
        for ch in chunks:
            conn.execute(
                """
                INSERT INTO chunks (id, topic_id, doc_id, source_name, source_type, page_num, section, location, text, tokens_json, vec_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ch["id"],
                    topic_id,
                    doc_id,
                    ch["source_name"],
                    ch["source_type"],
                    ch["page_num"],
                    ch["section"],
                    ch["location"],
                    ch["text"],
                    json.dumps(ch["tokens"]),
                    json.dumps(ch["vec"]),
                ),
            )

        all_rows = conn.execute(
            "SELECT id, doc_id, source_name, source_type, page_num, section, location, text, tokens_json FROM chunks WHERE topic_id = ?",
            (topic_id,),
        ).fetchall()
        all_chunks = [
            {
                "id": r["id"],
                "doc_id": r["doc_id"],
                "source_name": r["source_name"],
                "source_type": r["source_type"],
                "page_num": r["page_num"],
                "section": r["section"],
                "location": r["location"],
                "text": r["text"],
                "tokens": json.loads(r["tokens_json"]),
            }
            for r in all_rows
        ]
        keywords = extract_yake_and_textrank_keywords(all_chunks, top_k=12)
        mapped = build_topic_hierarchy_concepts_and_quizzes(topic_title, all_chunks, sections, stats, keywords)

        conn.execute(
            """
            INSERT OR REPLACE INTO topics (id, title, hierarchy_json, keywords_json, concepts_json, relationships_json, quiz_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                topic_id,
                topic_title,
                json.dumps(mapped["hierarchy"]),
                json.dumps(keywords),
                json.dumps(mapped["concepts"]),
                json.dumps(mapped["relationships"]),
                json.dumps(mapped["quiz"]),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "engine": "python-lightweight-nlp",
        "optionalLibs": {
            "pymupdf": fitz is not None,
            "yake": _yake is not None,
            "rank_bm25": _BM25Okapi is not None,
            "networkx": _nx is not None,
        },
        "chunks": [
            {
                "id": c["id"],
                "docId": c["doc_id"],
                "sourceName": c["source_name"],
                "sourceType": c["source_type"],
                "pageNum": c["page_num"],
                "section": c["section"],
                "location": c["location"],
                "text": c["text"],
                "tokens": c["tokens"],
            }
            for c in chunks
        ],
        "sections": sections,
        "keywords": keywords,
        "hierarchy": mapped["hierarchy"],
        "concepts": mapped["concepts"],
        "relationships": mapped["relationships"],
        "quiz": mapped["quiz"],
    }


def cmd_search(payload: Dict[str, Any]) -> Dict[str, Any]:
    topic_id = str(payload.get("topicId") or "")
    query = str(payload.get("query") or "")
    top_k = int(payload.get("topK") or 5)
    conn = get_db()
    try:
        return hybrid_search(conn, topic_id, query, top_k)
    finally:
        conn.close()


def cmd_get_topic(payload: Dict[str, Any]) -> Dict[str, Any]:
    topic_id = str(payload.get("topicId") or "")
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM topics WHERE id = ?", (topic_id,)).fetchone()
        if not row:
            return {"found": False}
        chunk_rows = conn.execute(
            "SELECT id, doc_id, source_name, source_type, page_num, section, location, text FROM chunks WHERE topic_id = ? ORDER BY page_num ASC, id ASC LIMIT 16",
            (topic_id,),
        ).fetchall()
        chunks = [
            {
                "id": cr["id"],
                "docId": cr["doc_id"],
                "sourceName": cr["source_name"],
                "sourceType": cr["source_type"],
                "pageNum": cr["page_num"],
                "section": cr["section"],
                "location": cr["location"],
                "text": cr["text"],
            }
            for cr in chunk_rows
        ]
        return {
            "found": True,
            "id": row["id"],
            "title": row["title"],
            "hierarchy": json.loads(row["hierarchy_json"]),
            "keywords": json.loads(row["keywords_json"]),
            "concepts": json.loads(row["concepts_json"]),
            "relationships": json.loads(row["relationships_json"]),
            "quiz": json.loads(row["quiz_json"]),
            "chunks": chunks,
        }
    finally:
        conn.close()


def cmd_delete_doc(payload: Dict[str, Any]) -> Dict[str, Any]:
    topic_id = str(payload.get("topicId") or "").strip()
    doc_id = str(payload.get("docId") or "").strip()
    if not doc_id:
        return {"deleted": False, "error": "docId is required"}
    conn = get_db()
    try:
        if topic_id:
            conn.execute("DELETE FROM chunks WHERE doc_id = ? AND topic_id = ?", (doc_id, topic_id))
            conn.execute("DELETE FROM documents WHERE id = ? AND topic_id = ?", (doc_id, topic_id))
        else:
            row = conn.execute("SELECT topic_id FROM documents WHERE id = ?", (doc_id,)).fetchone()
            if row:
                topic_id = row["topic_id"]
            conn.execute("DELETE FROM chunks WHERE doc_id = ?", (doc_id,))
            conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))

        if topic_id:
            rem_rows = conn.execute(
                "SELECT id, doc_id, source_name, source_type, page_num, section, location, text, tokens_json FROM chunks WHERE topic_id = ?",
                (topic_id,),
            ).fetchall()
            if not rem_rows:
                conn.execute("DELETE FROM topics WHERE id = ?", (topic_id,))
                conn.commit()
                return {"deleted": True, "topicId": topic_id, "remainingChunks": 0, "keywords": [], "hierarchy": [], "quiz": []}

            all_chunks = [
                {
                    "id": r["id"],
                    "doc_id": r["doc_id"],
                    "source_name": r["source_name"],
                    "source_type": r["source_type"],
                    "page_num": r["page_num"],
                    "section": r["section"],
                    "location": r["location"],
                    "text": r["text"],
                    "tokens": json.loads(r["tokens_json"]),
                }
                for r in rem_rows
            ]
            trow = conn.execute("SELECT title FROM topics WHERE id = ?", (topic_id,)).fetchone()
            topic_title = trow["title"] if trow else "Topic"
            keywords = extract_yake_and_textrank_keywords(all_chunks, top_k=12)
            sec_seen: Dict[str, List[str]] = defaultdict(list)
            for c in all_chunks:
                sec_seen[c.get("section") or "Overview"].append(c["text"])
            sections = [
                {"section": s, "chars": sum(len(x) for x in txts), "sample": " ".join(txts)[:180]}
                for s, txts in sec_seen.items()
            ]
            mapped = build_topic_hierarchy_concepts_and_quizzes(topic_title, all_chunks, sections, [], keywords)
            conn.execute(
                """
                INSERT OR REPLACE INTO topics (id, title, hierarchy_json, keywords_json, concepts_json, relationships_json, quiz_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    topic_id,
                    topic_title,
                    json.dumps(mapped["hierarchy"]),
                    json.dumps(keywords),
                    json.dumps(mapped["concepts"]),
                    json.dumps(mapped["relationships"]),
                    json.dumps(mapped["quiz"]),
                ),
            )
            conn.commit()
            return {
                "deleted": True,
                "topicId": topic_id,
                "remainingChunks": len(all_chunks),
                "keywords": keywords,
                "hierarchy": mapped["hierarchy"],
                "quiz": mapped["quiz"],
            }
        conn.commit()
        return {"deleted": True, "remainingChunks": 0}
    finally:
        conn.close()


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command (ingest|search|topic|delete_doc)"}))
        sys.exit(1)
    cmd = sys.argv[1]
    raw = sys.stdin.read() or "{}"
    payload = json.loads(raw)
    if cmd == "ingest":
        res = cmd_ingest(payload)
    elif cmd == "search":
        res = cmd_search(payload)
    elif cmd == "topic":
        res = cmd_get_topic(payload)
    elif cmd == "delete_doc":
        res = cmd_delete_doc(payload)
    else:
        res = {"error": f"Unknown command: {cmd}"}
    print(json.dumps(res))


if __name__ == "__main__":
    main()
