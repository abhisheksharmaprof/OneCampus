# Academic structure integration

Import the feature-local entry point and mount it for the AC2 route:

```tsx
import { AcademicStructurePage } from './features/academics'

<AcademicStructurePage
  accessToken={session.accessToken}
  branches={dashboard.context.branches}
  selectedBranch={branch}
  teachers={teacherOptions}
/>
```

- Route target: `/academics/structure` (AC2, “Classes, Sections & Subjects”).
- `selectedBranch` accepts a branch UUID or `all`. It scopes section lists and defaults the section form; academic years, classes, and subjects remain institute-wide.
- `branches` must contain the active institute branches. Optional `teachers` should contain teacher user IDs (not staff-profile IDs), names, and branch IDs. Without it, sections can still be created and edited with an unassigned class teacher.
- The page owns no routing or shell state. The host should pass the same branch context used by `AppShell`.
- API requests use `/api/v1/admin/academics/{academic-years|classes|subjects|sections}` and require the existing bearer token. API validation messages and trace references are rendered in list and modal error states.
