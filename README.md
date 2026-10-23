# StreamClarify project page

Website for **StreamClarify: Proactive Clarification for Grounded Streaming Video Question Answering**, WACV 2027.

The site is static HTML, CSS, JavaScript, and local media. It requires no backend, API key, or model installation. Recorded examples use simulated replies; the page describes the experimental conditions.

## Preview

```bash
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`.

## Update

Edit `dist/`. After changing the benchmark example data, rebuild its HTML:

```bash
python3 tools/build_benchmark.py
python3 tools/check_site.py
```

## Deploy

In repository **Settings → Pages → Build and deployment**, select **GitHub Actions**. Push changes to `main`, or run **Deploy StreamClarify project page** from Actions. Only `dist/` is published.

The project URL is `https://zhuchens-uiuc.github.io/StreamClarify-page/`.

Website code is licensed under Apache-2.0. Paper figures and benchmark media retain their respective rights and source attribution.

The University of Illinois Urbana-Champaign wordmark is provided by the [official university brand resources](https://web.brand.illinois.edu/logos/). University marks retain their respective rights.
