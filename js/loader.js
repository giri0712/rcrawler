// loader.js - Load, sanitize, and process paper content
// Handles section detection, text wrapping, and word indexing

const TITLE_TEXT = "I built a spider that reads ML papers for me";

class PaperLoader {
    constructor() {
        this.paperContent = null;
        this.sections = [];
        this.wordSpans = [];
        this.currentSection = null;
        this.observers = [];
        this.isWrapping = false;
        this.wrapBatchSize = 50;
        this.wrapPauseTime = 10;
    }

    /**
     * Load paper data from papers directory
     * @param {string} paperId - arXiv ID
     * @returns {Promise<Object>} - Paper metadata and content
     */
    async loadPaper(paperId) {
        try {
            // Load metadata
            const metaResponse = await fetch(`/api/papers/${paperId}`);
            const metadata = await metaResponse.json();

            // Load HTML content
            const htmlResponse = await fetch(`/papers/${paperId}.html`);
            const htmlContent = await htmlResponse.text();

            this.paperContent = { metadata, htmlContent };
            return this.paperContent;
        } catch (error) {
            console.error('Failed to load paper:', error);
            throw error;
        }
    }

    /**
     * Parse and extract sections from paper content
     * Uses LaTeXML structure with fallback to h1-h4 headings
     */
    detectSections() {
        if (!this.paperContent) return [];

        const parser = new DOMParser();
        const doc = parser.parseFromString(this.paperContent.htmlContent, 'text/html');

        // Try LaTeXML structure first
        let sections = this.extractLatexSections(doc);

        // Fallback to heading-based detection
        if (sections.length === 0) {
            sections = this.extractHeadingSections(doc);
        }

        // Process and normalize sections
        this.sections = sections.map(section => this.normalizeSection(section));

        return this.sections;
    }

    /**
     * Extract sections using LaTeXML structure
     */
    extractLatexSections(doc) {
        const sections = [];

        // Look for abstract
        const abstractEls = doc.querySelectorAll('.ltx_abstract');
        abstractEls.forEach(el => {
            sections.push({
                id: `abstract-${Date.now()}-${Math.random()}`,
                title: 'Abstract',
                slug: 'abstract',
                level: 0,
                text: el.textContent.trim(),
                startEl: el,
                endEl: el
            });
        });

        // Look for all section-like tags in hierarchical order
        const sectionSelectors = [
            '.ltx_section',          // section
            '.ltx_subsection',       // subsection
            '.ltx_subsubsection',    // subsubsection
            '.ltx_paragraph',        // paragraph
            '.ltx_subparagraph'      // subparagraph
        ];

        let sectionIndex = 0;
        sectionSelectors.forEach((selector, levelIndex) => {
            // Level: 1=section, 2=subsection, 3=subsubsection, 4=paragraph, 5=subparagraph
            const level = levelIndex + 1;
            const elements = doc.querySelectorAll(selector);

            elements.forEach((el, index) => {
                const titleEl = el.querySelector('.ltx_title');
                if (!titleEl) return;

                // Find the actual content boundary for this section
                const contentEndEl = this.findSectionEndEl(el, level, doc);

                sections.push({
                    id: `${selector.replace('.', '')}-${Date.now()}-${Math.random()}-${sectionIndex}`,
                    title: titleEl.textContent.trim(),
                    slug: this.createSlug(titleEl.textContent.trim()),
                    level: level,
                    text: this.getSectionTextContent(el, contentEndEl),
                    startEl: el,
                    endEl: contentEndEl || el
                });

                sectionIndex++;
            });
        });

        return sections;
    }

    /**
     * Find the end element for a section by looking for next sibling of same or higher level
     */
    findSectionEndEl(startEl, level, doc) {
        let current = startEl.nextElementSibling;

        while (current) {
            // Check if this element is a section header of same or higher level
            const isSectionHeader = current.querySelector('.ltx_title') &&
                                  this.isSectionElement(current);

            if (isSectionHeader) {
                const elementLevel = this.getSectionLevel(current);
                if (elementLevel <= level) {
                    // Found a sibling of same or higher level - this is our boundary
                    return current.previousElementSibling;
                }
            }

            current = current.nextElementSibling;
        }

        // If no next section found, return the last element in document
        return doc.body.lastElementChild;
    }

    /**
     * Check if element is a LaTeXML section element
     */
    isSectionElement(element) {
        return element.classList.contains('ltx_section') ||
               element.classList.contains('ltx_subsection') ||
               element.classList.contains('ltx_subsubsection') ||
               element.classList.contains('ltx_paragraph') ||
               element.classList.contains('ltx_subparagraph');
    }

    /**
     * Get the level of a LaTeXML section element
     */
    getSectionLevel(element) {
        if (element.classList.contains('ltx_subsubsection')) return 3;
        if (element.classList.contains('ltx_subsection')) return 2;
        if (element.classList.contains('ltx_section')) return 1;
        if (element.classList.contains('ltx_paragraph')) return 4;
        if (element.classList.contains('ltx_subparagraph')) return 5;
        return 1; // default
    }

    /**
     * Extract text content from start element to end element (inclusive)
     */
    getSectionTextContent(startEl, endEl) {
        if (!startEl) return '';
        if (!endEl) return startEl.textContent.trim();

        const textContent = [];
        let current = startEl;

        while (current) {
            textContent.push(current.textContent.trim());

            if (current === endEl) break;
            current = current.nextElementSibling;
        }

        return textContent.join(' ').trim();
    }

    /**
     * Extract sections using heading elements as fallback
     */
    extractHeadingSections(doc) {
        const sections = [];
        const headings = doc.querySelectorAll('h1, h2, h3, h4');

        headings.forEach((heading, index) => {
            let level = 1;
            if (heading.tagName === 'H2') level = 2;
            else if (heading.tagName === 'H3') level = 3;
            else if (heading.tagName === 'H4') level = 4;

            // Find content until next heading of same or higher level
            let contentEls = [];
            let current = heading.nextElementSibling;

            while (current && !(current.tagName.match(/^H[1-4]$/) &&
                  this.getHeadingLevel(current) <= level)) {
                contentEls.push(current);
                current = current.nextElementSibling;
            }

            // Combine text content
            const textContent = [heading.textContent, ...contentEls.map(el => el.textContent)].join('\n').trim();

            sections.push({
                id: `heading-${index}-${Date.now()}-${Math.random()}`,
                title: heading.textContent.trim(),
                slug: this.createSlug(heading.textContent.trim()),
                level: level,
                text: textContent,
                startEl: heading,
                endEl: contentEls.length > 0 ? contentEls[contentEls.length - 1] : heading
            });
        });

        return sections;
    }

    /**
     * Normalize section data
     */
    normalizeSection(section) {
        return {
            ...section,
            slug: section.slug || this.createSlug(section.title),
            level: section.level || 1
        };
    }

    /**
     * Create URL-friendly slug from text
     */
    createSlug(text) {
        return text.toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '')
                  .substring(0, 80);
    }

    /**
     * Get heading level from tag name
     */
    getHeadingLevel(element) {
        const tag = element.tagName.toUpperCase();
        if (tag === 'H1') return 1;
        if (tag === 'H2') return 2;
        if (tag === 'H3') return 3;
        if (tag === 'H4') return 4;
        return 1;
    }

    /**
     * Wrap text nodes into <span class="w"> elements for word-level access
     * Uses IntersectionObserver for lazy wrapping
     */
    wrapTextNodes(container) {
        if (this.isWrapping) return;
        this.isWrapping = true;

        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;

        while (node = walker.nextNode()) {
            // Skip if inside certain elements
            const parent = node.parentNode;
            if (parent &&
                (parent.tagName === 'SCRIPT' ||
                 parent.tagName === 'STYLE' ||
                 parent.tagName === 'MATH' ||
                 parent.tagName === 'CODE' ||
                 parent.tagName === 'PRE' ||
                 parent.tagName === 'SVG' ||
                 parent.tagName === 'IMG' ||
                 parent.tagName === 'FIGURE' ||
                 parent.classList && parent.classList.contains('ltx_math'))) {
                continue;
            }

            textNodes.push(node);
        }

        // Process in batches to avoid blocking UI
        this.processTextNodeBatch(textNodes, 0, container);
    }

    /**
     * Process a batch of text nodes
     */
    processTextNodeBatch(textNodes, startIndex, container) {
        const endIndex = Math.min(startIndex + this.wrapBatchSize, textNodes.length);

        for (let i = startIndex; i < endIndex; i++) {
            const node = textNodes[i];
            this.wrapTextNode(node);
        }

        // Continue with next batch or finish
        if (endIndex < textNodes.length) {
            setTimeout(() => {
                this.processTextNodeBatch(textNodes, endIndex, container);
            }, this.wrapPauseTime);
        } else {
            this.isWrapping = false;
            this.buildWordIndex(container);
        }
    }

    /**
     * Wrap a single text node with word spans
     */
    wrapTextNode(textNode) {
        const text = textNode.textContent;
        if (!text.trim()) return;

        // Split into words preserving whitespace
        const parts = text.split(/(\s+)/);
        let spanIndex = 0;

        const frag = document.createDocumentFragment();

        parts.forEach(part => {
            if (part.trim() === '') {
                // Whitespace
                frag.appendChild(document.createTextNode(part));
            } else {
                // Word
                const wordSpan = document.createElement('span');
                wordSpan.className = 'w';
                wordSpan.textContent = part;
                wordSpan.dataset.i = spanIndex; // Stable index
                frag.appendChild(wordSpan);
                spanIndex++;
            }
        });

        textNode.parentNode.replaceChild(frag, textNode);
    }

    /**
     * Build index of word positions for fast lookup
     */
    buildWordIndex(container) {
        this.wordSpans = Array.from(container.querySelectorAll('span.w'));
        // Update data-i attributes to ensure they're sequential
        this.wordSpans.forEach((span, index) => {
            span.dataset.i = index;
        });
    }

    /**
     * Find nearest word to coordinates
     * @param {number} x - X coordinate in document space
     * @param {number} y - Y coordinate in document space
     * @returns {Object|null} - Word span and local offset or null
     */
    findNearestWord(x, y) {
        if (this.wordSpans.length === 0) return null;

        // Simple linear search - could be optimized with spatial indexing
        let nearest = null;
        let minDistance = Infinity;

        this.wordSpans.forEach(span => {
            const rect = span.getBoundingClientRect();
            // Convert to document space by adding scroll offset
            const docX = rect.left + window.scrollX;
            const docY = rect.top + window.scrollY;

            const dx = x - docX;
            const dy = y - docY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;
                // Calculate local offset within the word
                const localX = Math.max(0, Math.min(1, (x - docX) / rect.width));
                const localY = Math.max(0, Math.min(1, (y - docY) / rect.height));
                nearest = { span, index: parseInt(span.dataset.i), localOffset: { x: localX, y: localY } };
            }
        });

        // Return null if too far from any word (more than average word width)
        if (minDistance > 50) return null; // 50px threshold

        return nearest;
    }

    /**
     * Get current section based on spider position
     * @param {number} y - Vertical position in document space
     * @returns {Object|null} - Current section
     */
    getSectionAtPosition(y) {
        if (!this.sections || this.sections.length === 0) return null;

        // Find section that contains this y position
        // For simplicity, we'll check section boundaries
        // In a real implementation, we'd track element positions

        let currentSection = this.sections[0]; // Default to first

        // This is a simplified version - in reality we'd need to track
        // the actual positions of section elements in document space
        return currentSection;
    }

    /**
     * Get words in a specific section
     * @param {Object} section - Section object
     * @returns {Array} - Array of word spans in section
     */
    getWordsInSection(section) {
        // Simplified - in reality we'd need to map sections to word ranges
        // For now, return all words
        return this.wordSpans;
    }

    /**
     * Clear all word wrapping and reset state
     */
    clear() {
        // Remove all word spans
        document.querySelectorAll('span.w').forEach(span => {
            const text = document.createTextNode(span.textContent);
            span.parentNode.replaceChild(text, span);
        });

        this.wordSpans = [];
        this.sections = [];
        this.isWrapping = false;
    }
}

// Export for use in other modules
window.PaperLoader = PaperLoader;