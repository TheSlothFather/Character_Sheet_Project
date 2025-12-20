# Style Tokens

## Core tokens (theme.css)
Core tokens describe raw values that can vary per theme. They live in
`client/src/styles/theme.css` under each theme selector.

**Categories**
- **Color:** `--color-*` (base colors) and convenience aliases like `--text`.
- **Typography scale:** `--font-size-xs` → `--font-size-2xl`.
- **Line height:** `--line-height-tight`, `--line-height-normal`, `--line-height-relaxed`.
- **Letter spacing:** `--letter-spacing-tight`, `--letter-spacing-normal`, `--letter-spacing-wide`.
- **Elevation:** `--shadow-1` → `--shadow-3`.
- **Radii:** `--radius-sm` → `--radius-xl`.
- **Spacing:** `--space-1` → `--space-8`.

Use these tokens for low-level styling in reusable primitives or when you need
precise control.

## Semantic tokens (design-tokens.css)
Semantic tokens map to UI intent and should be the default choice for component
styling. They live in `client/src/styles/design-tokens.css` and are set for each
theme.

**Required semantic tokens**
- `--text-heading`
- `--text-body`
- `--surface-card`
- `--surface-panel`
- `--border-subtle`
- `--focus-ring`

**Example usage**
```css
.card {
  background: var(--surface-card);
  color: var(--text-body);
  box-shadow: var(--shadow-1);
  border-radius: var(--radius-md);
}

.card:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
```

## Usage rules
- **Prefer semantic tokens** for component-level styles.
- **Only drop to core tokens** when you need values that semantic tokens do not
  cover.
- **Never hard-code colors** in component styles unless you are defining a new
  theme token.
