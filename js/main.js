// main.js - Main application coordinator
// Initializes and coordinates all components of the Paper Crawler

class PaperCrawlerApp {
    constructor() {
        // Initialize components
        this.paperLoader = new PaperLoader();
        this.analystPanel = window.analystPanel || new AnalystPanel();

        // State
        this.currentPaperId = null;
        this.spiderCrawler = null;
        this.isInitialized = false;

        // Configuration
        this.DEFAULT_PAPER_ID = '1706.03762'; // Attention Is All You Need
        this.INTENSITY_LEVELS = { calm: 0.5, normal: 1.0, wild: 2.0 };
        this.currentIntensity = 'normal';
        this.currentLevel = 'student';

        // Bind events
        this.bindCustomEvents();

        // Start initialization
        this.init();
    }

    async init() {
        try {
            // Load default paper
            await this.loadPaper(this.DEFAULT_PAPER_ID);

            // Setup canvas and spider
            await this.setupSpider();

            // Start animation loop
            this.startAnimationLoop();

            this.isInitialized = true;
            console.log('Paper Crawler initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Paper Crawler:', error);
            this.showError('Failed to initialize application. See console for details.');
        }
    }

    async loadPaper(paperId) {
        try {
            console.log(`Loading paper: ${paperId}`);
            this.currentPaperId = paperId;

            // Load paper data
            const paperData = await this.paperLoader.loadPaper(paperId);

            // Detect sections
            this.paperLoader.detectSections();

            // Wrap text nodes (lazy wrapping will happen as needed)
            const paperView = document.getElementById('paper-view');
            this.paperLoader.wrapTextNodes(paperView);

            // Update paper metadata in UI
            this.updatePaperMetadata(paperData.metadata);

            // Reset spider for new paper
            if (this.spiderCrawler) {
                this.spiderCrawler.resetSpider();
            }

            // Initial explanation (abstract/TL;DR)
            this.triggerSectionExplanation('Abstract', 'abstract', 0);

            return paperData;
        } catch (error) {
            console.error(`Failed to load paper ${paperId}:`, error);
            throw error;
        }
    }

    async setupSpider() {
        const canvas = document.getElementById('spider-canvas');
        if (!canvas) {
            throw new Error('Spider canvas not found');
        }

        // Initialize spider crawler
        this.spiderCrawler = new SpiderCrawler(canvas, this.paperLoader);

        // Set canvas size
        this.spiderCrawler.onResize();

        // Setup resize listener
        window.addEventListener('resize', () => {
            this.spiderCrawler.onResize();
        });

        console.log('Spider crawler setup complete');
    }

    startAnimationLoop() {
        let lastTimestamp = 0;

        const animate = (timestamp) => {
            if (!lastTimestamp) lastTimestamp = timestamp;
            const deltaTime = timestamp - lastTimestamp;
            lastTimestamp = timestamp;

            // Update and draw spider if initialized
            if (this.spiderCrawler && this.isInitialized) {
                // Get paper view rectangle for boundary checking
                const paperView = document.getElementById('paper-view');
                const paperRect = paperView.getBoundingClientRect();

                // Update spider state
                this.spiderCrawler.update(deltaTime, paperRect);
                this.spiderCrawler.draw();
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    bindCustomEvents() {
        // Listen for custom events from analyst panel
        document.addEventListener('toggle-title-overlay', () => this.toggleTitleOverlay());
        document.addEventListener('clear-markup', () => this.clearMarkup());
        document.addEventListener('redrop-spider', () => this.redropSpider());
        document.addEventListener('explain-selection', () => this.explainSelection());
        document.addEventListener('set-intensity', (e) => this.setIntensity(e.detail));
        document.addEventListener('set-level', (e) => this.setLevel(e.detail));
        document.addEventListener('toggle-follow', () => this.toggleFollow());
        document.addEventListener('toggle-pause', () => this.togglePause());

        // Override analyst panel placeholder methods with real implementations
        this.analystPanel.highlightKeyPhrase = (phrase) => this.highlightKeyPhrase(phrase);
        this.analystPanel.scrollToSection = (sectionTitle) => this.scrollToSection(sectionTitle);
    }

        // Listen for keyboard shortcuts that bypass analyst panel
        document.addEventListener('keydown', (e) => {
            // Skip if modifier keys are held or focus is in input
            if (e.ctrlKey || e.metaKey || e.altKey ||
                e.target.tagName === 'INPUT' ||
                e.target.tagName === 'TEXTAREA' ||
                e.target.isContentEditable === true) {
                return;
            }

            switch (e.code) {
                case 'KeyP':
                    // Paper selector - could open a UI to change papers
                    this.showPaperSelector();
                    break;
                case 'KeyH':
                    // Show help/key hints
                    this.toggleKeyHints();
                    break;
                case 'Backquote':
                    // Toggle debug mode
                    this.toggleDebug();
                    break;
            }
        });
    }

    // Event handler implementations
    toggleTitleOverlay() {
        const titleOverlay = document.getElementById('title-overlay') || this.createTitleOverlay();
        titleOverlay.classList.toggle('active');
    }

    createTitleOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'title-overlay';
        overlay.textContent = TITLE_TEXT || "I built a spider that reads ML papers for me";
        document.body.appendChild(overlay);
        return overlay;
    }

    clearMarkup() {
        // Remove all markup overlays
        const markupLayer = document.getElementById('markup-layer');
        if (markupLayer) {
            markupLayer.innerHTML = '';
        }

        // Remove all markup classes from word spans
        document.querySelectorAll('span.w').forEach(span => {
            span.className = span.className.replace(/\b-m-\S+/g, '');
        });

        console.log('Markup cleared');
    }

    redropSpider() {
        if (this.spiderCrawler) {
            this.spiderCrawler.resetSpider();
            console.log('Spider redropped');
        }
    }

    explainSelection() {
        // Get current selection
        const selection = window.getSelection();
        if (!selection.isCollapsed) {
            const selectedText = selection.toString().trim();
            if (selectedText.length > 10) { // Minimum length for meaningful explanation
                this.explainText(selectedText, 'selection');
            }
        }
    }

    setIntensity(intensity) {
        if (this.INTENSITY_LEVELS[intensity] !== undefined) {
            this.currentIntensity = intensity;
            // Update crawler configuration
            if (this.spiderCrawler) {
                // This would update internal crawler parameters based on intensity
                console.log(`Intensity set to: ${intensity}`);
            }
        }
    }

    setLevel(level) {
        if (['beginner', 'student', 'researcher'].includes(level)) {
            this.currentLevel = level;
            console.log(`Explanation level set to: ${level}`);
            // Re-request explanation for current section if needed
        }
    }

    toggleFollow() {
        if (this.spiderCrawler) {
            this.spiderCrawler.isFollowingCursor = !this.spiderCrawler.isFollowingCursor;
            console.log(`Follow cursor: ${this.spiderCrawler.isFollowingCursor}`);
        }
    }

    togglePause() {
        if (this.spiderCrawler) {
            this.spiderCrawler.isPaused = !this.spiderCrawler.isPaused;
            console.log(`Paused: ${this.spiderCrawler.isPaused}`);
        }
    }

    showPaperSelector() {
        // TODO: Implement paper selector UI
        alert('Paper selector not implemented yet. Change paper by modifying DEFAULT_PAPER_ID in main.js');
    }

    toggleKeyHints() {
        const keyHint = document.getElementById('key-hint');
        if (keyHint) {
            keyHint.classList.toggle('active');
        }
    }

    toggleDebug() {
        if (this.spiderCrawler) {
            // Toggle debug mode in crawler
            // This would need to be added to SpiderCrawler class
            console.log('Debug mode toggle not fully implemented');
        }
    }

    // Section explanation triggering
    triggerSectionExplanation(sectionTitle, sectionSlug, level) {
        if (!this.currentPaperId) return;

        // Get paper metadata for title
        fetch(`/api/papers/${this.currentPaperId}`)
            .then(response => response.json())
            .then(metadata => {
                // Get approximate text for this section
                // In a full implementation, we'd extract the actual section text
                const sectionText = this.getSectionText(sectionSlug, level);

                // Request explanation from API
                this.requestExplanation({
                    paperId: this.currentPaperId,
                    title: metadata.title,
                    section: sectionTitle,
                    sectionSlug: sectionSlug,
                    level: this.currentLevel || level,
                    text: sectionText,
                    mode: 'section'
                });
            })
            .catch(error => {
                console.error('Failed to get paper metadata:', error);
            });
    }

    getSectionText(sectionSlug, level) {
        // Find the section with matching slug and return its text
        const section = this.paperLoader.sections.find(sec => sec.slug === sectionSlug);
        if (section) {
            return section.text;
        }
        // Fallback if section not found
        return `Section content for ${sectionSlug} not found.`;
    }

    requestExplanation(data) {
        // Show loading state in analyst panel
        this.analystPanel.setExplanation('Loading explanation...', '');

        fetch('/api/explain', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.body;
        })
        .then(body => {
            const reader = body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedText = '';

            function processStream() {
                return reader.read().then(({done, value}) => {
                    if (done) {
                        // Stream complete
                        const fullText = accumulatedText;
                        // Extract KEY phrase if present
                        const keyPhraseMatch = fullText.match(/KEY:\s*([^\n]+)/);
                        const keyPhrase = keyPhraseMatch ? keyPhraseMatch[1].trim() : '';
                        const explanationText = fullText.replace(/KEY:\s*[^\n]*/, '').trim();

                        this.analystPanel.setExplanation(explanationText, keyPhrase);

                        // If we have a key phrase, highlight it and move spider to it
                        if (keyPhrase) {
                            this.highlightAndNavigateToKeyPhrase(keyPhrase);
                        }

                        // Add to history
                        this.analystPanel.addToHistory(data.section, explanationText);
                        return;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    accumulatedText += chunk;
                    this.analystPanel.appendExplanationChunk(chunk);

                    return processStream();
                });
            }

            return processStream();
        })
        .catch(error => {
            console.error('Failed to get explanation:', error);
            this.analystPanel.setExplanation(
                'Failed to load explanation. Check API connection.',
                'Error'
            );
        });
    }

    highlightAndNavigateToKeyPhrase(keyPhrase) {
        // Search for the key phrase in word spans
        const wordSpans = this.paperLoader.wordSpans;
        if (!wordSpans || wordSpans.length === 0) return;

        // Simple text matching (could be enhanced with fuzzy matching)
        let foundIndex = -1;
        let accumulatedText = '';

        for (let i = 0; i < wordSpans.length; i++) {
            accumulatedText += wordSpans[i].textContent + ' ';
            if (accumulatedText.trim().includes(keyPhrase.trim())) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex !== -1) {
            // Found the word - command spider to move to it
            const wordSpan = wordSpans[foundIndex];
            if (wordSpan) {
                const rect = wordSpan.getBoundingClientRect();
                const docX = rect.left + window.scrollX;
                const docY = rect.top + window.scrollY;

                // Calculate center of the word
                const targetX = docX + rect.width / 2;
                const targetY = docY + rect.height / 2;

                // Command spider to move to this position
                if (this.spiderCrawler) {
                    this.spiderCrawler.setTargetPosition(targetX, targetY);
                }

                // Also highlight it visually
                this.highlightWordSpan(foundIndex, keyPhrase);
            }
        }
    }

    highlightWordSpan(wordIndex, phrase) {
        const wordSpan = this.paperLoader.wordSpans[wordIndex];
        if (!wordSpan) return;

        // Add temporary highlight class
        wordSpan.classList.add('m-hl-orange');
        wordSpan.classList.add('m-blowup');

        // Remove highlight after a delay
        setTimeout(() => {
            wordSpan.classList.remove('m-hl-orange');
            wordSpan.classList.remove('m-blowup');
        }, 3000);
    }

    /**
     * Scroll to make a section visible in the paper view
     * @param {string} sectionTitle - Title of the section to scroll to
     */
    scrollToSection(sectionTitle) {
        // Find the section element in the paper view
        const paperView = document.getElementById('paper-view');
        if (!paperView) return;

        // Look for the section by searching for elements containing the title
        const sectionElements = paperView.querySelectorAll('*');
        let targetElement = null;

        for (const element of sectionElements) {
            if (element.textContent && element.textContent.includes(sectionTitle)) {
                // Prefer heading-like elements
                if (element.tagName.match(/^H[1-6]$/) ||
                    element.classList.contains('ltx_section') ||
                    element.classList.contains('ltx_title')) {
                    targetElement = element;
                    break;
                }
                // Fallback to first match
                if (!targetElement) {
                    targetElement = element;
                }
            }
        }

        if (targetElement) {
            // Smooth scroll to the element
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // Fallback: just scroll to top if section not found
            paperView.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    /**
     * Show error message to user
     * @param {string} message - Error message to display
     */

    updatePaperMetadata(metadata) {
        const titleElement = document.getElementById('paper-title');
        const metaElement = document.getElementById('paper-meta');

        if (titleElement) {
            titleElement.textContent = metadata.title || 'Unknown Title';
        }

        if (metaElement) {
            const authors = metadata.authors || [];
            const date = metadata.date || '';

            metaElement.innerHTML = `
                <div class="authors">${authors.join(', ')}</div>
                <div class="date">${date}</div>
            `;
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '20px';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translateX(-50%)';
        errorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        errorDiv.style.color = 'white';
        errorDiv.style.padding = '10px 20px';
        errorDiv.style.borderRadius = '4px';
        errorDiv.style.zIndex = '1000';

        document.body.appendChild(errorDiv);

        // Remove after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.paperCrawlerApp = new PaperCrawlerApp();
});

// Export for use in other modules (if needed)
window.PaperCrawlerApp = PaperCrawlerApp;