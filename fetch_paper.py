#!/usr/bin/env python3
"""
fetch_paper.py - Download arXiv papers as HTML for the Paper Crawler project

Usage: python fetch_paper.py 1706.03762
       python fetch_paper.py --batch "1706.03762 1810.04805 2005.14165"
       python fetch_paper.py --force 1706.03762

Downloads arXiv papers, extracts metadata, and saves cleaned HTML.
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from typing import Optional, Tuple, Dict, List

# Constants
USER_AGENT = "PaperCrawler/1.0 (+https://github.com/yourname/paper-crawler; contact@yourdomain.com)"
REQUEST_DELAY = 3.0  # seconds between requests
TIMEOUT = 30  # seconds for HTTP requests
PAPERS_DIR = Path("papers")
CACHE_DIR = Path("cache")

# Allowed arXiv ID patterns
ARXIV_ID_NEW = re.compile(r'^\d{4}\.\d{4,5}(v\d+)?$')
ARXIV_ID_OLD = re.compile(r'^[a-z\-]+(\.[A-Z]{2})?/\d{7}(v\d+)?$')


class MLStripper(HTMLParser):
    """Simple HTML tag stripper for text extraction"""
    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs = True
        self.text = []

    def handle_data(self, data):
        self.text.append(data)

    def get_data(self):
        return ''.join(self.text)


def strip_tags(html):
    """Strip HTML tags, returning only text"""
    s = MLStripper()
    s.feed(html)
    return s.get_data()


def normalize_arxiv_id(input_id: str) -> str:
    """Normalize various arXiv ID formats to bare ID"""
    # Remove whitespace
    input_id = input_id.strip()

    # If it's a full URL, extract the ID
    if input_id.startswith('http'):
        # Handle arxiv.org URLs
        if 'arxiv.org' in input_id:
            # Extract ID from /abs/ or /pdf/ or /html/
            match = re.search(r'/(abs|pdf|html)/([^/?#]+)', input_id)
            if match:
                input_id = match.group(2)
        # Handle arxiv.org API URLs (less common but possible)
        elif 'export.arxiv.org' in input_id:
            match = re.search(r'id_list=([^&]+)', input_id)
            if match:
                input_id = match.group(1)

    # Remove version if present (we'll add it back if needed)
    # But keep track of whether it was versioned
    versioned = False
    if input_id.endswith(('v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9')):
        # Check if it's actually a version suffix
        base = input_id[:-2]
        if ARXIV_ID_NEW.match(base) or ARXIV_ID_OLD.match(base):
            versioned = True
            input_id = base

    # Validate the ID format
    if not (ARXIV_ID_NEW.match(input_id) or ARXIV_ID_OLD.match(input_id)):
        raise ValueError(f"Invalid arXiv ID format: {input_id}")

    return input_id, versioned


def fetch_with_retry(url: str, max_retries: int = 2) -> Optional[bytes]:
    """Fetch URL with retry logic and proper headers"""
    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': USER_AGENT}
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries:
                # Rate limited, wait and retry
                wait_time = 2 ** attempt
                print(f"Rate limited, waiting {wait_time}s...", file=sys.stderr)
                time.sleep(wait_time)
                continue
            elif e.code in (404, 410):
                # Not found - don't retry
                return None
            else:
                print(f"HTTP error {e.code} for {url}", file=sys.stderr)
                if attempt == max_retries:
                    return None
        except urllib.error.URLError as e:
            print(f"URL error for {url}: {e.reason}", file=sys.stderr)
            if attempt == max_retries:
                return None
        except Exception as e:
            print(f"Unexpected error fetching {url}: {e}", file=sys.stderr)
            if attempt == max_retries:
                return None

        if attempt < max_retries:
            time.sleep(2 ** attempt)  # Exponential backoff

    return None


def fetch_metadata(arxiv_id: str) -> Optional[Dict]:
    """Fetch paper metadata from arXiv API"""
    api_url = f"http://export.arxiv.org/api/query?id_list={arxiv_id}"
    print(f"Fetching metadata from {api_url}")

    data = fetch_with_retry(api_url)
    if not data:
        return None

    try:
        root = ET.fromstring(data.decode('utf-8'))

        # Define Atom namespace
        ns = {'atom': 'http://www.w3.org/2005/Atom'}

        entry = root.find('atom:entry', ns)
        if entry is None:
            print("No entry found in API response", file=sys.stderr)
            return None

        # Extract metadata
        title_elem = entry.find('atom:title', ns)
        title = title_elem.text.strip() if title_elem is not None else ""

        # Authors
        authors = []
        for author_elem in entry.findall('atom:author', ns):
            name_elem = author_elem.find('atom:name', ns)
            if name_elem is not None:
                authors.append(name_elem.text.strip())

        # Published date
        published_elem = entry.find('atom:published', ns)
        published = published_elem.text.strip() if published_elem is not None else ""

        # Summary/abstract
        summary_elem = entry.find('atom:summary', ns)
        summary = summary_elem.text.strip() if summary_elem is not None else ""

        return {
            'title': title,
            'authors': authors,
            'date': published,
            'abstract': summary,
            'id': arxiv_id
        }
    except Exception as e:
        print(f"Error parsing metadata XML: {e}", file=sys.stderr)
        return None


def fetch_html_version(arxiv_id: str) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Try to fetch HTML version from arxiv.org, then ar5iv.org
    Returns (content, final_url) or (None, None) if both fail
    """
    # Try arxiv.org first
    url1 = f"https://arxiv.org/html/{arxiv_id}"
    print(f"Trying {url1}")
    data1 = fetch_with_retry(url1)
    if data1:
        # Check if we got a real HTML page (not an error page)
        content_str = data1.decode('utf-8', errors='ignore')
        if '<html' in content_str.lower() and 'ltx_document' in content_str:
            return data1, url1

    # Try ar5iv.org as fallback
    url2 = f"https://ar5iv.labs.arxiv.org/html/{arxiv_id}"
    print(f"Trying {url2}")
    data2 = fetch_with_retry(url2)
    if data2:
        content_str = data2.decode('utf-8', errors='ignore')
        if '<html' in content_str.lower() and 'ltx_document' in content_str:
            return data2, url2

    return None, None


def sanitize_html(html_content: bytes, base_url: str) -> str:
    """
    Sanitize HTML: remove scripts, iframes, objects, inline handlers, javascript: URLs
    Rewrite relative URLs to absolute, strip site CSS/nav chrome
    """
    # Parse HTML
    try:
        # Try to parse as XML first (LaTeXML output is usually valid XML)
        content_str = html_content.decode('utf-8')
        # We'll do string-based sanitization for simplicity and robustness

        # Remove script tags and contents
        content_str = re.sub(r'<script\b[^>]*>.*?</script>', '', content_str, flags=re.DOTALL | re.IGNORECASE)
        # Remove iframe tags
        content_str = re.sub(r'<iframe\b[^>]*>.*?</iframe>', '', content_str, flags=re.DOTALL | re.IGNORECASE)
        # Remove object tags
        content_str = re.sub(r'<object\b[^>]*>.*?</object>', '', content_str, flags=re.DOTALL | re.IGNORECASE)
        # Remove embed tags
        content_str = re.sub(r'<embed\b[^>]*>.*?</embed>', '', content_str, flags=re.DOTALL | re.IGNORECASE)

        # Remove inline event handlers (onclick, onmouseover, etc.)
        content_str = re.sub(r'\s+on\w+\s*=\s*"[^"]*"', '', content_str, flags=re.IGNORECASE)
        content_str = re.sub(r"\s+on\w+\s*=\s*'[^']*'", '', content_str, flags=re.IGNORECASE)
        content_str = re.sub(r'\s+on\w+\s*=\s*[^>\s]+', '', content_str, flags=re.IGNORECASE)

        # Remove javascript: URLs
        content_str = re.sub(r'href\s*=\s*["\']javascript:[^"\']*["\']', '', content_str, flags=re.IGNORECASE)
        content_str = re.sub(r'src\s*=\s*["\']javascript:[^"\']*["\']', '', content_str, flags=re.IGNORECASE)

        # Remove link tags to external CSS (keep only if they're from arxiv?)
        # For now, remove all external CSS links to avoid conflicts
        content_str = re.sub(r'<link\b[^>]*rel\s*=\s*["\']stylesheet["\'][^>]*>', '', content_str, flags=re.IGNORECASE)
        # Remove style tags (we'll add our own)
        content_str = re.sub(r'<style\b[^>]*>.*?</style>', '', content_str, flags=re.DOTALL | re.IGNORECASE)

        # Rewrite relative URLs to absolute
        # Handle src and href attributes
        def rewrite_url(match):
            attr = match.group(1)  # src or href
            quote = match.group(2)  # quote character
            url = match.group(3)    # the URL

            # Skip if already absolute or data: or javascript:
            if re.match(r'^[a-z][a-z0-9+.-]*://', url) or url.startswith('data:') or url.startswith('javascript:'):
                return match.group(0)

            # Handle protocol-relative URLs
            if url.startswith('//'):
                url = 'https:' + url
            # Handle absolute path on same domain
            elif url.startswith('/'):
                url = urllib.parse.urljoin(base_url, url)
            # Handle relative URL
            else:
                url = urllib.parse.urljoin(base_url, url)

            return f'{attr}={quote}{url}{quote}'

        # Rewrite src and href attributes
        content_str = re.sub(r'(src|href)\s*=\s*([\'"])[^\'"]*\2', rewrite_url, content_str, flags=re.IGNORECASE)

        # Try to extract the main document content
        # Look for ltx_document or ltx_page_content
        ltx_doc_match = re.search(r'<(ltx_document|ltx_page_content)\b[^>]*>.*?</\1>',
                                 content_str, flags=re.DOTALL | re.IGNORECASE)
        if ltx_doc_match:
            return ltx_doc_match.group(0)

        # Fallback: try to find body content
        body_match = re.search(r'<body\b[^>]*>.*?</body>', content_str, flags=re.DOTALL | re.IGNORECASE)
        if body_match:
            # Remove arXiv/header clutter from body
            body_content = body_match.group(0)
            # Remove common header/nav patterns
            body_content = re.sub(r'<div\b[^>]*class\s*=\s*["\'][^"\']*(?:header|nav|menu)[^"\']*["\'][^>]*>.*?</div>',
                                 '', body_content, flags=re.DOTALL | re.IGNORECASE)
            body_content = re.sub(r'<nav\b[^>]*>.*?</nav>', '', body_content, flags=re.DOTALL | re.IGNORECASE)
            body_content = re.sub(r'<header\b[^>]*>.*?</header>', '', body_content, flags=re.DOTALL | re.IGNORECASE)
            return f'<ltx_document>{body_content}</ltx_document>'

        # Last resort: return cleaned content
        return content_str

    except Exception as e:
        print(f"Error sanitizing HTML: {e}", file=sys.stderr)
        # Return original content as fallback
        return html_content.decode('utf-8', errors='ignore')


def save_paper(arxiv_id: str, metadata: Dict, html_content: str, final_url: str):
    """Save paper HTML and metadata to disk"""
    # Create papers directory if it doesn't exist
    PAPERS_DIR.mkdir(exist_ok=True)

    # Save HTML
    html_file = PAPERS_DIR / f"{arxiv_id}.html"
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"Saved HTML to {html_file}")

    # Save metadata
    meta_file = PAPERS_DIR / f"{arxiv_id}.json"
    # Add fetch URL to metadata
    metadata['fetch_url'] = final_url
    metadata['fetched_at'] = time.time()
    with open(meta_file, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"Saved metadata to {meta_file}")


def paper_exists(arxiv_id: str) -> bool:
    """Check if paper already exists in papers directory"""
    html_file = PAPERS_DIR / f"{arxiv_id}.html"
    meta_file = PAPERS_DIR / f"{arxiv_id}.json"
    return html_file.exists() and meta_file.exists()


def main():
    global REQUEST_DELAY
    parser = argparse.ArgumentParser(description='Download arXiv papers for Paper Crawler')
    parser.add_argument('arxiv_id', nargs='?', help='arXiv ID (e.g., 1706.03762) or URL')
    parser.add_argument('--batch', help='Download multiple IDs (space-separated)')
    parser.add_argument('--force', action='store_true', help='Force re-download even if exists')
    parser.add_argument('--delay', type=float, default=REQUEST_DELAY,
                       help=f'Delay between requests in seconds (default: {REQUEST_DELAY})')

    args = parser.parse_args()

    REQUEST_DELAY = args.delay

    # Determine what to download
    ids_to_process = []
    if args.batch:
        ids_to_process = [id.strip() for id in args.batch.split()]
    elif args.arxiv_id:
        ids_to_process = [args.arxiv_id]
    else:
        # Default paper
        ids_to_process = ['1706.03762']

    # Process each ID
    for arxiv_input in ids_to_process:
        try:
            # Normalize the ID
            arxiv_id, was_versioned = normalize_arxiv_id(arxiv_input)

            # Check if already exists
            if not args.force and paper_exists(arxiv_id):
                print(f"Paper {arxiv_id} already exists. Use --force to re-download.")
                continue

            print(f"\nProcessing arXiv:{arxiv_id}")

            # Fetch metadata
            metadata = fetch_metadata(arxiv_id)
            if not metadata:
                print(f"Failed to fetch metadata for {arxiv_id}", file=sys.stderr)
                continue

            # Fetch HTML version
            html_content, final_url = fetch_html_version(arxiv_id)
            if not html_content:
                print(f"No HTML version available for {arxiv_id}", file=sys.stderr)
                print("Try checking if the paper has an HTML version on arxiv.org", file=sys.stderr)
                continue

            # Sanitize HTML
            sanitized_html = sanitize_html(html_content, final_url)

            # Save paper
            save_paper(arxiv_id, metadata, sanitized_html, final_url)

            # Politeness delay
            if len(ids_to_process) > 1:
                print(f"Waiting {REQUEST_DELAY}s before next request...")
                time.sleep(REQUEST_DELAY)

        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Unexpected error processing {arxiv_input}: {e}", file=sys.stderr)
            continue

    print("\nDone!")


if __name__ == '__main__':
    main()