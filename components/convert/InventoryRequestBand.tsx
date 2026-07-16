/* Compact neighborhood-inventory request — restrained repetition: a slim
   anchor back to the page's single CuratedHomes panel rather than a second
   form on the same page. */
export default function InventoryRequestBand({ hoodName, targetId }: { hoodName: string; targetId: string }) {
  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "6px 4vw 30px" }}>
      <a
        href={`#${targetId}`}
        className="link-underline font-mono"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".18em",
          color: "#C13E17",
          textDecoration: "none",
          border: "1.5px dashed rgba(217,72,31,.5)",
          borderRadius: 999,
          padding: "11px 18px",
        }}
      >
        WANT THE CURRENT {hoodName.toUpperCase()} INVENTORY PICTURE? REQUEST IT ↑
      </a>
    </div>
  );
}
