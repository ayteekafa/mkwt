# MKWT Dropdown And Picker Standard

## Purpose
This document defines the expected MKWT dropdown, picker, filter, and custom select behavior.
Use it before adding or changing any new input that opens a menu, panel, popup, listbox, track picker, clan picker, chart filter, result picker, or placement selector.

The visual and interaction reference is the Lounge 12p/24p picker system. New UI must feel like the existing Lounge and World Wide Tracker controls, not like a native browser select and not like a separate custom system.

## Source Of Truth
- Prefer the Lounge picker pattern from `lounge.js` and `lounge.css`.
- Use existing MKWT classes where possible:
  - `trackPicker`
  - `loungePicker`
  - `trackPicker__trigger`
  - `trackPicker__panel`
  - `trackPicker__layout`
  - `trackPicker__letterRail`
  - `trackPicker__trackArea`
  - `trackPicker__groups`
  - `trackPicker__option`
  - `trackPickerBackdrop`
  - `loungePickerBackdrop`
  - `trackPickerScrollLocked`
- Do not invent a new dropdown design unless the existing Lounge pattern cannot support the use case.

## Visual Standard
- The closed input is a large MKWT button-like field with the same radius, border, background, text weight, and chevron style as Lounge.
- The open panel uses the same dark card surface, border color, blur/dim background, spacing, and active states as Lounge.
- Options must be easy to scan:
  - track options include track icons when available
  - text must not be squeezed into vertical letters
  - long names may wrap naturally, but the option must keep a stable usable shape
  - badges such as `Repick` must not break or compress the track name
- No native browser select dropdown should be visible for polished app inputs.
- No permanent suggestion row should sit under an input. Suggestions belong inside the opened panel.

## Opening Behavior
- Clicking or tapping the trigger opens one panel.
- Opening one picker closes other open pickers.
- On mobile, the panel is centered and sized to fit the viewport.
- On desktop, the panel should also be centered or aligned consistently with the Lounge picker.
- The page behind the picker is scroll-locked while the picker is open.
- Opening must feel instant. Do not do heavy data work after the tap if it can be prepared earlier.

## Backdrop, Blur, And Layering
- Use the MKWT picker backdrop style for focused picker interactions.
- The background may dim or blur, but the active picker and any inline error inside the active dialog must stay readable above that layer.
- Toasts and temporary error messages must not be hidden behind blur, overlays, or modals.
- Do not open a second modal inside a picker if the intended interaction is a dropdown panel. For example, `Choose clan` opens a clan picker panel in the same dialog, not another popup.

## Closing Rules
A picker should close only when one of these happens:
- the user selects a final option
- the user clicks an explicit close/cancel action when the flow has one
- the user presses Escape
- the user clicks or taps outside the visible picker panel

A picker must not close when the user:
- clicks inside the visible panel background
- clicks between option cards
- clicks the letter rail
- drags over the letter rail
- scrolls the option list
- clicks a filter/search input inside the panel
- clicks inside empty space that is still inside the panel bounding box

When implementing outside-click behavior, check both DOM containment and the visible panel rectangle. Some panel gaps are not child option elements, but they are still inside the picker.

## Scroll And Touch Behavior
- The page behind the picker must stay locked.
- The option area scrolls internally when content is taller than the panel.
- Mouse wheel over the panel scrolls the panel content, not the page behind it.
- Touch drag over the option area scrolls the option area.
- Touch drag or mouse drag over the letter rail changes the active letter, like Lounge.
- Letter rail drag behavior:
  - `pointerdown` on a letter starts letter selection
  - `pointermove` updates the active letter while dragging
  - `pointerup` and `pointercancel` stop selection
  - use `touch-action: none` on the letter rail so mobile swipe works reliably
- The letter rail should be usable with a mouse on desktop and a finger on mobile.

## Letter Rail And Filtering
- Track pickers with many options must include a letter rail.
- The first filter is always `All`.
- If Intermission is present, show the special `IM!` rail button.
- Active filter state must be visually clear.
- Clicking a letter filters options immediately.
- Dragging across letters filters options immediately.
- Keyboard typing a letter should filter when focus is inside the open picker and the user is not typing in a text input.
- Keyboard letter shortcuts must work from the open picker, its trigger, panel background, and letter rail; for example pressing `C` activates the `C` rail filter without closing the picker.
- Enter/Space on a focused letter rail button activates that filter, and Enter/Space while a letter filter is active resets the rail to `All` unless focus is on an option or trigger.
- Filtering must not close the picker.
- If the current filter becomes invalid after options change, reset to `All`.

## Searchable Pickers
Use this for clans, profile icons, combo choices, and other large non-track datasets.

- The trigger says what will be selected, for example `Choose clan`.
- Opening shows a panel with:
  - optional search input
  - optional letter rail
  - grouped or filtered results
  - empty state if no results match
- Search and letter filters work together.
- Suggestions appear inside the panel, not permanently below the input.
- A wrong password, validation error, or missing selection message appears inside the active dialog or as a normal MKWT toast, visible above blur.

## Track Picker Rules
- Use the Lounge track picker structure for all track-like inputs.
- Include track icons.
- Preserve repick information in data and styling.
- Repick styling must not damage layout or force the track name into narrow vertical text.
- For 6v6, repicks/intermissions can be logged as visible mistakes when the flow allows it, but the UI must mark them without breaking the option card.
- For 6v6v6v6 and Lounge 24p intermissions, use the same filtered start/destination logic as Lounge 24p and World Wide Tracker.
- Intermission destination choices must be limited by the selected start track when rules require that.
- If a special destiny name exists, show it clearly in the race entry area or option context.

## Result And Placement Pickers
- Result entry should not become six separate unrelated dropdown systems if the intended UI is a single result picker.
- A single `Result` field may open a picker where the user selects the required placements.
- The selected count and validation must be clear.
- The picker should close only after the user confirms, selects the required final value, or cancels.

## Keyboard And Accessibility
- Triggers are real buttons.
- Panels use `role="listbox"` where appropriate.
- Options use `role="option"` and update `aria-selected`.
- Triggers update `aria-expanded`.
- Escape closes the open picker.
- Enter/Space activates focused buttons and options.
- Focus returns to the trigger after selecting an option.
- Disabled options must be visually and semantically disabled.

## Mobile Requirements
- Touch targets are large enough for fast tapping.
- The panel never overflows off-screen horizontally.
- Text never overlaps or gets compressed into unreadable vertical stacks.
- The panel uses internal scrolling and keeps the page behind locked.
- The letter rail can be swiped.
- The panel should feel like a focused app control, not a browser default popup.

## Empty, Loading, And Error States
- Empty state text should look intentional, not broken.
- Loading state should be inside the panel when the list is loading.
- Errors should be short, human-readable, and visible.
- Avoid raw technical errors in the UI.
- Use existing MKWT toast/dialog helpers where possible.

## Implementation Checklist
Before finishing a new dropdown or picker:
- It reuses the Lounge picker pattern or deliberately documents why not.
- It has the correct closed trigger style.
- It opens with backdrop and scroll lock.
- It does not close when clicking gaps inside the panel.
- It closes on outside click, Escape, and final selection.
- It supports mouse and touch.
- If it has a letter rail, click and drag both work.
- If it has search, suggestions stay inside the panel.
- Options are readable on 390px mobile width.
- Long names and badges do not break layout.
- Console has no errors after opening, filtering, scrolling, selecting, and closing.
- If cached files changed, `sw.js` cache version is bumped.

## Verification Checklist
Test each changed picker on:
- desktop around 1440x900
- mobile around 390x844

Minimum manual flow:
- open picker
- click inside empty panel space
- click between two option cards
- scroll option list with wheel
- scroll option list with touch
- click letter rail buttons
- drag over letter rail with mouse
- swipe over letter rail with touch
- select an option
- reopen and press Escape
- click outside visible panel
- check console errors
