# Prompt template: add a frontend component

Use for a new component on the trade blotter frontend.

```
Add `<ComponentName>` to frontend/src/components/.

- Props interface typed against shared/src/trade.ts and/or shared/src/schemas.ts where the
  component touches trade data — don't redefine Trade-shaped types locally.
- Server state (list/create/amend/cancel) goes through useTrades (frontend/src/hooks/useTrades.ts)
  — never fetch() directly from a component.
- Any hand-written Tailwind base selector belongs in globals.css under @layer base, not in the
  component — components should only use utility classes.
- Icons: lucide-react, centered via flex/mx-auto (not text-align — preflight makes <svg> block).
- Cover default, loading, empty, error, and disabled states as applicable.
- Add a React Testing Library test in frontend/test/ covering the interactive states, not just a
  snapshot.
```
