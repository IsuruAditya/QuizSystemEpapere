# Accessibility report

Target: **WCAG 2.2 Level AA** for student and administrator journeys. This is a target, not a conformance claim. Automated checks pass on the screens listed below. Manual assistive-technology testing has **not** been done yet.

## What was checked (20 Nov 2026)

| Check | Scope | Tool / browser | Result |
|---|---|---|---|
| axe-core (wcag2a, 2aa, 21a, 21aa, 22aa); fail on serious/critical | login, student dashboard, exam landing, attempt screen; **light and dark** themes | @axe-core/playwright 4.14 on Chromium 1255, desktop 1280×720 and Pixel 5 (393×851) | **Pass** (no serious/critical violations) |
| Keyboard operation of answers | attempt screen: Tab to the option group, Space selects, Arrow keys move the selection | Playwright, both viewports | **Pass** |
| Narrow-screen reflow (no horizontal scroll) | attempt screen with Sinhala text | Pixel 5 viewport | **Pass** |
| `lang` metadata | `<html lang="si">` by default, `en` after the toggle; admin area marked `lang="en"` | E2E assertion + code | **Pass** |
| Offline status announced | status region updates text (Sinhala) when offline and again on reconnect | E2E | **Pass** |
| Full journey | admin import→publish; student start→save→refresh→submit→result→leaderboard | Playwright desktop | **Pass** (functional; axe not run on every step) |

## Design measures

- Native controls: radio inputs for answers (stretched over the whole option card: ≥ 56 px tall targets), `<button>`, `<dialog>` for the submit check, `<fieldset>/<legend>` for each question.
- Visible focus: 3 px outline in both themes. Option cards show focus with `:has(:focus-visible)`.
- State is never shown by colour alone: a ✓ in the selected badge, ✓/✗/○ text in review, "Saved" text plus an icon, ⚑ plus the text "Flagged".
- Status messages: the save status is `role="status"` (polite). Time warnings are announced once at 5 and 1 minute (`role="alert"`), never every second; the visual countdown is `aria-hidden` and a screen-reader text gives the minutes left.
- Math: KaTeX output includes MathML for assistive technology. Images use admin-entered alt text, which publication requires for image-only content.
- Reduced motion: transitions are disabled under `prefers-reduced-motion`.
- Sinhala: line height 1.65 and system Sinhala fonts (Noto Sans Sinhala / Iskoola Pota / Nirmala UI) to avoid clipped vowel signs; text wraps.
- Colour contrast: brand #3E3A98 on white and the dark-theme tokens are checked by axe on the screens above.

## Not yet verified (must be done before claiming AA)

1. **Manual screen-reader passes**: NVDA + Chrome (Windows), TalkBack + Chrome (Android), VoiceOver + Safari (iOS) over the full attempt journey, including the submit dialog, reconnect, time-up and result review.
2. axe on **admin screens**, the **result/review** page and the **leaderboard** page.
3. Real older mid-range Android devices and Safari/Firefox (only Chromium was automated).
4. 200 % / 400 % zoom checks on the attempt screen.
5. Focus restoration after the submit dialog closes in all browsers (implemented: focus returns to "Review and submit").

## Timing (WCAG 2.2.1) — owner decision needed

- **Ranked exams** are timed assessments; the time limit is essential to comparable ranking (the 2.2.1 "essential" exception). Students see the duration and rules before starting, and late starters are warned they get less time.
- **Practice exams** can be configured **untimed**, which is implemented and tested.
- **Extra-time accommodations are not implemented** (Post-MVP). If the institute needs them, the planned design is a per-attempt effective deadline set by an admin and audited, without changing the marks-first/time-second ranking rule and without showing the reason publicly. The institute must decide the policy, in particular how accommodated attempts appear on leaderboards, before launch.
- Session timeout (12 h) is far longer than any exam, and expiry does not lose saved answers.
