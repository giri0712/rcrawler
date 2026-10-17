# CI/CD Pipeline for Paper Crawler

This document explains how to implement a Continuous Integration/Continuous Deployment pipeline for the Paper Crawler project. Given the project's architecture (plain ES modules, Python standard library, no build steps), the pipeline focuses on code quality, testing, and deployment automation.

## Overview

The Paper Crawler consists of:
- **Frontend**: HTML/CSS/JS (ES modules) running in the browser
- **Backend**: Python scripts (`fetch_paper.py`, `serve.py`) using only standard library
- **Content**: Downloaded arXiv papers stored in `papers/` directory
- **Cache**: AI explanation responses stored in `cache/` directory (should be excluded from CI)

## Continuous Integration (CI)

CI runs on every push and pull request to ensure code quality and catch issues early.

### GitHub Actions Workflow Example

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x]
        python-version: [3.9, 3.10, 3.11]

    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
    
    - name: Setup Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    
    - name: Install dependencies
      run: |
        # Install linters and tools
        npm install -g eslint stylelint
        pip install flake8 pylint
    
    - name: Lint JavaScript
      run: |
        # Create basic ESLint config if none exists
        if [ ! -f .eslintrc.js ]; then
          echo "module.exports = {
            env: { browser: true, es2021: true },
            extends: 'eslint:recommended',
            parserOptions: { ecmaVersion: 12, sourceType: 'module' },
            rules: {
              'indent': ['error', 2],
              'linebreak-style': ['error', 'unix'],
              'quotes': ['error', 'single'],
              'semi': ['error', 'always'],
              'no-trailing-spaces': 'error'
            }
          };" > .eslintrc.js
        fi
        eslint js/**/*.js
    
    - name: Lint CSS
      run: |
        # Create basic Stylelint config if none exists
        if [ ! -f .stylelintrc.json ]; then
          echo '{
            "rules": {
              "block-no-empty": true,
              "color-no-invalid-hex": true,
              "declaration-colon-space-after": "always",
              "declaration-colon-space-before": "never",
              "function-comma-space-after": "always",
              "number-leading-zero": "always",
              "number-trailing-zero": "none"
            }
          }' > .stylelintrc.json
        fi
        npx stylelint "css/**/*.css"
    
    - name: Lint Python
      run: |
        flake8 fetch_paper.py serve.py --max-line-length=88 --extend-ignore=E203,W503
        # Optional: run with more strict rules
        # pylint fetch_paper.py serve.py
    
    - name: Validate HTML
      run: |
        # Install HTML validator
        npm install -g html-validator
        html-validator index.html
    
    - name: Check file existence
      run: |
        # Ensure required files exist
        test -f index.html || exit 1
        test -f fetch_paper.py || exit 1
        test -f serve.py || exit 1
        test -f js/loader.js || exit 1
        test -f js/crawler.js || exit 1
        test -f js/spider-draw.js || exit 1
        test -f js/analyst.js || exit 1
        test -f js/main.js || exit 1
        test -f css/style.css || exit 1
    
    - name: Test Python scripts (syntax check)
      run: |
        python -m py_compile fetch_paper.py
        python -m py_compile serve.py
    
    - name: Security check (optional)
      run: |
        # Check for known vulnerabilities in dependencies
        # Since we use only standard library, this is minimal
        echo "No external dependencies to check - using only Python standard library and browser APIs"
```

### What the CI Checks

1. **Code Quality**
   - JavaScript linting (ESLint)
   - CSS linting (Stylelint)
   - Python linting (flake8/pylint)
   - HTML validation

2. **Basic Validation**
   - File existence checks
   - Python syntax validation
   - Required directory structure

3. **Security**
   - Basic vulnerability scanning (though minimal due to standard library only)

## Continuous Deployment (CD)

CD automates deployment to staging/production environments. For Paper Crawler, deployment options depend on your infrastructure.

### Deployment Options

#### Option 1: Traditional Server (VPS, Dedicated Host)
1. **Backend Deployment**:
   - Copy `serve.py`, `fetch_paper.py` to server
   - Ensure Python 3.8+ is installed
   - Set up systemd service or use PM2/Passenger for process management
   - Configure firewall to allow only localhost access (as required)
   - Set up reverse proxy (nginx/apache) if needed for SSL

2. **Frontend Deployment**:
   - Serve static files (`index.html`, `css/`, `js/`) through the same server
   - Or use separate static hosting (see Option 2)

#### Option 2: Jamstack Approach (Recommended for Scalability)
1. **Frontend**:
   - Host static assets on Netlify, Vercel, or Cloudflare Pages
   - These platforms provide CDN, SSL, and instant deployments

2. **Backend**:
   - Deploy Python server to Render, Railway, Fly.io, or AWS Lambda
   - Update API endpoints in frontend to point to deployed backend
   - Note: Must handle CORS if frontend and backend are on different domains

#### Option 3: Containerized Deployment (Docker)
1. Create `Dockerfile`:
   ```dockerfile
   FROM python:3.11-slim
   
   WORKDIR /app
   
   COPY . .
   
   # Create non-root user
   RUN adduser --disabled-password --gecos '' appuser && chown -R appuser:appuser /app
   USER appuser
   
   # Expose port
   EXPOSE 5173
   
   # Start server
   CMD ["python", "serve.py"]
   ```

2. Deploy to:
   - Docker Hub + any container service (AWS ECS, Google Cloud Run, etc.)
   - Platforms like Render or Railway that support Docker

### Example GitHub Actions CD Workflow

Create `.github/workflows/cd.yml`:

```yaml
name: CD

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    needs: test  # Only deploy if CI passes
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to Render (example)
      uses: johnbeynon/render-deploy-action@v0.0.8
      with:
        service-id: ${{ secrets.RENDER_SERVICE_ID }}
        api-key: ${{ secrets.RENDER_API_KEY }}
    
    # Alternative: Deploy to Railway
    # - name: Deploy to Railway
    #   run: |
    #     npm i -g railway
    #     railway up --service ${{ secrets.RAILWAY_SERVICE }} --token ${{ secrets.RAILWAY_TOKEN }}
    
    # Alternative: Deploy Docker image
    # - name: Build and push Docker image
    #   uses: docker/build-push-action@v4
    #   with:
    #     context: .
    #     push: true
    #     tags: user/paper-crawler:latest
    #     username: ${{ secrets.DOCKER_USERNAME }}
    #     password: ${{ secrets.DOCKER_PASSWORD }}
    #
    # - name: Deploy to server
    #   uses: appleboy/ssh-action@v0.1.2
    #   with:
    #     host: ${{ secrets.SERVER_HOST }}
    #     username: ${{ secrets.SERVER_USERNAME }}
    #     key: ${{ secrets.SERVER_SSH_KEY }}
    #     script: |
    #       docker pull user/paper-crawler:latest
    #       docker stop paper-crawler || true
    #       docker run -d -p 5173:5173 --name paper-crawler user/paper-crawler:latest
```

## Development Workflow Recommendations

### 1. Feature Branch Workflow
- Create feature branches from `main`
- Open pull requests for review
- CI runs automatically on PR
- Merge to `main` only after approval and passing CI
- CD deploys from `main` to production

### 2. Environment Variables Management
- Use `.env.example` template
- Never commit actual `.env` files
- In CI/CD, set secrets through platform UI (GitHub Secrets, Render env vars, etc.)
- Key secrets:
  - `ANTHROPIC_API_KEY` (for AI explanations)
  - Service-specific deploy tokens

### 3. Monitoring and Health Checks
Add to `serve.py` for better observability:
```python
# Add health check endpoint
elif path == '/api/health':
    self.handle_api_health()

def handle_api_health(self):
    """Health check endpoint"""
    self.send_response(200)
    self.send_header('Content-type', 'application/json')
    self.send_header('Access-Control-Allow-Origin', '*')
    self.end_headers()
    
    health = {
        'status': 'healthy',
        'timestamp': time.time(),
        'api_configured': ANTHROPIC_API_KEY is not None,
        'paper_count': len(list(Path("papers").glob("*.json"))) if Path("papers").exists() else 0
    }
    self.wfile.write(json.dumps(health).encode())
```

### 4. Testing Strategy
While the project doesn't require extensive testing due to its simplicity, consider adding:

#### Unit Tests (if expanding)
- Test `fetch_paper.py` functions with mock responses
- Test section detection logic with sample HTML
- Test IK calculations in isolation

#### End-to-End Tests (optional)
- Use Playwright or Cypress to test:
  - Paper loads correctly
  - Spider animates and moves
  - Clicking controls works
  - API calls succeed (with mock backend)

#### Paper Validation
Add script to verify downloaded papers:
```python
# verify_papers.py
import json
from pathlib import Path

def verify_papers():
    papers_dir = Path("papers")
    if not papers_dir.exists():
        print("No papers directory")
        return
    
    for json_file in papers_dir.glob("*.json"):
        try:
            with open(json_file) as f:
                data = json.load(f)
            required = ['title', 'authors', 'date', 'abstract', 'id']
            for field in required:
                if field not in data:
                    print(f"Missing {field} in {json_file}")
            html_file = papers_dir / f"{data['id']}.html"
            if not html_file.exists():
                print(f"Missing HTML for {data['id']}")
        except Exception as e:
            print(f"Error processing {json_file}: {e}")

if __name__ == "__main__":
    verify_papers()
```

## Considerations for This Project

### Why Minimal CI/CD Makes Sense
1. **No Build Step**: The project runs directly from source files
2. **Standard Library Only**: No npm/Python package dependencies to audit
3. **Simple Architecture**: Few moving parts reduce failure points
4. **Local-First Design**: Primary use case is personal/local deployment

### When to Invest in More Complex CI/CD
1. **Team Collaboration**: Multiple contributors need reliable integration
2. **Public Deployment**: Making the crawler publicly available increases reliability needs
3. **Feature Expansion**: Adding complex features (user accounts, persistence, etc.)
4. **Performance Requirements**: Need to ensure optimizations don't regress

### Paper-Specific Considerations
1. **Paper Downloads**: CI should not download papers on every run (wastes bandwidth, risks rate limiting)
   - Cache downloaded papers in CI or use pre-existing test papers
   - Or mock the download process in tests
   
2. **AI API Usage**: CI should avoid real API calls to prevent costs
   - Use `?mock` mode in tests
   - Or mock the `/api/explain` endpoint

3. **Cache Directory**: Should be excluded from version control and CI artifacts
   - Already covered by `.gitignore`
   - CI workflows should avoid caching the `cache/` directory unnecessarily

## Sample .github Directory Structure

```
.github/
├── workflows/
│   ├── ci.yml          # Continuous Integration
│   └── cd.yml          # Continuous Deployment
└── ISSUE_TEMPLATE/
    ├── bug_report.md
    └── feature_request.md
```

## Quick Start for CI/CD Setup

1. **Create GitHub Repository** (if not already)
2. **Add .github/workflows/ci.yml** with the CI workflow above
3. **Set up repository secrets** for deployment:
   - For Render: `RENDER_SERVICE_ID`, `RENDER_API_KEY`
   - For Docker: `DOCKER_USERNAME`, `DOCKER_PASSWORD`
   - For API: `ANTHROPIC_API_KEY` (if deploying with AI features)
4. **Enable GitHub Actions** in repository settings
5. **Make a test push** to see CI run
6. **Add CD workflow** when ready to automate deployment

## Maintenance Tips

1. **Update Linter Rules** periodically as best practices evolve
2. **Monitor CI Duration** - keep it fast (<5 minutes ideal)
3. **Use Caching** in CI for dependencies when adding them
4. **Implement Retry Logic** for flaky tests if any are added
5. **Document Deployment Process** in README for manual fallback

## Conclusion

While Paper Crawler's simplicity means it doesn't require an elaborate CI/CD pipeline, implementing basic CI ensures code quality and prevents regressions. The provided workflows offer a solid starting point that can be expanded as the project grows. Remember that the goal of CI/CD is to reduce risk and increase confidence in changes - tailor the complexity to your actual needs and team size.