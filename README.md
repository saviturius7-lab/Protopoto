# Unlocked — Adaptive Learning Engine (Phase 1)

**Unlocked** is a non-AI adaptive learning engine prototype designed around one core principle: **everyone receives the activities they need to understand, remember, and apply a subject**—their learner archetype determines the *entry point, presentation format, and pacing*, not what they are allowed to learn.

This repository implements **Phase 1 (Non-AI Prototype)**, proving that personalisation, sequencing, spaced repetition, PDF text extraction, and rich visual representations work deterministically in pure client-side JavaScript before introducing optional LLM modules in later phases.

---

## Architecture: AI Optional, Not Compulsory

Unlocked separates deterministic personalisation from optional generative AI:

```
Student uploads a PDF (or selects a sample topic)
        │
        ▼
Local PDF.js Text Extraction  ──►  Knowledge-Unit Database
                                   (concepts, relationships, diagrams, quizzes)
        │                                  │
        └──────────────┬───────────────────┘
                       ▼
           Unlocked Personalisation Engine
    (8 archetypes + assessment profile + mastery + SRS)
                       │
                       ▼
              Deterministic Rules Engine
      (sequencing, scoring, SM-2 lite scheduling, templates)
                       │
                       ▼
           Personalised Learning Interface
   Diagram · Flowchart · Concept Map · Graph · Story · Sim
```

### Phase Roadmap
- **Phase 1 (Implemented Here — Zero AI Dependencies)**:
  - 24-question learner archetype assessment (`assessment.html`) with reverse-scored items, profile classification (`clear`, `blended`, `multi_style`, `flexible`), and persistent handoff to `index.html`.
  - 8 learner archetypes (`Builder`, `Architect`, `Sprinter`, `Explorer`, `Strategist`, `Deep Diver`, `Repeater`, `Guided Learner`), each with a 6-stage learning cycle.
  - Content classification engine mapping topic metadata (`process`, `structure`, `concept`, `quant`, `procedure`) to primary visual representations.
  - Client-side PDF upload and multi-page text extraction using **PDF.js**.
  - Structured **Knowledge-Unit Editor** (Concepts, Relationships, Quiz Questions, Topic Details, Source Text) persisted in `localStorage`.
  - **SM-2 lite** spaced-repetition flashcard review (`Again`, `Hard`, `Good`, `Easy`) with dynamic re-queuing and due-count tracking.
  - Adaptive rules banner on **My Quest** reacting to quiz accuracy, due SRS cards, and blended assessment profiles.
- **Phase 2 (Planned — AI-Assisted)**: Optional LLM module for automatic concept extraction from uploaded PDFs, multi-style explanations, draft quiz generation, and Socratic tutoring.
- **Phase 3 (Planned — Scalable Platform)**: Document chunking, semantic search, caching, usage limits, and source-grounding verification.

---

## Features & Screens

1. **Home (`index.html`)**: Select a pre-authored sample topic (*Photosynthesis*, *Newton's Second Law*, *Supply and Demand*) or pick one of the 8 archetypes. Displays a recommended archetype banner after completing the assessment.
2. **Learner Assessment (`assessment.html`)**: 24-question, 4-point Likert onboarding assessment measuring study preferences across all 8 archetypes, outputting a downloadable/copyable JSON profile and syncing directly to the main engine.
3. **Topic Library**: Browse sample and PDF-imported topics with per-topic mastery percentages.
4. **My Quest**: Shows current chapter completion ring, concept mastery bars, clickable 6-stage mission list, and live **Rules Engine Recommendations** (remedial, SRS review, blended-profile switch, or representation fit).
5. **Learning Cycle**: Interactive activity renderers including:
   - Labelled SVG diagrams
   - **Mermaid** process flowcharts & narrative timelines
   - **Vis.js** interactive concept maps & recall reconstruction mode
   - **Chart.js** quantitative graphs & mastery breakdowns
   - Interactive parameter-tuning simulations (*Greenhouse manager*, *Mission control*, *Market maker*)
   - Quizzes, retrieval flashcards, worked examples, guided fill-in-the-blanks, progressive hints, and self-explanation keyword checks
6. **Textbooks & Knowledge RAG (`Lightweight NLP + Hybrid RAG`)**: Multi-file upload and direct paste workspace backed by a Python NLP + SQLite engine (`backend/nlp_engine.py`, FastAPI service `backend/api.py`, and Express `/api/nlp/*` bridge):
   - **PDFs** (page-by-page extraction via **PDF.js** + optional **PyMuPDF**)
   - **Excel & CSV/TSV** (multi-sheet parsing via **SheetJS**, column min/max/mean/sum stats, row batching, and automatic **Chart.js** graph generation)
   - **Images & Stats** (canvas visual analysis for resolution/brightness/contrast/palette, local browser OCR via **Tesseract.js**, editable image notes, and numeric stat extraction; plus structured **JSON** stats)
   - **Text Processing & NLP Analysis**: De-hyphenation, page detection, heading/section splitting, **YAKE + TF-IDF + TextRank** keyphrase extraction, linguistic definition & entity detection, and **Topic Hierarchy** mapping.
   - **Hybrid Retrieval (SQLite)**: Combines **BM25** lexical ranking (`rank-bm25` / pure-Python BM25) with lightweight semantic vector cosine similarity stored in `backend/data/unlocked_rag.db`.
   - **Evidence-Validated Quiz Generation**: Template-based definition & cloze quiz generator attaching exact `pageRef` citations and supporting `evidence` quotes to every question.
7. **Knowledge-Unit Editor**: Create or customize concepts, directed relationships, quantitative **Data & Graph** series, multiple-choice quiz items, topic metadata, and source text.
8. **Review (SRS)**: Spaced-repetition deck with masked definitions, self-grading, XP rewards, and per-concept interval schedules.
9. **Progress Dashboard**: Tracks activity completion, immediate recall accuracy, projected delayed retention/transfer comparisons, and archetype vs. content representation alignment.

---

## Project Structure

```text
.
├── server.js                 # Express server (0.0.0.0:3000) + /api/nlp/* Python bridge
├── backend/
│   ├── nlp_engine.py         # Lightweight NLP (YAKE/TF-IDF/TextRank), SQLite Hybrid RAG & quiz generator
│   ├── api.py                # FastAPI Python API server exposing /api/nlp/* endpoints
│   └── requirements.txt      # Optional Python stack (FastAPI, PyMuPDF, NLTK, YAKE, spaCy, rank-bm25, NetworkX)
├── index.html                # Main adaptive learning engine UI & styles
├── assessment.html           # Standalone 24-question archetype assessment
├── data.js                   # Sample topics, 8 archetype journeys, representation rules
├── engine.js                 # State management, localStorage persistence, SRS, quest & quiz evidence UI
├── rag.js                    # Multi-modal extractors (PDF, Excel/CSV, Image OCR/stats, JSON) & RAG API client
├── renderers.js              # Activity renderers (SVG, Mermaid, Vis.js, Chart.js, Canvas sims)
├── features.js               # RAG workspace UI, Knowledge-Unit Editor, SRS UI, app init
├── src/assets/images/        # Matte-painting hero and topic illustrations
├── public/assets/aistudio/   # Reference landscape paintings
├── package.json              # Scripts (dev, start, lint, build) and Express/SheetJS dependencies
├── .env.example              # Default environment configuration (PORT=3000)
└── prototype_v0.html         # Original single-file v0 reference snapshot
```

---

## Getting Started

### Prerequisites
- Node.js 18+ (for Express server and syntax checks)
- Python 3.10+ (used automatically by `/api/nlp/*` for NLP extraction, SQLite indexing, and Hybrid RAG)

### Installation & Running Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

*(Optional)* To run the standalone Python FastAPI service directly or install optional heavy NLP libraries (`pymupdf`, `yake`, `spacy`, `rank-bm25`, `networkx`):

```bash
pip install -r backend/requirements.txt
uvicorn backend.api:app --reload --port 8000
```

### Available Scripts
- `npm run dev` — Starts the Express server on port `3000` (or `process.env.PORT`).
- `npm start` — Production start command (`node server.js`).
- `npm run lint` — Runs `node --check` syntax validation across `server.js`, `data.js`, `engine.js`, `rag.js`, `renderers.js`, and `features.js`.
- `npm run build` — Verifies all runtime scripts pass `node --check`.
