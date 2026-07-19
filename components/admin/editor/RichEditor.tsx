"use client";
/* TipTap rich-text editor for the EDITOR desk — a proven ProseMirror
   editor, never a hand-rolled contentEditable. The feature set mirrors
   the server sanitizer exactly (paragraphs, H2/H3, bold, italic, lists,
   blockquote, safe links, inline images, undo/redo); anything else is
   stripped again server-side, which remains the contract. */
import { forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { isAllowedLinkHref } from "@/lib/editor/doc";

export interface RichEditorHandle {
  getContent: () => object | null;
  setContent: (json: object) => void;
  insertImage: (attrs: { src: string; alt: string; attribution: string; caption: string; mediaId: string }) => void;
}

const EditorImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alt: { default: "" },
      attribution: { default: "" },
      caption: { default: "" },
      mediaId: { default: null },
    };
  },
});

const INK = "#1D1913";
const CREAM = "#F6F1E6";

const tbBtn = (active: boolean): React.CSSProperties => ({
  border: `1.5px solid ${INK}`,
  borderRadius: 7,
  minWidth: 34,
  height: 32,
  padding: "0 8px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  background: active ? INK : "#fff",
  color: active ? CREAM : INK,
});

const RichEditor = forwardRef<RichEditorHandle, { allowImages: boolean; onDirty: () => void; onAddImage: () => void }>(
  function RichEditor({ allowImages, onDirty, onAddImage }, ref) {
    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          codeBlock: false,
          code: false,
          horizontalRule: false,
          strike: false,
          underline: false,
          link: false,
        }),
        Link.configure({
          openOnClick: false,
          autolink: false,
          protocols: ["http", "https"],
        }),
        ...(allowImages ? [EditorImage] : []),
      ],
      content: { type: "doc", content: [{ type: "paragraph" }] },
      onUpdate: () => onDirty(),
    });

    useImperativeHandle(
      ref,
      () => ({
        getContent: () => (editor ? editor.getJSON() : null),
        setContent: (json: object) => {
          editor?.commands.setContent(json, { emitUpdate: false });
        },
        insertImage: (attrs) => {
          editor?.chain().focus().insertContent({ type: "image", attrs }).run();
        },
      }),
      [editor]
    );

    if (!editor) {
      return <div className="font-mono" style={{ fontSize: 11, letterSpacing: ".12em", color: "rgba(29,25,19,.55)" }}>LOADING EDITOR…</div>;
    }

    const setLink = () => {
      const prev = (editor.getAttributes("link").href as string) ?? "";
      const href = window.prompt("Link URL (https://… or a site path like /land):", prev);
      if (href === null) return;
      if (!href.trim()) {
        editor.chain().focus().unsetLink().run();
        return;
      }
      if (!isAllowedLinkHref(href.trim())) {
        window.alert("Only https://, http://, site-relative (/…), or #anchor links are allowed.");
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
    };

    return (
      <div>
        <div role="toolbar" aria-label="Formatting" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <button type="button" title="Bold" aria-label="Bold" onClick={() => editor.chain().focus().toggleBold().run()} style={tbBtn(editor.isActive("bold"))}>
            B
          </button>
          <button type="button" title="Italic" aria-label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} style={{ ...tbBtn(editor.isActive("italic")), fontStyle: "italic" }}>
            I
          </button>
          <button type="button" title="Heading 2" aria-label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} style={tbBtn(editor.isActive("heading", { level: 2 }))}>
            H2
          </button>
          <button type="button" title="Heading 3" aria-label="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} style={tbBtn(editor.isActive("heading", { level: 3 }))}>
            H3
          </button>
          <button type="button" title="Bulleted list" aria-label="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()} style={tbBtn(editor.isActive("bulletList"))}>
            • List
          </button>
          <button type="button" title="Numbered list" aria-label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} style={tbBtn(editor.isActive("orderedList"))}>
            1. List
          </button>
          <button type="button" title="Block quote" aria-label="Block quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} style={tbBtn(editor.isActive("blockquote"))}>
            ❝
          </button>
          <button type="button" title="Link" aria-label="Link" onClick={setLink} style={tbBtn(editor.isActive("link"))}>
            🔗
          </button>
          {allowImages && (
            <button type="button" title="Add image" aria-label="Add image" onClick={onAddImage} style={tbBtn(false)}>
              🖼 Image
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" title="Undo" aria-label="Undo" onClick={() => editor.chain().focus().undo().run()} style={tbBtn(false)}>
            ↶
          </button>
          <button type="button" title="Redo" aria-label="Redo" onClick={() => editor.chain().focus().redo().run()} style={tbBtn(false)}>
            ↷
          </button>
        </div>
        <div
          style={{ border: `2px solid ${INK}`, borderRadius: 12, background: "#fff", padding: "14px 16px", minHeight: 260 }}
          className="ed-rich ed-editing"
        >
          <EditorContent editor={editor} />
        </div>
        <p className="font-mono" style={{ fontSize: 9, letterSpacing: ".06em", color: "rgba(29,25,19,.55)", lineHeight: 1.8, marginTop: 6 }}>
          ALLOWED: PARAGRAPHS · H2/H3 · BOLD · ITALIC · LISTS · QUOTES · SAFE LINKS{allowImages ? " · IMAGES" : ""} · UNDO/REDO.
          EVERYTHING IS RE-VALIDATED SERVER-SIDE ON SAVE AND AGAIN ON PUBLISH.
        </p>
      </div>
    );
  }
);

export default RichEditor;
