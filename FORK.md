# Fork notes

This fork of [Hypfer/Valetudo](https://github.com/Hypfer/Valetudo) adds Mova V50 features:

- LiDAR auto-lowering and low-lying area cleaning frequency quirks
- Editable low-clearance areas in the map annotations editor

`master` is the main branch. Releases are built from it.

## Updater

The built-in updater fetches releases from this fork instead of upstream.
Don't switch the update provider to `github_nightly`, as that installs upstream nightly builds without the fork changes.

## Releasing

Tags follow `<upstream version>-v50.<n>`, e.g. `2026.10.0-v50.1`.

```sh
gh release create 2026.10.0-v50.1 --repo Tekpakma/Valetudo --target master --title "2026.10.0-v50.1" --notes "..."
```

Publishing the release starts the `Release` workflow. It uses the tag as version, builds all binaries
and attaches them together with the release manifest the updater needs.

Don't mark releases as pre-release, as the updater ignores those.

## Pulling in upstream

```sh
git remote add upstream https://github.com/Hypfer/Valetudo.git
git fetch upstream --tags
git merge 2026.11.0
```

Then run the tests and release `2026.11.0-v50.1`.
