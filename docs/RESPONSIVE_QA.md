# Responsive browser QA

## Setup

Run the local static app with `npm.cmd run dev` and open it in Chrome. The recorded pass used local Chrome DevTools viewport emulation; it is not a physical-device test.

## Viewports and screens

The pass checked the home screen, AI Lab, Statistics, Settings, How to Play, and a live Beginner match at each viewport:

| Viewport | Home | Lab | Statistics | Settings | How to Play | Live match |
|---|---|---|---|---|---|---|
| 320 × 740 | Pass | Pass | Pass | Pass | Pass | Pass |
| 360 × 800 | Pass | Pass | Pass | Pass | Pass | Pass |
| 390 × 844 | Pass | Pass | Pass | Pass | Pass | Pass |
| 430 × 932 | Pass | Pass | Pass | Pass | Pass | Pass |
| 768 × 1024 | Pass | Pass | Pass | Pass | Pass | Pass |
| 1024 × 768 | Pass | Pass | Pass | Pass | Pass | Pass |
| 1440 × 900 | Pass | Pass | Pass | Pass | Pass | Pass |

The setup modal was also opened at each viewport. No page or modal had horizontal document overflow after the fix. Both match canvases rendered; touch controls were available from 320–430 px and hidden at tablet/desktop widths. The browser smoke observed no JavaScript exceptions.

## Fixes found during the pass

At 768 px, the rotated `.orbit-a` illustration extended 14 px past the viewport. The art container now clips overflow only between 681 and 900 px. A screenshot review also found that the home screen's `feature-link` button had the browser's default white button background; it now shares the reset used by the other navigation buttons.

The 768 px screenshot is available as a temporary local artifact under `.test-tmp/responsive-768.png`; generated QA artifacts are ignored and not part of the site build.

## Remaining scope

Viewport emulation verifies CSS breakpoints, layout and touch controls' presence. A real phone/tablet pass is still needed to assess physical touch feel, browser chrome, and device-specific rendering.
