# Skeleton screen standard

CampusOne uses [Boneyard](https://boneyard.vercel.app/overview) as the default skeleton-screen system for current and future screens.

- Wrap real screen content with `BoneScreen` from `src/components/admin-ui/Feedback.tsx`.
- Give each screen a stable, route-level name such as `dashboard`, `students-list`, or `attendance-overview`.
- Keep a meaningful fallback for first run and environments where the generated registry is not present.
- Generate responsive bones from the dev capture surface with `npm run build:bones` after adding or materially changing a screen. The capture route is `/__boneyard` and is available only in development.
- Add the screen’s stable `name` to `BoneyardCapturePage.tsx` when introducing a new bespoke loader so the registry stays complete.

The Boneyard configuration lives at the repository root in `boneyard.config.json`.
