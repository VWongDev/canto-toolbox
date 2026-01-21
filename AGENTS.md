# Agent Documentation

This directory contains documentation for AI agents working with this codebase.

## Available Documentation

- [Git Conventions](.agents/git-conventions.md) - Commit message format, branch naming, and git workflow conventions
- [Architecture Overview](.agents/architecture.md) - Overall codebase structure, component responsibilities, and data flow

## Quick Reference

### Commit Message Format
```
type(domain): Description
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ai`

Common domains: `manifest`, `icons`, `background`, `content`, `popup`, `stats`, `dict`, `api`, `global`

### Key Components
- **Content Script** (`content.js`): Hover detection and popup display
- **Background Worker** (`background.js`): Dictionary lookups and statistics
- **Dictionary Loader** (`dictionary-loader.js`): Local dictionary file access
- **Statistics Page** (`stats.html/js/css`): Word frequency display

### Dictionary Data
- Dictionary files are stored in the `dictionaries/` submodule
- Uses CC-CEDICT (Mandarin) and CC-CANTO (Cantonese) dictionaries
- Files are loaded locally (no API calls required)
