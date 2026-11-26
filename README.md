# Unlocked — Adaptive Learning Engine

> **Unlocked** turns any textbook, dataset, or diagram into an adaptive, visual, and source-grounded learning journey tailored to how each student learns best.

The repository is named **Protopoto**, and the application is branded **Unlocked**.

---

## Pitch

Every student learns differently, yet almost all study material arrives as the same static PDF or spreadsheet. **Unlocked** bridges that gap. It pairs a 24-question learner-preference assessment with local multi-modal document extraction, hybrid retrieval, and interactive visualizers to turn raw study files into personalized six-stage learning cycles—complete with page-cited quizzes, concept graphs, and spaced repetition. It runs deterministically out of the box with local Python NLP and SQLite, and optionally layers cloud AI inference on top without lock-in.

## Problem Statement

Modern learning materials are built for distribution, not comprehension. Dense textbooks, scattered slides, and raw datasets deliver the same static wall of content to every student—forcing diverse learners into passive reading instead of active, lasting understanding.

- **What problem are we addressing?** The disconnect between how study material is packaged (static, linear documents) and how people actually learn (through varied entry points, visual intuition, active recall, and spaced practice).
- **Who faces this problem?** Students, self-learners, and educators who spend hours manually turning dense PDFs, spreadsheets, and diagrams into structured notes, mental models, and reliable practice questions.
- **Why does it matter?** When study tools ignore how a learner approaches complex material—or rely on unverified summaries—learners mistake familiarity for mastery, lose engagement, and quickly forget what they studied.

## Proposed Solution

**Unlocked** transforms static study files into an adaptive, interactive learning cycle tailored to how each person thinks—combining deterministic learning design, multi-modal extraction, and strictly source-grounded retrieval.

- **In simple terms:** A learner completes a short preference assessment, uploads their study materials (PDFs, spreadsheets, images, or notes), and **Unlocked** organizes the material into concept maps, interactive simulations, evidence-cited quizzes, and spaced-repetition flashcards across a six-stage learning cycle.
- **How it addresses the problem:**
  1. **Adapts the path, never the depth:** Eight learner archetypes shape *how* and *in what order* a topic is introduced while ensuring every learner completes all core activities required for mastery.
  2. **Turns passive files into active knowledge:** Extracts text, tables, and visual stats from uploaded files to build editable concepts, relationships, charts, and page-cited quiz drafts.
  3. **Closes the retention loop:** Reinforces long-term memory through SM-2 spaced repetition, progressive hints, and mastery tracking.
- **What makes it different?** Unlike opaque AI chat wrappers, **Unlocked** is deterministic at its core—running document chunking, NLP extraction, BM25 + hashed-vector hybrid search, and personalization locally on SQLite—while keeping optional LLM/vision/image-generation upgrades behind server-side fallback routes.

---

This README describes the implementation currently present in the repository, distinguishing working prototype features from planned work and explaining how the browser, Node.js server, Python NLP engine, and SQLite database fit together.

## 1. What the project does

Unlocked is intended to help a learner study material in different ways rather than presenting every learner with the same sequence of activities.

The application currently provides:

- A 24-question learner-preference assessment.
- Eight learner archetypes and a six-stage learning cycle.
- Three built-in sample topics.
- A topic library and per-topic progress tracking.
- Interactive explanations, diagrams, flowcharts, concept maps, graphs, quizzes, worked examples, recall activities, and small simulations.
- PDF, spreadsheet, image, JSON, text, and Markdown ingestion.
- Browser-side text extraction and OCR for supported files.
- A lightweight NLP pipeline that identifies candidate concepts, keywords, sections, relationships, and quiz questions.
- Local retrieval using BM25, with a Python hybrid BM25 + hashed text-vector search option.
- A knowledge-unit editor for changing concepts, relationships, graphs, topic details, source text, and quiz questions.
- Spaced-repetition flashcard review and a progress dashboard.

The application is a prototype, not a validated learning-science product. Its learner archetypes are preference-based personalization categories; they should not be interpreted as fixed scientific learning styles or as limits on what a learner can study.

## 2. What is and is not AI

**The current application does not call an LLM or an external AI inference API.**

Its current content-processing and quiz-generation logic is deterministic/statistical:

- Text is cleaned, split into sections and chunks, and tokenized.
- Keyphrases are ranked using YAKE when installed, otherwise a built-in TF-IDF/TextRank-style implementation.
- Concepts and relationships are proposed using linguistic patterns and co-occurrence in source text.
- Retrieval uses BM25 plus a fixed-size hashed word/character n-gram vector.
- Quiz questions are assembled from templates, extracted concepts, relationships, text passages, and numeric statistics.

The Python vector is **not** a transformer embedding and is not produced by a trained neural model. It is a lightweight hashed feature vector. The system therefore does not provide the semantic understanding or open-ended reasoning of an LLM.

The planned AI-assisted phase is not implemented in this repository's current workflow. Do not assume that PDF uploads are automatically understood with human-level accuracy: the extraction and pattern-matching stages can miss concepts, misidentify headings, or produce weak questions.

## 3. Architecture and data flow

The application has three main runtime parts:

1. Browser frontend — HTML, CSS, and classic JavaScript files.
2. Node.js / Express server — serves the frontend and provides an API bridge to Python.
3. Python NLP engine — processes extracted text, indexes chunks in SQLite, and returns analysis and retrieval results.

### Upload and indexing flow

```text
User selects files or pastes source text
                 |
                 v
       Browser extraction layer
       - PDF.js: PDF text by page
       - SheetJS: Excel / CSV / TSV
       - Tesseract.js: image OCR
       - Browser parsing: JSON / TXT / MD
                 |
                 v
       Local topic state and chunks
                 |
                 v
       POST /api/nlp/ingest
                 |
                 v
       Express starts nlp_engine.py
                 |
                 v
       Python processing
       - clean and split text
       - detect sections
       - create overlapping chunks
       - extract keywords / concepts
       - infer candidate relationships
       - draft evidence-linked quiz items
       - create hashed text vectors
                 |
                 v
       SQLite database
       backend/data/unlocked_rag.db
                 |
                 v
       Browser receives the analysis
       and merges it into the topic editor
```

### Search flow

The browser sends a topic ID and query to `POST /api/nlp/search`. Express starts the Python script with the `search` command. Python retrieves that topic's chunks from SQLite and ranks them using:

- BM25 lexical relevance.
- Cosine similarity over the fixed-size hashed word/character n-gram vectors.
- A small exact-phrase boost.

The current Python hybrid score weights normalized BM25 at 65% and the vector similarity at 35%, with the phrase boost added separately.

If the Python request fails or returns no results, the browser falls back to its own in-memory BM25 search over the topic's browser-side chunks. That fallback is lexical retrieval, not the Python hybrid search.

## 4. Repository layout

```text
.
├── index.html                 # Main application interface
├── assessment.html            # Standalone learner assessment
├── data.js                    # Sample topics, journeys, and content data
├── engine.js                  # App state, progress, mastery, SRS, and screens
├── rag.js                     # Browser extraction, chunking, and retrieval
├── renderers.js               # Diagrams, charts, simulations, and activities
├── features.js                # Upload workspace, editor, SRS UI, and app wiring
├── server.js                  # Express static server and Python API bridge
├── backend/
│   ├── api.py                 # Optional standalone FastAPI wrapper
│   ├── nlp_engine.py          # NLP, indexing, quiz drafting, and hybrid search
│   ├── requirements.txt       # Python dependencies for optional API / NLP extras
│   └── data/                  # Created at runtime; SQLite database is stored here
├── public/assets/aistudio/    # Reference artwork
├── src/assets/images/         # Topic and interface images
├── prototype_v0.html          # Earlier single-file prototype
├── package.json               # Node scripts and dependencies
└── .env.example               # Example PORT setting
```

The JavaScript files are loaded as classic scripts in this order: `data.js`, `engine.js`, `rag.js`, `renderers.js`, and `features.js`. They share globals; they are not currently organized as ES modules.

## 5. Requirements

Required for the normal Express application:

- Node.js 18 or newer.
- npm.
- Python 3 available as the `python3` command for the NLP bridge.
- A modern browser with JavaScript and localStorage enabled.

The normal Express-to-Python path uses Python's standard library for its core processing and SQLite storage. Optional Python packages improve or extend selected operations:

- `yake` — optional YAKE keyphrase extraction.
- `rank-bm25` — optional BM25 implementation; a pure-Python fallback exists.
- `networkx` — optional graph-degree metadata.
- `pymupdf` — imported as an optional package, but browser PDF extraction is performed by PDF.js.

The current `backend/requirements.txt` also lists FastAPI, Uvicorn, NLTK, spaCy, scikit-learn, and sentence-transformers. Those packages are not required by the standard Express bridge, and the current NLP engine does not use sentence-transformers to create embeddings.

## 6. Run locally

Clone the repository and enter its directory:

```bash
git clone https://github.com/saviturius7-lab/Protopoto.git
cd Protopoto
```

Install Node dependencies:

```bash
npm install
```

Start the application:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The server binds to `0.0.0.0` and uses port `3000` by default. Set the `PORT` environment variable to change the port.

For example:

```bash
# macOS / Linux
PORT=4000 npm run dev

# PowerShell
$env:PORT=4000
npm run dev
```

The Python bridge starts `python3 backend/nlp_engine.py <command>` as a child process for each NLP request. Make sure the `python3` executable is available on the server's PATH. The bridge currently applies a 30-second timeout to each Python process.

## 7. Optional Python setup

The Express application does not need the standalone FastAPI server. It invokes the Python engine directly.

To install the dependencies listed by the repository:

```bash
python -m pip install -r backend/requirements.txt
```

To run the separate FastAPI wrapper:

```bash
uvicorn backend.api:app --reload --host 0.0.0.0 --port 8000
```

The FastAPI wrapper exposes:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/nlp/ingest` | Index supplied pages and stats |
| POST | `/api/nlp/search` | Search a topic |
| GET | `/api/nlp/topic/{topic_id}` | Retrieve stored topic analysis |

The Express server exposes its own corresponding NLP endpoints under `/api/nlp/*`. The frontend is configured to call the Express endpoints on the same origin; starting FastAPI separately does not automatically redirect the frontend to port 8000.

## 8. Main features and how to use them

### Learner assessment

Open the assessment from the application or visit `assessment.html`. It contains 24 questions, uses reverse-scored items, and calculates a preference profile. The resulting profile is saved to the same browser's `localStorage` and handed back to the main application.

The eight archetypes are:

- Builder
- Architect
- Sprinter
- Explorer
- Strategist
- Deep Diver
- Repeater
- Guided Learner

The assessment can classify a result as clear, blended, multi-style, or flexible. The profile changes recommendations and activity entry points; it does not lock activities or topics.

### Six-stage learning cycle

The main journey uses these stages:

1. Discover
2. Orient
3. Understand
4. Interact
5. Retrieve
6. Revisit

The exact activities and their presentation depend on the selected topic, its content metadata, and the learner profile.

### Built-in topics

The sample library currently includes:

- Photosynthesis
- Newton's Second Law
- Supply and Demand

These are pre-authored examples. Imported material is added as a custom topic or attached to an existing topic.

### Textbooks and knowledge workspace

The upload workspace supports multiple files and pasted text. The browser-side extractors currently handle:

- PDF: page-by-page text extraction with PDF.js. Image-only/scanned PDFs may not yield usable text unless OCR is applied to image files separately.
- Excel, CSV, and TSV: workbook/sheet parsing with SheetJS, numeric column summaries, and chart data.
- Images: browser canvas-based image statistics and OCR through Tesseract.js when available.
- JSON: structured numeric/statistical values.
- TXT and Markdown: plain text extraction.
- Pasted text or CSV-like content: parsed in the browser and added to the selected topic.

The original uploaded file is not uploaded to a file-storage service by the current code. The browser extracts text and derived data, then sends extracted page text and statistics to the Python API.

### Knowledge extraction and quiz drafting

The Python pipeline can return:

- Detected sections and page locations.
- Keyphrases.
- Candidate concepts with source, page/section, and evidence text.
- Candidate directed relationships when two concepts appear together in a sentence with a recognized relationship verb.
- A topic hierarchy.
- Template-generated multiple-choice and cloze questions.
- Numeric questions for detected spreadsheet statistics.

The generator is heuristic. It can produce fewer questions than expected, miss important terms, choose poor distractors, or infer a relationship incorrectly. Every generated question should be reviewed before being treated as a reliable assessment item.

### Retrieval workspace

Enter a query to retrieve relevant chunks and matching extracted statistics. Results display source names and locations where available. The interface can turn a retrieved passage into a concept or a quiz draft; these are added to the topic and can be edited.

### Knowledge-unit editor

The editor allows users to review and modify the topic's concepts, relationships, quiz questions, topic details, source text, and graph data. This is important because automatically extracted content is only a draft.

### Spaced repetition and progress

The review area provides flashcards with Again, Hard, Good, and Easy grading. Review intervals and learner progress are stored locally in the browser. The dashboard displays activity completion, quiz performance, mastery, and estimated retention/transfer indicators. These dashboard indicators are prototype calculations, not results from a controlled learning study.

## 9. Data storage and privacy boundaries

There are two separate persistence locations.

### Browser storage

The frontend uses the browser's `localStorage` key:

```text
unlocked_phase1_v1
```

It stores application state such as:

- Learner archetype and assessment profile.
- Active topic and custom topics.
- Topic edits, concepts, quizzes, and relationships.
- Imported source text, extracted chunks, and document metadata.
- Progress, mastery, XP, plans, and SRS schedules.

This data belongs to the browser profile and origin where the application is running. It is not automatically synchronized across browsers or devices. Clearing site data or using another browser/profile can make it unavailable. The application includes a quota fallback that trims some large source text and image thumbnails, but browser storage is still limited.

### Python SQLite storage

The Python engine creates its database at:

```text
backend/data/unlocked_rag.db
```

You can override this location with the `UNLOCKED_DB_PATH` environment variable.

SQLite stores topic metadata, document records, text chunks, token lists, and serialized hashed vectors, along with extracted hierarchy, keywords, concepts, relationships, and quiz drafts. The database is created automatically when the NLP engine first runs.

The uploaded original file is not stored as a binary in SQLite; extracted text and derived records are stored instead. The Python database is local to the machine running the server unless that machine's storage is separately shared or backed up.

This is a local prototype, not a multi-user hosted service. The current code does not implement user accounts, authentication, per-user authorization, or cloud synchronization. Do not expose an instance containing private study material to an untrusted network without adding appropriate access controls.

## 10. External browser assets and offline behaviour

The server can run locally, but the frontend references several libraries from public CDNs, including PDF.js, Vis.js, Chart.js, Mermaid, D3, and Tesseract.js. It also loads web fonts externally. SheetJS is served from the locally installed npm dependency.

Consequently, the application is **not guaranteed to work fully offline on a fresh load**. Some features may fail or be unavailable when CDN assets, OCR worker files, or fonts cannot be downloaded. To make it reliably offline, vendor and serve all required scripts, workers, and language data locally, then test with the network disabled.

## 11. Available npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the Express server |
| `npm start` | Starts the Express server for a normal start |
| `npm run lint` | Runs Node syntax checks on the main JavaScript files |
| `npm run build` | Runs the same JavaScript syntax checks; it is not a bundling or production compilation step |

There is no frontend bundler or transpilation step in the current package scripts.

## 12. Known limitations and areas to improve

- Concept extraction and relationship detection rely on text patterns and can miss context or produce false positives.
- Quiz generation uses templates and heuristic distractors; it is not a semantic question-answering model.
- The hashed n-gram vectors are lightweight retrieval features, not learned embeddings.
- Client-side BM25 fallback is lexical and may return different results from Python hybrid search.
- PDF.js extracts selectable text; scanned/image-only PDFs need OCR support that is not currently integrated into the PDF pipeline.
- Browser localStorage has size limits and is not a robust document database.
- Express starts a new Python process for each NLP operation, adding process-start overhead.
- The Python bridge uses a fixed 30-second timeout and has no job queue for large documents.
- The backend has no authentication, per-user data separation, or hosted database layer.
- External CDN dependencies prevent a guaranteed offline experience.
- The learner archetypes and dashboard retention estimates have not been scientifically validated.

## 13. Roadmap

The following are future directions, not claims about the current implementation:

- Optional LLM-assisted concept extraction, explanation generation, quiz drafting, and Socratic tutoring.
- Stronger source-grounding and question validation.
- More robust document chunking, indexing, and caching.
- Better OCR support for scanned PDFs.
- User accounts, data isolation, and a scalable persistence layer.
- Evaluation of recommendation quality and learning outcomes with real users.

## 14. Troubleshooting

**The page opens but upload or visual features do not work**

Check the browser console and network tab. Confirm that CDN scripts loaded successfully and that the Express server is serving `/vendor/xlsx/xlsx.full.min.js`.

**The Python NLP request fails**

Confirm that `python3 --version` works in the same environment that starts Node. Check the terminal output from Express for Python errors. The browser may silently fall back to client-side BM25 when backend ingestion or search fails.

**No Python results appear after upload**

Check that the request reaches `/api/nlp/ingest`, that the Python process exits successfully, and that `backend/data/unlocked_rag.db` can be created and written. Very large inputs may exceed the 30-second process timeout.

**The same topic behaves differently in another browser**

The browser-side topic state is stored in localStorage and is not synchronized. The SQLite database is stored on the server machine; these are separate stores.

**The uploaded PDF produces little or no text**

The current PDF extractor reads the PDF's text layer. A scanned page made only of pixels may need OCR before it can be indexed.

---

## Project status

Unlocked is a working prototype with a browser learning interface, local extraction tools, a Node-to-Python bridge, and SQLite-backed NLP retrieval. It is not yet a production-ready learning platform, and its automatically generated concepts and quizzes require human review.
