# Project Colors for bb

Give each project in the bb sidebar one of seven colors: red, orange, yellow,
green, blue, purple, or pink.

## Install

Install the latest version from the repository's default branch:

```sh
bb plugin install https://github.com/ninjasweb/bb-project-colors
```

For tagged releases, install a compatible semantic-version range:

```sh
bb plugin install git:https://github.com/ninjasweb/bb-project-colors.git@^0.1.0
```

Update an existing installation with:

```sh
bb plugin update project-colors
```

## Use

1. Hover over a project in the sidebar.
2. Select the small color dot beside its existing actions.
3. Choose a color.

Select the active color again to return the project to bb's default styling.
Choices are stored locally in each bb client, so every desktop or browser can
have its own visual organization.

The chosen color appears as a square, translucent project heading, softly
tints every thread nested under that project, and adds a matching dot before
the active conversation title.

## Develop

```sh
npm ci
npm test
npm run typecheck
npm run build
bb plugin install .
```
