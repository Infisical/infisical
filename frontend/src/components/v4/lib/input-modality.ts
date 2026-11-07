/**
 * The input that started the current interaction. A keydown makes it keyboard and a pointerdown
 * makes it pointer; Escape keeps it, so closing a menu returns focus with the modality that opened it.
 */
let modality: "keyboard" | "pointer" = "pointer";
if (typeof document !== "undefined") {
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") modality = "keyboard";
    },
    true
  );
  document.addEventListener(
    "pointerdown",
    () => {
      modality = "pointer";
    },
    true
  );
}

export const keyboardModality = () => modality === "keyboard";
