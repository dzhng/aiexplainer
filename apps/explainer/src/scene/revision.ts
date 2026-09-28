/**
 * Scene revisions: the renderer re-uploads a scene whose `revision` changed. Every built scene
 * takes one from here, and so does a builder whose geometry changes after `create` (a new
 * prompt's pipes), so no two structures ever share a number.
 */
let revisions = 0;

export function nextRevision(): number {
  return ++revisions;
}
