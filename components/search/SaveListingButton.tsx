"use client";
import { useShelf } from "@/lib/shelf";

/* The heart. Instant guest save + toast; the shelf context pops the soft
   account gate once after the first guest save. */
export default function SaveListingButton({
  listingKey,
  listPrice,
  standardStatus,
  size = 40,
}: {
  listingKey: string;
  listPrice: number;
  /** Current feed status — recorded as last_seen_status on save. */
  standardStatus?: string;
  size?: number;
}) {
  const shelf = useShelf();
  const saved = shelf.ready && shelf.isSaved(listingKey);
  return (
    <button
      type="button"
      aria-label={saved ? "Remove from your shelf" : "Save to your shelf"}
      aria-pressed={saved}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        shelf.toggleSave(listingKey, listPrice, standardStatus);
      }}
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: saved ? "#D9481F" : "#F6F1E6",
        color: saved ? "#F6F1E6" : "#1D1913",
        border: saved ? "1.5px solid #D9481F" : "1.5px solid #1D1913",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.44,
        cursor: "pointer",
        boxShadow: saved ? "0 8px 20px rgba(217,72,31,.4)" : undefined,
        transition: "all .18s",
        padding: 0,
      }}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
