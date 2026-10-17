// analyst.js - AI explainer panel and crawler notes
// Handles the side panel with explanations, controls, and notes

class AnalystPanel {
    constructor() {
        this.panel = document.getElementById('analyst-panel');
        this.sectionLabel = document.getElementById('section-label');
        this.explanationText = document.getElementById('explanation-text');
        this.keyPhrase = document.getElementById('key-phrase');
        this.panelToggle = document.getElementById('panel-toggle');

        this.isOpen = false;
        this.currentSection = null;
        this.explanationQueue = [];
        this.isExplaining = false;
        this.history = [];
        this.notes = []; // Crawler notes for metrics, models, datasets

        this.bindEvents();
        this.initTabs();
    }

    bindEvents() {
        this.panelToggle.addEventListener('click', () => this.togglePanel());

        // Close panel when clicking outside
        this.panel.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.panel.contains(e.target) &&
                e.target !== this.panelToggle) {
                this.closePanel();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Skip if focus is in input, textarea, or contenteditable
            if (e.target.tagName === 'INPUT' ||
                e.target.tagName === 'TEXTAREA' ||
                e.target.isContentEditable === true) {
                return;
            }

            // Skip if modifier keys are held
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            switch (e.code) {
                case 'KeyT':
                    this.toggleTitleOverlay();
                    break;
                case 'KeyC':
                    this.clearMarkup();
                    break;
                case 'KeyD':
                    this.redropSpider();
                    break;
                case 'KeyE':
                    this.explainSelection();
                    break;
                case 'Digit1':
                case 'Digit2':
                case 'Digit3':
                    this.setIntensity(e.code);
                    break;
                case 'KeyB':
                case 'KeyS':
                case 'KeyR':
                    this.setLevel(e.code);
                    break;
                case 'KeyF':
                    this.toggleFollow();
                    break;
                case 'Space':
                    this.togglePause();
                    break;
            }
        });
    }

    initTabs() {
        // Create tab system
        this.tabContainer = document.createElement('div');
        this.tabContainer.className = 'tab-container';

        this.explanationTab = document.createElement('button');
        this.explanationTab.className = 'tab-btn active';
        this.explanationTab.textContent = 'Explanation';
        this.explanationTab.addEventListener('click', () => this.showTab('explanation'));

        this.notesTab = document.createElement('button');
        this.notesTab.className = 'tab-btn';
        this.notesTab.textContent = 'Crawler Notes';
        this.notesTab.addEventListener('click', () => this.showTab('notes'));

        this.historyTab = document.createElement('button');
        this.historyTab.className = 'tab-btn';
        this.historyTab.textContent = 'History';
        this.historyTab.addEventListener('click', () => this.showTab('history'));

        this.tabContainer.appendChild(this.explanationTab);
        this.tabContainer.appendChild(this.notesTab);
        this.tabContainer.appendChild(this.historyTab);

        this.panel.insertBefore(this.tabContainer, this.panel.firstChild);

        // Create tab content containers
        this.explanationContent = document.createElement('div');
        this.explanationContent.className = 'tab-content active';
        this.explanationContent.innerHTML = `
            <div id="explanation-text"></div>
            <div id="key-phrase"></div>
        `;

        this.notesContent = document.createElement('div');
        this.notesContent.className = 'tab-content';
        this.notesContent.innerHTML = `
            <div id="notes-list"></div>
            <button id="export-notes" style="margin: 10px auto; display: block; padding: 5px 10px;">
                Export Notes
            </button>
        `;

        this.historyContent = document.createElement('div');
        this.historyContent.className = 'tab-content';
        this.historyContent.innerHTML = `
            <div id="history-list"></div>
        `;

        this.panel.appendChild(this.explanationContent);
        this.panel.appendChild(this.notesContent);
        this.panel.appendChild(this.historyContent);

        // Get references to elements
        this.notesList = document.getElementById('notes-list');
        this.historyList = document.getElementById('history-list');
        this.exportNotesBtn = document.getElementById('export-notes');

        this.exportNotesBtn.addEventListener('click', () => this.exportNotes());
    }

    togglePanel() {
        if (this.isOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    openPanel() {
        this.isOpen = true;
        this.panel.classList.add('open');
        this.panelToggle.textContent = '◀';
    }

    closePanel() {
        this.isOpen = false;
        this.panel.classList.remove('open');
        this.panelToggle.textContent = '▶';
    }

    showTab(tabName) {
        // Update tab buttons
        this.explanationTab.className = tabName === 'explanation' ? 'tab-btn active' : 'tab-btn';
        this.notesTab.className = tabName === 'notes' ? 'tab-btn active' : 'tab-btn';
        this.historyTab.className = tabName === 'history' ? 'tab-btn active' : 'tab-btn';

        // Update tab content
        this.explanationContent.className = tabName === 'explanation' ? 'tab-content active' : 'tab-content';
        this.notesContent.className = tabName === 'notes' ? 'tab-content active' : 'tab-content';
        this.historyContent.className = tabName === 'history' ? 'tab-content active' : 'tab-content';
    }

    updateSectionLabel(sectionTitle, level) {
        const levelMap = {
            'beginner': '(Beginner)',
            'student': '(Student)',
            'researcher': '(Researcher)'
        };
        const levelText = levelMap[level] || '';
        this.sectionLabel.textContent = `▸ crawling: ${sectionTitle} ${levelText}`;
    }

    // Explanation handling
    setExplanation(text, keyPhrase = '') {
        this.explanationText.textContent = text;
        this.keyPhrase.textContent = keyPhrase;

        // If we have a key phrase, try to highlight it in the paper
        if (keyPhrase) {
            this.highlightKeyPhrase(keyPhrase);
        }
    }

    appendExplanationChunk(chunk) {
        this.explanationText.textContent += chunk;
        // Scroll to bottom
        this.explanationText.scrollTop = this.explanationText.scrollHeight;
    }

    clearExplanation() {
        this.explanationText.textContent = '';
        this.keyPhrase.textContent = '';
    }

    // History handling
    addToHistory(sectionTitle, explanation) {
        this.history.unshift({
            title: sectionTitle,
            explanation: explanation,
            timestamp: Date.now()
        });

        // Limit history size
        if (this.history.length > 50) {
            this.history.pop();
        }

        this.updateHistoryDisplay();
    }

    updateHistoryDisplay() {
        this.historyList.innerHTML = '';
        this.history.forEach((item, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="section-title">${item.title}</div>
                <div class="section-preview">${item.explanation.substring(0, 100)}...</div>
            `;
            historyItem.addEventListener('click', () => {
                // Scroll to section in paper
                this.scrollToSection(item.title);
            });
            this.historyList.appendChild(historyItem);
        });
    }

    // Crawler notes handling
    addNote(type, term, section, sentence) {
        // Deduplicate by term and section
        const exists = this.notes.some(note =>
            note.term === term && note.section === section && note.type === type
        );

        if (!exists) {
            this.notes.unshift({ type, term, section, sentence });

            // Limit notes size
            if (this.notes.length > 100) {
                this.notes.pop();
            }

            this.updateNotesDisplay();
        }
    }

    updateNotesDisplay() {
        this.notesList.innerHTML = '';
        this.notes.forEach(note => {
            const noteItem = document.createElement('div');
            noteItem.className = 'notes-item';
            noteItem.innerHTML = `
                <span class="term">${note.type}: ${note.term}</span>
                <span class="section">[${note.section}]</span>
            `;
            this.notesList.appendChild(noteItem);
        });
    }

    exportNotes() {
        if (this.notes.length === 0) {
            alert('No notes to export');
            return;
        }

        const notesText = this.notes.map(note =>
            `${note.type}: ${note.term} [${note.section}] - "${note.sentence}"`
        ).join('\n');

        const blob = new Blob([notesText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crawler-notes-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Controls (these would be implemented to communicate with other modules)
    toggleTitleOverlay() {
        // Dispatch event for main app to handle
        document.dispatchEvent(new CustomEvent('toggle-title-overlay'));
    }

    clearMarkup() {
        document.dispatchEvent(new CustomEvent('clear-markup'));
    }

    redropSpider() {
        document.dispatchEvent(new CustomEvent('redrop-spider'));
    }

    explainSelection() {
        document.dispatchEvent(new CustomEvent('explain-selection'));
    }

    setIntensity(code) {
        const intensityMap = {
            'Digit1': 'calm',
            'Digit2': 'normal',
            'Digit3': 'wild'
        };
        document.dispatchEvent(new CustomEvent('set-intensity', {
            detail: intensityMap[code]
        }));
    }

    setLevel(code) {
        const levelMap = {
            'KeyB': 'beginner',
            'KeyS': 'student',
            'KeyR': 'researcher'
        };
        document.dispatchEvent(new CustomEvent('set-level', {
            detail: levelMap[code]
        }));
    }

    toggleFollow() {
        document.dispatchEvent(new CustomEvent('toggle-follow'));
    }

    togglePause() {
        document.dispatchEvent(new CustomEvent('toggle-pause'));
    }

    // Helper methods (would be implemented by main app)
    highlightKeyPhrase(phrase) {
        // This would be implemented by the main application
        console.log(`Highlighting phrase: ${phrase}`);
    }

    scrollToSection(sectionTitle) {
        // This would be implemented by the main application
        console.log(`Scrolling to section: ${sectionTitle}`);
    }
}

// Export for use in other modules
window.AnalystPanel = AnalystPanel;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.analystPanel = new AnalystPanel();
});