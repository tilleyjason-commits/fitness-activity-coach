Read MACRO_TRACKER_SPEC.md carefully. Also read src/lib/types.ts, src/lib/constants.ts, src/lib/supabase.ts, src/lib/db.ts, src/lib/evaluate.ts, src/components/NavBar.tsx, src/App.tsx, src/pages/LogNutrition.tsx, and rules/rules.json to understand the existing codebase.

Build the complete Macro Tracker feature per the spec. Create ALL of these file changes:

NEW FILES:
1. supabase/functions/calculate-macros/index.ts - Edge Function
2. src/pages/MacroTrackerPage.tsx - Full macro page
3. src/components/MealCard.tsx - Single meal card
4. src/components/DayMacroSummary.tsx - Daily totals summary

MODIFIED FILES:
5. src/lib/types.ts - Add MealLog, MealFood, MacrosFromAI, MealSlot types
6. src/lib/constants.ts - Add meal slot constants
7. src/lib/db.ts - Add meal CRUD functions and syncDailyTotals
8. src/components/NavBar.tsx - Add Macros tab
9. src/App.tsx - Add /macros route
10. src/pages/LogNutrition.tsx - Add link to macro tracker

IMPORTANT IMPLEMENTATION DETAILS:
- The Edge Function calls NVIDIA NIM API at https://api.nvcf.nvidia.com/v1/chat/completions with model glm-5.2
- It reads the API key from env.NVIDIA_API_KEY (set via Supabase secrets)
- The function parses GLM-5.2 JSON response, never calls a database
- Use fetch() in Deno for the NVIDIA API call
- The frontend calls the Edge Function with supabase.functions.invoke('calculate-macros', { body: { description, meal_slot } })
- syncDailyTotals() queries meal_logs, sums totals, then updates daily_logs
- MealCard has 5 states: idle, calculating, results, saved, error
- When meals are saved, the MacroTrackerPage should show updated daily totals in the summary bar
- The NavBar uses the existing tab pattern (Icons, labels, paths)
- Use the Supabase client that already exists
- TypeScript strict, no any

After creating all files, run npm run build and fix any TypeScript errors.

CRITICAL: 
- supabase/functions/calculate-macros/index.ts is a Deno file (TypeScript, but Deno imports not npm)
- All other files are Vite/React/browser
- Use existing CSS patterns from the app (Tailwind classes)
- Use existing component patterns (NavBar, PageHeader, etc.)
- For the MealCard editable fields, use simple input elements styled with Tailwind
- The calculate button should show a loading spinner while waiting for the AI