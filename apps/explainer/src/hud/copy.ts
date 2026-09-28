/**
 * Copies `text` to the clipboard, or, where there is none (an insecure context, an older
 * browser) or access is refused, shows it to copy by hand. Resolves true once the clipboard
 * holds it.
 */
export async function copyOrShow(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
  show: (text: string) => void,
): Promise<boolean> {
  try {
    if (!clipboard) throw new Error("no clipboard");
    await clipboard.writeText(text);
    return true;
  } catch {
    show(text);
    return false;
  }
}
