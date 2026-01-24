# Git Conventions

This repository follows semantic commit message conventions.

## Commit Message Format

All commit messages follow the format:

```
type(domain): Description
```

### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ai`: AI-related changes or documentation (use when modifying files in `.agents/` directory or AI-specific files)

### Domain

The domain specifies the area of the codebase affected:
- `manifest`: Extension manifest configuration
- `icons`: Extension icons
- `background`: Background service worker
- `content`: Content script
- `popup`: Popup UI components
- `stats`: Statistics page
- `dict`: Dictionary-related functionality
- `api`: API integration
- `global`: Repository-wide changes

Multiple domains can be specified when a change affects multiple areas (e.g., `refactor(content, stats)`). If more than 3 domains would be specified, use `global` instead.

### Description

- Start with a capitalized verb (e.g., "Add", "Fix", "Implement")
- Use present tense
- Be concise but descriptive
- Use a single sentence
- Avoid commas
- No period at the end

### Examples

```
feat(manifest): Add extension manifest configuration
fix(icons): Add blank placeholder icons for extension loading
feat(background): Implement dictionary API and statistics tracking
fix(api): Improve error handling and logging for API failures
refactor(content, stats): Extract shared pronunciation section utilities
ai(global): Add agent documentation files
```

## Branch Naming

- Use descriptive branch names
- Prefer kebab-case
- Include issue number if applicable: `fix-123-description`

## Commit Guidelines

1. Make atomic commits - each commit should represent a single logical change
2. Write clear, descriptive commit messages
3. Reference related issues when applicable
4. Keep commits focused on one domain when possible
5. Use multiple domains when a change affects multiple areas (e.g., `refactor(content, stats)`)
6. Use `global` domain if more than 3 domains would be specified
