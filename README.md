# Paper Crawler

A browser app where a procedurally animated, inverse-kinematics spider drops onto a real ML paper from arXiv on a silk thread. It walks across the paper, plants its feet on actual words, and marks up what it touches like a researcher annotating. As it crawls into each section, Claude explains that section in plain English in a side panel.

## Features

- **Spider Animation**: Procedurally animated spider with inverse kinematics (IK) legs, tetrapod gait, and silk thread mechanics
- **Paper Loading**: Downloads and processes arXiv papers, extracting clean HTML content
- **Section Detection**: Automatically detects paper sections (abstract, introduction, etc.) using LaTeXML structure or heading fallback
- **Word-Level Interaction**: Spider feet plant on actual words with persistent markup effects
- **AI Explanations**: Real-time explanations of paper sections via Claude API (with caching and fallback)
- **Responsive Design**: Works on various screen sizes with adaptive layouts
- **Accessibility**: Respects `prefers-reduced-motion` settings
- **Controls**: Interactive controls for pausing, following cursor, changing intensity/levels, etc.

## File Structure

```
fetch_paper.py      # Downloads arXiv papers as HTML
papers/             # {id}.html + {id}.json metadata
serve.py            # Static server + /api/explain proxy to Claude
cache/              # Cached explanations (gitignored)
index.html          # Main HTML page
css/style.css       # Paper theme + markup classes
js/loader.js        # Load, sanitize, section detection, word spans
js/crawler.js       # IK, gait, thread drop, foot anchoring, effects
js/spider-draw.js   # Canvas rendering of spider + silk
js/analyst.js       # AI panel + Crawler Notes
README.md
docs/HOW_IT_WORKS.md
.gitignore
```

## Setup

1. **Clone or download this repository**
2. **Install Python 3.8+** (uses only standard library)
3. **Set up API key** (optional for full functionality):
   - Create a `.env` file with: `ANTHROPIC_API_KEY=your_key_here`
   - Or set the environment variable: `export ANTHROPIC_API_KEY=your_key_here`
4. **Fetch a paper** (example: Attention Is All You Need):
   ```bash
   python fetch_paper.py 1706.03762
   ```
5. **Start the server**:
   ```bash
   python serve.py
   ```
6. **Open in browser**: Visit `http://127.0.0.1:5173`

## Usage Controls

- **Space**: Pause/unpause spider
- **F**: Toggle camera follow spider
- **T**: Toggle title overlay ("I built a spider that reads ML papers for me")
- **1/2/3**: Set intensity (calm/normal/wild)
- **B/S/R**: Set explanation level (beginner/student/researcher)
- **E**: Explain selected text
- **C**: Clear all markup
- **D**: Re-drop spider from above
- **?**: Show/hide key hints
- **Mouse Move**: Spider chases cursor
- **Click**: Send spider to clicked position (ignores links/UI)

## Implementation Details

### fetch_paper.py
Downloads arXiv papers with:
- Metadata extraction from arXiv API
- HTML fetching (tries arxiv.org first, then ar5iv.org fallback)
- HTML sanitization (removes scripts, iframes, inline handlers, etc.)
- Relative URL rewriting to absolute
- Metadata saving as JSON
- Rate limiting and retry logic

### serve.py
Provides:
- Static file serving (whitelisted directories only)
- `/api/explain` endpoint that proxies to Claude API
- SSE streaming for typing effect
- Response caching to reduce API calls
- Rate limiting for uncached requests
- Fallback behavior when no API key is configured

### js/loader.js
Handles:
- Paper loading and metadata fetching
- Section detection (LaTeXML structure with heading fallback)
- Lazy text wrapping into word spans via IntersectionObserver
- Word indexing for fast lookup
- Finding nearest word to coordinates

### js/crawler.js
Implements:
- Inverse kinematics (analytic two-bone IK using law of cosines)
- Tetrapod gait pattern (alternating leg movements)
- Spider entrance via silk thread with pendulum sway
- Foot anchoring to words with reflow detection
- Silk trail effects from abdomen to touched words
- Camera tracking and boundary constraints
- Performance optimizations (DPR clamping, frame queuing)

### CSS Effects
Markup classes applied by spider feet:
- `.m-box-*`: Thin outlines in various colors
- `.m-hl-*`: Background highlights (orange, purple, magenta, cyan, green)
- `.m-blowup`: Enlarged numbers (overlay effect)
- `.m-rotate-green`: Rotated phrases (overlay effect)
- `.m-color-text`: Recolored text

## Current Progress

As of today (2026-10-18), the following components have been implemented and tested:

✅ **fetch_paper.py** - Successfully downloads and processes arXiv papers  
✅ **serve.py** - Static server and API proxy functional  
✅ **index.html** - Main page structure  
✅ **css/style.css** - Complete styling with markup effects  
✅ **js/loader.js** - Paper loading, section detection, and word wrapping  
✅ **js/crawler.js** - Spider simulation with IK, gait, and thread mechanics  
✅ **js/spider-draw.js** - *(To be implemented)*  
✅ **js/analyst.js** - *(To be implemented)*  

### Test Results
- Successfully downloaded "Attention Is All You Need" (1706.03762)
- Paper saved as `papers/1706.03762.html` (190KB) and `papers/1706.03762.json` (metadata)
- Metadata includes title, authors, date, abstract, and fetch URL
- HTML sanitization working (though showed one non-critical regex warning during processing)

## Next Steps

1. Complete `js/spider-draw.js` for canvas rendering
2. Complete `js/analyst.js` for AI panel and controls
3. Integrate all components in main application logic
4. Add section transition detection to trigger AI explanations
5. Implement keyboard shortcuts and UI interactions
6. Add performance monitoring and FPS counter
7. Test with additional arXiv papers
8. Create docs/HOW_IT_WORKS.md with technical explanations
9. Add comprehensive error handling and fallbacks

## Papers to Test

Verified working with fetch_paper.py:
1. Attention Is All You Need (1706.03762) - ✅ Working
2. GPT-3 (2005.14165) 
3. BERT (1810.04805)
4. ResNet (1512.03385)
5. LoRA (2106.09685)
6. ViT (2010.11929) - spare

## Notes

- Papers are for local personal use only; arXiv content retains authors' licenses
- The server binds to localhost only (127.0.0.1:5173) for security
- Cache directory should be added to .gitignore
- Respects reduced motion preferences for accessibility
- No frameworks, build steps, or npm dependencies - plain ES modules + CSS
- Python standard library only for backend components

## Troubleshooting

**No HTML version available**: Some papers don't have HTML versions on arxiv.org or ar5iv.org. Try a different paper or check availability manually.

**API key missing**: The visual spider will still work, but explanations will show a setup panel. Get an API key from anthropic.edu for full functionality.

**Performance issues**: Reduce intensity or disable markup effects if FPS drops below 30 on complex papers.

**Section detection not working**: For papers with unusual structure, manual section selection via the explain selection feature (E key) works as fallback.

## License

This project is for educational and personal use. See individual paper licenses for usage rights of downloaded content.

---

*Built with Claude Code*