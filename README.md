# Rolling Versions

Add changelogs to PRs and use them to determine the version of npm packages

It has no state of its own. The changelog for each PR is stored along with the corresponding PR (in a comment). The CLI tool will require a GitHub API token to read the changelog, and write to releases. It will require an npm token to publish to npm.

## Commercial Use

Rolling Versions is not free for comercial use. If you want to run your own version for commercial use, you can [buy a license](https://licensezero.com/offers/fd126855-9cba-457c-b444-db54f7a4f852). A hosted option is coming soon.

## Personal Open Source Use

Rolling Versions is free for non-commercial open source use. Just [install the GitHub app](https://github.com/apps/rollingversions) and add the CLI to your CI process.

## Terminology

- Publish Target - a destination we can publish to (e.g. GitHub Releases, NPM, Docker, Crates.io)
- Change Entry - a markdown title and body describing something that changed
- Change Type - breaking (major), feat (minor), refactor (minor), fix (patch), perf (patch)
- Change Set - a set of Change Entries categorised by their Change Type
- Package Manifest - the metadata about a package and where it gets published

## Database

To run database migrations, run `node scripts/db-migrate` and it will ask you for the connection string. To spinup a local database for testing you can use `yarn pg-test start` or even `yarn pg-test run -- yarn dev` to start the app with a temporary database.
