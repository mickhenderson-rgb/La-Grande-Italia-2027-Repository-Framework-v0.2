# APS-003 – Development Standard

# Coding

- Vanilla JavaScript
- Readability first
- Small functions
- Feature ownership
- Minimal dependencies

# Build Standard

One feature per build.

Each build includes:
- Replacement files
- Test procedure
- Git commit
- Git tag

# Git

```bash
git status
git add .
git commit -m "Build X - Feature"
git tag -a vX.Y.Z -m "Build X"
```

# JSON

Store facts only.
Do not store calculated values.

# UI

- Card based
- Minimal clicks
- Inline editing
- Expandable sections
