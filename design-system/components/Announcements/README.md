# Announcements

What's new, as cards that cycle in a 480px dialog: each card has a media area, an eyebrow, a title, a line or two and an optional action, with dots, Back and Next underneath.

## You provide

- `items`: `[{ id, eyebrow, title, description, media?, action? }]`. `eyebrow` names the area and the date ("Secrets · Sep 24"). `action` is a link under the text (`{ label, href, external }` or `{ label, onClick }`): "Read the docs", "Share a secret".
- `media`: real components on the `tint` ground, made inert: the feature itself (an inline CommandMenu, a List row, an approval Item, a Snippet). Never an illustration, a photo or a gradient. Taller art is cut at the media area's bottom edge.
- `open` / `onOpenChange`; `onSeen(id)` as each card shows, to clear its unread count; `onDone` after Done on the last card.
- `index` / `onIndexChange` (or `defaultIndex`); `loop={false}` stops the arrows and swipes at the ends.

## Behavior

- Cards slide in the direction of travel over the slide curve, and the dialog eases to each card's height. Reduced motion jumps.
- Left and Right move and wrap around; on touch, a swipe does. Dots jump to a card; the current dot is a 12px ink bar. Next becomes Done on the last card, and Done closes.
- Screen readers hear the dialog as a carousel and "2 of 4" with the card's title on each change. Focus starts on Next.

## Rules

- Three to five cards, newest first, each about one change someone can use today.
- Titles say what people can now do ("Share a secret with a link that expires"), not the feature's name.
- Open it from a "What's new" row with a count of unseen cards, never on its own over someone's work.
