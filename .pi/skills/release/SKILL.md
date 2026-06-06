---
name: release
description: Draft a release by bumping package.json and updating CHANGELOG.md. Use when committed changes are ready to ship from main.
disable-model-invocation: true
---

# Release

## Important

- **Do NOT create or push git tags.** `.github/workflows/release.yml` creates and pushes `vX.Y.Z` automatically when the version bump lands on `main`.
- **Only modify `CHANGELOG.md` and `package.json`.** Do not touch any other files.
- Stage only the release files explicitly: `git add -- CHANGELOG.md package.json`. Never use `git add .` for a release.

## Steps

### 1. Pre-flight checks

1. Verify the current branch is `main`:

   ```sh
   git branch --show-current
   ```

   If it is not `main`, stop and tell the user to switch branches first.
2. Check for uncommitted changes:

   ```sh
   git status --short
   ```

   If the work tree is dirty, show the dirty paths and ask whether to ignore them. Continue only after explicit confirmation. Do not modify or stage unrelated dirty files.
3. Pull the latest `main` and tags:

   ```sh
   git pull --ff-only
   git fetch --tags --prune --force
   ```

### 2. Determine the current and next version

1. Read the current package version:

   ```sh
   jq -r .version package.json
   ```

2. List release tags, newest first:

   ```sh
   git tag --list 'v*' --sort=-v:refname
   ```

3. Use the newest `v*` tag as the latest release. Gather full commit data since that tag:

   ```sh
   git log <latest-tag>..HEAD --decorate=short --stat
   ```

   Use the full log rather than `--oneline` so commit bodies are available.
4. If there are no commits since the latest tag, stop and tell the user there is nothing to release.
5. Pim is pre-v1. Choose the bump from the actual nature of the changes, not only commit prefixes:
   - **Minor bump** (`0.x.0`) if any commit introduces new functionality or contains breaking changes.
   - **Patch bump** (`0.x.y`) for bug fixes, docs, CI, refactors, chores, and other non-feature changes.

### 3. Update `CHANGELOG.md`

Read `CHANGELOG.md` first. If it does not exist, create it.

The file must have a top-level heading followed by releases in reverse chronological order:

```markdown
# Changelog

## vX.Y.Z

### Features

- Description (#PR)

### Bug Fixes

- Description (commit-hash)

### Improvements

- Description (#PR)
```

Rules:

- Prepend the new `## vX.Y.Z` section above older releases.
- Omit category headings with no entries.
- Group entries as:
  - **Features** — new functionality or meaningful behaviour changes.
  - **Bug Fixes** — actual bug fixes.
  - **Improvements** — docs, CI, refactors, chores, formatting, dependency updates, and other maintenance work.
- Exclude version bump/release commits such as `chore: release vX.Y.Z` or `chore: bump version to vX.Y.Z`.
- Strip conventional commit prefixes from descriptions.
- Rephrase terse commit subjects into user-facing, capitalised descriptions. Use backticks for commands, filenames, flags, package names, and config keys.
- If a commit subject contains a PR number such as `(#10)`, use that as the reference. Otherwise use the 7-character short commit hash.

### 4. Bump `package.json`

Update only the `"version"` field to the new version string without the `v` prefix.

### 5. Review with the user

1. Show the release-file diff:

   ```sh
   git diff -- CHANGELOG.md package.json
   ```

2. Stage the release files only:

   ```sh
   git add -- CHANGELOG.md package.json
   ```

3. Show the staged diff:

   ```sh
   git diff --cached -- CHANGELOG.md package.json
   ```

4. Ask the user to confirm the release, including the version bump (for example, `0.2.2 → 0.3.0`). Wait for explicit confirmation.

### 6. Commit and push

After confirmation:

```sh
git commit -m "chore: release vX.Y.Z"
git push origin main
```

Do not tag. CI will run checks, create the tag, create the GitHub release, and publish to npm.
