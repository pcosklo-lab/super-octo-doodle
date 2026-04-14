# 315 Realty — Website

A static, modern website showcasing 315 Realty's properties across Pennsylvania and Florida.

## Structure

```
website/
├── index.html          # Homepage with PA & FL buttons
├── pennsylvania.html   # Pennsylvania properties page
├── florida.html        # Florida properties page
├── styles.css          # All styling
└── images/
    ├── pennsylvania/   # Drop PA property photos here
    └── florida/        # Drop FL property photos here
```

## Viewing Locally

Just open `index.html` in a browser, or run any static server:

```bash
cd website
python3 -m http.server 8000
# visit http://localhost:8000
```

## Adding a Property

1. Drop the photo into `images/pennsylvania/` or `images/florida/`.
2. Open the matching state HTML file.
3. Inside `<div class="properties-inner">`, add a `<article class="property-card">` block using the commented template at the bottom of the file.
4. Remove the `<div class="empty-state">` block once the first property is added.
